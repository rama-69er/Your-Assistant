package com.shimi.assistant.engine

import android.content.Context
import android.speech.SpeechRecognizer
import com.shimi.assistant.actions.AndroidActionExecutor
import com.shimi.assistant.actions.AppLauncher
import com.shimi.assistant.actions.DeviceControlManager
import com.shimi.assistant.bridge.ShimiWebBridge
import com.shimi.assistant.data.ActionResult
import com.shimi.assistant.data.AssistantConfig
import com.shimi.assistant.data.CommandParams
import com.shimi.assistant.data.InstalledAppRecord
import com.shimi.assistant.data.RobotState
import com.shimi.assistant.data.RoutedIntent
import com.shimi.assistant.data.SelfTestCheck
import com.shimi.assistant.data.SettingsRepository
import com.shimi.assistant.data.WakeWordSensitivity
import com.shimi.assistant.overlay.OverlayManager
import com.shimi.assistant.permissions.PermissionManager
import com.shimi.assistant.permissions.PrivacyManager
import com.shimi.assistant.tasks.TaskExecutor
import com.shimi.assistant.tasks.TaskPlanner
import com.shimi.assistant.tasks.TaskState
import com.shimi.assistant.tasks.TaskStep
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Native Android Assistant Core — operates completely independently of any WebView / PWA UI.
 * Two-stage audio pipeline:
 *   PASSIVE: WakeWordEngine listens offline on 16kHz PCM for custom wake word (e.g. "Milo").
 *   ACTIVE:  Pause wake word -> Floating Shimi LISTENING -> speak "Yes?" -> SpeechEngine ->
 *            TaskPlanner / IntentRouter -> TaskExecutor / AndroidActionExecutor -> TTS -> resume passive.
 */
object AssistantEngine {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var currentRobotState: RobotState = RobotState.IDLE

    @Volatile
    private var lastTranscript: String = ""

    @Volatile
    private var lastReply: String = ""

    @Volatile
    private var isActiveListening: Boolean = false

    private var settingsRepository: SettingsRepository? = null
    private var permissionManager: PermissionManager? = null
    private var privacyManager: PrivacyManager? = null
    private var wakeWordEngine: WakeWordEngine? = null
    private var speechEngine: SpeechEngine? = null
    private var ttsManager: TTSManager? = null
    private var intentRouter: IntentRouter? = null
    private var appLauncher: AppLauncher? = null
    private var actionExecutor: AndroidActionExecutor? = null
    private var taskExecutor: TaskExecutor? = null
    private var overlayManager: OverlayManager? = null
    private var bridgeRef: WeakReference<ShimiWebBridge>? = null

    private val pendingConfirmations = ConcurrentHashMap<String, RoutedIntent>()
    private val pendingTaskConfirmations = ConcurrentHashMap<String, String>()

    fun ensureInitialized(context: Context) {
        if (appContext != null) return
        val ctx = context.applicationContext
        appContext = ctx
        settingsRepository = SettingsRepository(ctx)
        permissionManager = PermissionManager(ctx)
        privacyManager = PrivacyManager(ctx)
        speechEngine = SpeechEngine(ctx)
        ttsManager = TTSManager(ctx)
        appLauncher = AppLauncher(ctx)
        val deviceControl = DeviceControlManager(ctx)
        actionExecutor = AndroidActionExecutor(ctx, appLauncher!!, deviceControl, permissionManager!!)
        taskExecutor = TaskExecutor(appLauncher!!) { planId, step ->
            emitTaskStep(planId, step)
        }
        intentRouter = IntentRouter(ctx, GeminiManager(ctx), privacyManager!!)
        overlayManager = OverlayManager(
            context = ctx,
            onBubbleTapped = { triggerManualListen() }
        )
        wakeWordEngine = WakeWordEngine(
            context = ctx,
            onWakeWordDetected = { matched, confidence, providerName ->
                onWakeDetected(matched, confidence, providerName)
            },
            onDebugTrace = { stage, summary, detail, ok ->
                emitDebugTrace(stage, summary, detail, ok)
            }
        )
    }

    fun attachBridge(bridge: ShimiWebBridge) {
        bridgeRef = WeakReference(bridge)
        bridge.pushStateSnapshot()
    }

    fun detachBridge() {
        // Destroying WebView detaches UI listeners ONLY; native service/wake-word/overlay keep running.
        bridgeRef = null
    }

    fun startBackgroundPipeline(context: Context) {
        ensureInitialized(context)
        val config = settingsRepository?.load() ?: AssistantConfig()
        val hasMic = permissionManager?.hasMicrophone() == true
        if (config.wakeWordEnabled && hasMic) {
            wakeWordEngine?.start(
                wakeWord = config.wakeWord,
                sensitivity = WakeWordSensitivity.fromWire(config.wakeWordSensitivity)
            )
        }
        if (config.floatingMode != "notification" && permissionManager?.hasOverlay() == true) {
            overlayManager?.show(config, currentRobotState)
        }
        updateRobotState(RobotState.IDLE)
        emitStateSnapshot()
    }

    fun stopBackgroundPipeline() {
        wakeWordEngine?.stop()
        speechEngine?.stopListening()
        ttsManager?.stop()
        overlayManager?.hide()
        isActiveListening = false
        updateRobotState(RobotState.SLEEPING)
        emitStateSnapshot()
    }

    fun applyConfig(config: AssistantConfig) {
        if (config.backgroundAssistantEnabled && config.wakeWordEnabled && permissionManager?.hasMicrophone() == true) {
            wakeWordEngine?.start(
                wakeWord = config.wakeWord,
                sensitivity = WakeWordSensitivity.fromWire(config.wakeWordSensitivity)
            )
        } else if (!config.wakeWordEnabled || !config.backgroundAssistantEnabled) {
            wakeWordEngine?.stop()
        }
        if (config.backgroundAssistantEnabled && config.floatingMode != "notification" && permissionManager?.hasOverlay() == true) {
            overlayManager?.show(config, currentRobotState)
        }
        overlayManager?.updateAppearance(config, currentRobotState)
        emitStateSnapshot()
    }

    private fun onWakeDetected(matched: String, confidence: Float, providerName: String) {
        val config = settingsRepository?.load() ?: AssistantConfig()
        emitDebugTrace(
            "WAKE_WORD",
            "Wake word \"$matched\" detected",
            "Provider: $providerName · Score: ${"%.2f".format(confidence)} · Pausing passive gate",
            true
        )
        emitEvent(
            "WAKE_WORD_DETECTED",
            JSONObject().put("wakeWord", matched).put("provider", providerName)
        )
        updateRobotState(RobotState.LISTENING)

        // Stage 2: short "Yes?" prompt then active SpeechRecognizer
        val muted = config.voiceOutputMode == "muted"
        if (muted) {
            triggerManualListen()
        } else {
            ttsManager?.speak(
                text = "Yes?",
                muted = false,
                onStart = { updateRobotState(RobotState.LISTENING) },
                onDone = { triggerManualListen() }
            )
        }
    }

    fun triggerManualListen() {
        val ctx = appContext ?: return
        ensureInitialized(ctx)
        if (permissionManager?.hasMicrophone() != true) {
            emitDebugTrace("SPEECH", "Microphone permission missing", "Grant RECORD_AUDIO in Setup Wizard.", false)
            updateRobotState(RobotState.SORRY)
            return
        }

        wakeWordEngine?.pause()
        ttsManager?.stop()
        isActiveListening = true
        updateRobotState(RobotState.LISTENING)
        emitEvent("LISTENING_STARTED", JSONObject().put("robotState", "LISTENING"))

        val config = settingsRepository?.load() ?: AssistantConfig()
        val preferOffline = true
        speechEngine?.startListening(
            preferOffline = preferOffline,
            onPartial = { partial ->
                lastTranscript = partial
                emitEvent("SPEECH_PARTIAL", JSONObject().put("transcript", partial))
            },
            onFinal = { transcript ->
                isActiveListening = false
                lastTranscript = transcript
                emitDebugTrace("SPEECH", "Recognized: \"$transcript\"", "Offline-first router started", true)
                emitEvent("SPEECH_FINAL", JSONObject().put("transcript", transcript))
                processCommand(transcript)
            },
            onError = { errMsg ->
                isActiveListening = false
                emitDebugTrace("SPEECH", "Speech recognition error", errMsg, false)
                updateRobotState(RobotState.CONFUSED)
                resumeWakeWordIfEnabled()
                emitEvent("ACTION_FAILED", JSONObject().put("message", errMsg))
            }
        )
    }

    fun stopListening() {
        speechEngine?.stopListening()
        isActiveListening = false
        updateRobotState(RobotState.IDLE)
        resumeWakeWordIfEnabled()
        emitStateSnapshot()
    }

    fun processCommand(utterance: String) {
        val config = settingsRepository?.load() ?: AssistantConfig()
        updateRobotState(RobotState.THINKING)
        val startMs = System.currentTimeMillis()
        val cleaned = LocalCommandEngine.stripWakeWord(utterance, config.name, config.wakeWord)

        scope.launch {
            // Check multi-step task plan first when Accessibility is enabled
            val multiPlan = if (permissionManager?.hasAccessibility() == true) {
                TaskPlanner.planIfMultiStep(cleaned, config.confirmConsequentialActions)
            } else {
                null
            }

            if (multiPlan != null && taskExecutor != null) {
                emitDebugTrace(
                    "INTENT",
                    "Multi-step plan: ${multiPlan.title}",
                    "${multiPlan.steps.size} steps scheduled via TaskExecutor",
                    true,
                    System.currentTimeMillis() - startMs
                )
                val taskResult = taskExecutor!!.execute(multiPlan)
                handleTaskResult(taskResult.state, taskResult.summary, taskResult.confirmationId, config)
                return@launch
            }

            // Single-step offline-first IntentRouter (local rules first, Gemini only if online & enabled)
            val routed = intentRouter?.route(utterance, config) ?: return@launch
            val routeMs = System.currentTimeMillis() - startMs
            emitDebugTrace(
                "INTENT",
                "${routed.intent} (${routed.category})",
                "Source: ${routed.source} · Reply: ${routed.spokenReply}",
                true,
                routeMs
            )

            if (routed.requiresConfirmation && config.confirmConsequentialActions) {
                val confId = "conf_${UUID.randomUUID()}"
                pendingConfirmations[confId] = routed
                lastReply = routed.confirmationPrompt ?: routed.spokenReply
                updateRobotState(RobotState.IDLE)
                emitEvent(
                    "CONFIRMATION_REQUIRED",
                    JSONObject()
                        .put("confirmationId", confId)
                        .put("intent", routed.intent)
                        .put("prompt", lastReply)
                )
                speakAndResume(lastReply, config)
                return@launch
            }

            executeAndRespond(routed, config)
        }
    }

    private fun handleTaskResult(
        state: TaskState,
        summary: String,
        confirmationId: String?,
        config: AssistantConfig
    ) {
        lastReply = summary
        when (state) {
            TaskState.WAITING_CONFIRMATION -> {
                if (confirmationId != null) {
                    pendingTaskConfirmations[confirmationId] = confirmationId
                }
                updateRobotState(RobotState.IDLE)
                emitEvent(
                    "CONFIRMATION_REQUIRED",
                    JSONObject()
                        .put("confirmationId", confirmationId ?: "")
                        .put("intent", "MULTI_STEP_TASK")
                        .put("prompt", summary)
                )
                speakAndResume(summary, config)
            }
            TaskState.COMPLETED -> {
                updateRobotState(RobotState.SUCCESS)
                emitEvent(
                    "ACTION_COMPLETED",
                    JSONObject()
                        .put("intent", "MULTI_STEP_TASK")
                        .put("status", "executed")
                        .put("ok", true)
                        .put("spokenReply", summary)
                        .put("robotState", "SUCCESS")
                )
                speakAndResume(summary, config)
            }
            else -> {
                updateRobotState(RobotState.SORRY)
                emitEvent("ACTION_FAILED", JSONObject().put("message", summary))
                speakAndResume(summary, config)
            }
        }
    }

    private fun executeAndRespond(routed: RoutedIntent, config: AssistantConfig) {
        val execStart = System.currentTimeMillis()
        val result = actionExecutor?.execute(routed) ?: ActionResult(
            ok = false,
            status = "error",
            message = "AndroidActionExecutor not initialized."
        )
        val execMs = System.currentTimeMillis() - execStart

        emitDebugTrace(
            "ANDROID_ACTION",
            "${routed.intent} -> ${result.status}",
            result.message,
            result.ok,
            execMs
        )

        val finalState = when {
            result.ok -> runCatching { RobotState.valueOf(routed.robotState) }.getOrDefault(RobotState.SUCCESS)
            result.status == "disambiguate" -> RobotState.CONFUSED
            else -> RobotState.SORRY
        }
        val spoken = if (result.ok) routed.spokenReply else result.message
        lastReply = spoken
        updateRobotState(finalState)

        emitEvent(
            "ACTION_COMPLETED",
            JSONObject()
                .put("intent", routed.intent)
                .put("status", result.status)
                .put("ok", result.ok)
                .put("message", result.message)
                .put("spokenReply", spoken)
                .put("robotState", finalState.name)
        )

        speakAndResume(spoken, config)
    }

    fun executeIntentJson(intentJson: String): ActionResult {
        val executor = actionExecutor ?: return ActionResult(false, "error", "Executor unavailable")
        val config = settingsRepository?.load() ?: AssistantConfig()
        return runCatching {
            val json = JSONObject(intentJson)
            val paramsJson = json.optJSONObject("parameters") ?: JSONObject()
            val routed = RoutedIntent(
                intent = json.optString("intent", "UNKNOWN"),
                category = json.optString("category", "LOCAL_DEVICE"),
                spokenReply = json.optString("spokenReply", ""),
                robotState = json.optString("robotState", "SUCCESS"),
                parameters = CommandParams(
                    appName = paramsJson.optString("appName").ifBlank { null },
                    query = paramsJson.optString("query").ifBlank { null },
                    contact = paramsJson.optString("contact").ifBlank { null },
                    messageBody = paramsJson.optString("messageBody").ifBlank { null },
                    destination = paramsJson.optString("destination").ifBlank { null },
                    timerSeconds = if (paramsJson.has("timerSeconds")) paramsJson.optInt("timerSeconds") else null,
                    alarmTime = paramsJson.optString("alarmTime").ifBlank { null },
                    alarmLabel = paramsJson.optString("alarmLabel").ifBlank { null },
                    mediaAction = paramsJson.optString("mediaAction").ifBlank { null },
                    volumeDirection = paramsJson.optString("volumeDirection").ifBlank { null },
                    flashlightState = paramsJson.optString("flashlightState").ifBlank { null },
                    settingsTarget = paramsJson.optString("settingsTarget").ifBlank { null },
                    scrollDirection = paramsJson.optString("scrollDirection").ifBlank { null },
                    targetLabel = paramsJson.optString("targetLabel").ifBlank { null },
                    calendarTitle = paramsJson.optString("calendarTitle").ifBlank { null },
                    calendarTime = paramsJson.optString("calendarTime").ifBlank { null }
                ),
                requiresConfirmation = json.optBoolean("requiresConfirmation", false)
            )
            if (routed.requiresConfirmation && config.confirmConsequentialActions) {
                val confId = "conf_${UUID.randomUUID()}"
                pendingConfirmations[confId] = routed
                return ActionResult(
                    ok = true,
                    status = "pending_confirmation",
                    message = "Waiting for user confirmation before executing ${routed.intent}.",
                    requiresConfirmation = true,
                    confirmationId = confId
                )
            }
            executor.execute(routed)
        }.getOrElse { err ->
            ActionResult(false, "error", err.message ?: "Failed to parse intent payload")
        }
    }

    fun confirmPendingAction(confirmationId: String): Boolean {
        val config = settingsRepository?.load() ?: AssistantConfig()
        if (pendingTaskConfirmations.remove(confirmationId) != null && taskExecutor != null) {
            scope.launch {
                val resumed = taskExecutor!!.resumeAfterConfirmation(confirmationId)
                handleTaskResult(resumed.state, resumed.summary, resumed.confirmationId, config)
            }
            return true
        }
        val pending = pendingConfirmations.remove(confirmationId) ?: return false
        executeAndRespond(pending.copy(requiresConfirmation = false), config)
        return true
    }

    fun cancelPendingAction(confirmationId: String): Boolean {
        val removedTask = pendingTaskConfirmations.remove(confirmationId) != null &&
            (taskExecutor?.cancelPending(confirmationId) == true)
        val removedAction = pendingConfirmations.remove(confirmationId) != null
        if (removedTask || removedAction) {
            updateRobotState(RobotState.IDLE)
            resumeWakeWordIfEnabled()
            return true
        }
        return false
    }

    /**
     * Real on-device diagnostic test invoked from the "Test Shimi" button in Setup Wizard.
     */
    fun runSelfTest(): List<SelfTestCheck> {
        val ctx = appContext ?: return emptyList()
        val perms = permissionManager ?: return emptyList()
        val apps = appLauncher?.listInstalledApps(forceRefresh = true).orEmpty()
        val speechAvailable = SpeechRecognizer.isRecognitionAvailable(ctx)
        val hasMic = perms.hasMicrophone()
        val hasOverlay = perms.hasOverlay()
        val hasA11y = perms.hasAccessibility()

        val checks = listOf(
            SelfTestCheck(
                id = "microphone",
                label = "Microphone permission",
                ok = hasMic,
                detail = if (hasMic) "RECORD_AUDIO granted" else "Grant Microphone access to enable voice"
            ),
            SelfTestCheck(
                id = "wake_word",
                label = "Offline wake-word engine",
                ok = hasMic,
                detail = "Active provider: ${wakeWordEngine?.activeProviderName() ?: "Not initialized"}"
            ),
            SelfTestCheck(
                id = "speech",
                label = "Android SpeechRecognizer",
                ok = speechAvailable,
                detail = if (speechAvailable) "On-device recognition service available" else "No RecognitionService installed"
            ),
            SelfTestCheck(
                id = "tts",
                label = "Android TextToSpeech",
                ok = ttsManager != null,
                detail = if (ttsManager != null) "Offline TTS ready" else "TTS not initialized"
            ),
            SelfTestCheck(
                id = "overlay",
                label = "Floating Shimi overlay",
                ok = hasOverlay,
                detail = if (hasOverlay) "SYSTEM_ALERT_WINDOW granted" else "Optional: enable Display over other apps"
            ),
            SelfTestCheck(
                id = "app_launcher",
                label = "Dynamic PackageManager app discovery",
                ok = apps.isNotEmpty(),
                detail = "Discovered ${apps.size} launchable Android apps"
            ),
            SelfTestCheck(
                id = "accessibility",
                label = "Accessibility multi-step automation",
                ok = hasA11y,
                detail = if (hasA11y) "ShimiAccessibilityService connected" else "Optional: enable in Android Accessibility settings"
            )
        )

        if (ttsManager != null) {
            val config = settingsRepository?.load() ?: AssistantConfig()
            ttsManager?.speak("${config.name} self test complete.", config.voiceOutputMode == "muted")
        }
        return checks
    }

    fun showOverlay(): Boolean {
        val config = settingsRepository?.load() ?: AssistantConfig()
        if (permissionManager?.hasOverlay() != true) return false
        overlayManager?.show(config, currentRobotState)
        emitStateSnapshot()
        return true
    }

    fun hideOverlay(): Boolean {
        overlayManager?.hide()
        emitStateSnapshot()
        return true
    }

    fun isOverlayVisible(): Boolean = overlayManager?.isVisible == true

    fun getInstalledApps(): List<InstalledAppRecord> = appLauncher?.listInstalledApps().orEmpty()

    private fun speakAndResume(text: String, config: AssistantConfig) {
        val muted = config.voiceOutputMode == "muted"
        ttsManager?.speak(
            text = text,
            muted = muted,
            onStart = { updateRobotState(RobotState.SPEAKING) },
            onDone = {
                updateRobotState(RobotState.IDLE)
                resumeWakeWordIfEnabled()
            }
        )
    }

    private fun resumeWakeWordIfEnabled() {
        val config = settingsRepository?.load() ?: return
        if (config.backgroundAssistantEnabled && config.wakeWordEnabled && permissionManager?.hasMicrophone() == true) {
            wakeWordEngine?.resume()
        }
    }

    private fun updateRobotState(state: RobotState) {
        currentRobotState = state
        overlayManager?.updateState(state)
    }

    private fun emitStateSnapshot() {
        bridgeRef?.get()?.pushStateSnapshot()
    }

    private fun emitEvent(type: String, payload: JSONObject) {
        bridgeRef?.get()?.pushEvent(type, payload)
    }

    private fun emitTaskStep(planId: String, step: TaskStep) {
        emitDebugTrace(
            stage = "ANDROID_ACTION",
            summary = "Task step ${step.index}: ${step.type.name} (${step.label})",
            detail = "${step.status.name}${if (step.detail.isNotBlank()) " · ${step.detail}" else ""}",
            ok = step.status.name != "FAILED"
        )
    }

    private fun emitDebugTrace(
        stage: String,
        summary: String,
        detail: String,
        ok: Boolean,
        durationMs: Long? = null
    ) {
        val payload = JSONObject()
            .put("stage", stage)
            .put("summary", summary)
            .put("detail", detail)
            .put("ok", ok)
        if (durationMs != null) payload.put("durationMs", durationMs)
        emitEvent("DEBUG_TRACE", payload)
    }

    fun currentSnapshot(
        config: AssistantConfig,
        permissions: Map<String, String>,
        serviceRunning: Boolean,
        overlayVisible: Boolean,
        accessibilityConnected: Boolean = false,
        notificationListenerConnected: Boolean = false,
        batteryOptimizationIgnored: Boolean = false
    ): JSONObject {
        val permsJson = JSONObject()
        permissions.forEach { (k, v) -> permsJson.put(k, v) }
        return JSONObject()
            .put("connected", true)
            .put("androidSdkInt", android.os.Build.VERSION.SDK_INT)
            .put("serviceRunning", serviceRunning)
            .put("wakeWordActive", serviceRunning && config.wakeWordEnabled && wakeWordEngine?.isRunning() == true)
            .put("wakeWordProvider", wakeWordEngine?.activeProviderName() ?: "Not started")
            .put("listening", isActiveListening)
            .put("speaking", currentRobotState == RobotState.SPEAKING)
            .put("overlayVisible", overlayVisible)
            .put("accessibilityConnected", accessibilityConnected)
            .put("notificationListenerConnected", notificationListenerConnected)
            .put("batteryOptimizationIgnored", batteryOptimizationIgnored)
            .put("robotState", currentRobotState.name)
            .put("lastRecognizedText", lastTranscript)
            .put("lastResponseText", lastReply)
            .put("permissions", permsJson)
            .put("installedAppsCount", appLauncher?.listInstalledApps()?.size ?: 0)
    }

    fun selfTestJson(): String {
        val array = JSONArray()
        runSelfTest().forEach { item ->
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("label", item.label)
                    .put("ok", item.ok)
                    .put("detail", item.detail)
            )
        }
        return array.toString()
    }
}
