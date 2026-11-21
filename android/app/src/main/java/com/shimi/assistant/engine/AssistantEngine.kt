package com.shimi.assistant.engine

import android.content.Context
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
import com.shimi.assistant.data.SettingsRepository
import com.shimi.assistant.data.WakeWordSensitivity
import com.shimi.assistant.overlay.OverlayManager
import com.shimi.assistant.permissions.PermissionManager
import com.shimi.assistant.permissions.PrivacyManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Central process-wide coordinator uniting WakeWordEngine, SpeechEngine, IntentRouter,
 * AndroidActionExecutor, TTSManager, OverlayManager, and optional WebView bridge.
 * Continues operating independently when the WebView / PWA Activity is closed or minimized.
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
    private var overlayManager: OverlayManager? = null
    private var bridgeRef: WeakReference<ShimiWebBridge>? = null

    private val pendingConfirmations = ConcurrentHashMap<String, RoutedIntent>()

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
        intentRouter = IntentRouter(ctx, GeminiManager(ctx), privacyManager!!)
        overlayManager = OverlayManager(
            context = ctx,
            onBubbleTapped = { triggerManualListen() }
        )
        wakeWordEngine = WakeWordEngine(
            context = ctx,
            onWakeWordDetected = { matched, remainder ->
                onWakeDetected(matched, remainder)
            },
            onDebugTrace = { stage, summary, detail, status ->
                emitDebugTrace(stage, summary, detail, status)
            }
        )
    }

    fun attachBridge(bridge: ShimiWebBridge) {
        bridgeRef = WeakReference(bridge)
        bridge.pushStateSnapshot()
    }

    fun detachBridge() {
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
        if (config.floatingMode == "overlay" && permissionManager?.hasOverlay() == true) {
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
            wakeWordEngine?.stop()
            wakeWordEngine?.start(
                wakeWord = config.wakeWord,
                sensitivity = WakeWordSensitivity.fromWire(config.wakeWordSensitivity)
            )
        } else if (!config.wakeWordEnabled || !config.backgroundAssistantEnabled) {
            wakeWordEngine?.stop()
        }
        overlayManager?.updateAppearance(config, currentRobotState)
        emitStateSnapshot()
    }

    fun triggerManualListen() {
        val ctx = appContext ?: return
        ensureInitialized(ctx)
        if (permissionManager?.hasMicrophone() != true) {
            emitDebugTrace("SPEECH", "Microphone permission missing", "Prompt user to grant RECORD_AUDIO", "error")
            updateRobotState(RobotState.SORRY)
            return
        }

        wakeWordEngine?.pause()
        ttsManager?.stop()
        isActiveListening = true
        updateRobotState(RobotState.LISTENING)
        emitEvent("LISTENING_STARTED", JSONObject().put("robotState", "LISTENING"))

        val config = settingsRepository?.load() ?: AssistantConfig()
        val preferOffline = config.aiMode == "offline_only" || true
        speechEngine?.startListening(
            preferOffline = preferOffline,
            onPartial = { partial ->
                lastTranscript = partial
                emitEvent("SPEECH_PARTIAL", JSONObject().put("transcript", partial))
            },
            onFinal = { transcript ->
                isActiveListening = false
                lastTranscript = transcript
                emitDebugTrace("SPEECH", "Recognized: \"$transcript\"", "Delivered to IntentRouter", "ok")
                emitEvent("SPEECH_FINAL", JSONObject().put("transcript", transcript))
                processCommand(transcript)
            },
            onError = { errMsg ->
                isActiveListening = false
                emitDebugTrace("SPEECH", "Speech recognition error", errMsg, "warn")
                updateRobotState(RobotState.CONFUSED)
                resumeWakeWordIfEnabled()
                emitEvent("LISTENING_STOPPED", JSONObject().put("error", errMsg))
            }
        )
    }

    fun stopListening() {
        speechEngine?.stopListening()
        isActiveListening = false
        updateRobotState(RobotState.IDLE)
        resumeWakeWordIfEnabled()
        emitEvent("LISTENING_STOPPED", JSONObject())
    }

    private fun onWakeDetected(matched: String, remainder: String) {
        emitEvent(
            "WAKE_WORD_DETECTED",
            JSONObject().put("wakeWord", matched).put("remainder", remainder)
        )
        if (remainder.length >= 3) {
            processCommand(remainder)
        } else {
            triggerManualListen()
        }
    }

    fun processCommand(utterance: String) {
        val config = settingsRepository?.load() ?: AssistantConfig()
        updateRobotState(RobotState.THINKING)
        val startMs = System.currentTimeMillis()

        scope.launch {
            val routed = intentRouter?.route(utterance, config) ?: return@launch
            val routeMs = System.currentTimeMillis() - startMs
            emitDebugTrace(
                "INTENT",
                "${routed.intent} (${routed.category})",
                "Source: ${routed.source} · Reply: ${routed.spokenReply}",
                "ok",
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
            if (result.ok) "ok" else "warn",
            execMs
        )

        val finalState = when {
            result.ok -> runCatching { RobotState.valueOf(routed.robotState) }.getOrDefault(RobotState.SUCCESS)
            result.status == "blocked_permission" -> RobotState.SORRY
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
        val pending = pendingConfirmations.remove(confirmationId) ?: return false
        val config = settingsRepository?.load() ?: AssistantConfig()
        executeAndRespond(pending.copy(requiresConfirmation = false), config)
        return true
    }

    fun cancelPendingAction(confirmationId: String): Boolean {
        val removed = pendingConfirmations.remove(confirmationId) != null
        if (removed) {
            updateRobotState(RobotState.IDLE)
            resumeWakeWordIfEnabled()
        }
        return removed
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

    private fun emitDebugTrace(
        stage: String,
        summary: String,
        detail: String,
        status: String,
        durationMs: Long? = null
    ) {
        val payload = JSONObject()
            .put("stage", stage)
            .put("summary", summary)
            .put("detail", detail)
            .put("status", status)
        if (durationMs != null) payload.put("durationMs", durationMs)
        emitEvent("DEBUG_TRACE", payload)
    }

    fun currentSnapshot(
        config: AssistantConfig,
        permissions: Map<String, String>,
        serviceRunning: Boolean,
        overlayVisible: Boolean
    ): JSONObject {
        val permsJson = JSONObject()
        permissions.forEach { (k, v) -> permsJson.put(k, v) }
        return JSONObject()
            .put("connected", true)
            .put("serviceRunning", serviceRunning)
            .put("wakeWordActive", serviceRunning && config.wakeWordEnabled)
            .put("isListening", isActiveListening)
            .put("overlayVisible", overlayVisible)
            .put("robotState", currentRobotState.name)
            .put("wakeWord", config.wakeWord)
            .put("aiMode", config.aiMode)
            .put("lastTranscript", lastTranscript)
            .put("lastReply", lastReply)
            .put("permissions", permsJson)
    }
}
