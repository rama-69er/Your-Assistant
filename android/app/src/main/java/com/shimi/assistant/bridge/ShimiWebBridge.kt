package com.shimi.assistant.bridge

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.shimi.assistant.data.AssistantConfig
import com.shimi.assistant.data.SettingsRepository
import com.shimi.assistant.engine.AssistantEngine
import com.shimi.assistant.permissions.PermissionManager
import com.shimi.assistant.service.BackgroundServiceManager
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bidirectional JS <-> Kotlin bridge exposed to the Shimi PWA as `window.ShimiNative`.
 * Pushes live Android service events back into the PWA via `window.__shimiReceiveNativeEvent(json)`.
 */
class ShimiWebBridge(
    private val webView: WebView,
    private val settingsRepository: SettingsRepository,
    private val permissionManager: PermissionManager,
    private val backgroundServiceManager: BackgroundServiceManager,
    private val onRequestRuntimePermission: (String) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun getServiceStateJson(): String {
        val config = settingsRepository.load()
        val state = AssistantEngine.currentSnapshot(
            config = config,
            permissions = permissionManager.snapshotMap(),
            serviceRunning = backgroundServiceManager.isServiceRunning(),
            overlayVisible = AssistantEngine.isOverlayVisible()
        )
        return state.toString()
    }

    @JavascriptInterface
    fun startBackgroundAssistant(configJson: String?): Boolean {
        if (!configJson.isNullOrBlank()) {
            syncPreferences(configJson)
        }
        settingsRepository.updateBackgroundEnabled(true)
        val started = backgroundServiceManager.startService()
        pushStateSnapshot()
        return started
    }

    @JavascriptInterface
    fun stopBackgroundAssistant(): Boolean {
        settingsRepository.updateBackgroundEnabled(false)
        backgroundServiceManager.stopService()
        pushStateSnapshot()
        return true
    }

    @JavascriptInterface
    fun startVoiceCommand(): Boolean {
        AssistantEngine.triggerManualListen()
        return true
    }

    @JavascriptInterface
    fun stopVoiceCommand(): Boolean {
        AssistantEngine.stopListening()
        return true
    }

    @JavascriptInterface
    fun syncPreferences(configJson: String): Boolean {
        return runCatching {
            val json = JSONObject(configJson)
            val current = settingsRepository.load()
            val updated = AssistantConfig(
                name = json.optString("name", current.name).ifBlank { current.name },
                wakeWord = json.optString("wakeWord", current.wakeWord).ifBlank { current.wakeWord },
                wakeWordEnabled = json.optBoolean("wakeWordEnabled", current.wakeWordEnabled),
                wakeWordSensitivity = json.optString("wakeWordSensitivity", current.wakeWordSensitivity),
                backgroundAssistantEnabled = json.optBoolean(
                    "backgroundAssistantEnabled",
                    current.backgroundAssistantEnabled
                ),
                aiMode = json.optString("aiMode", current.aiMode),
                cloudGeminiEnabled = json.optBoolean("cloudGeminiEnabled", current.cloudGeminiEnabled),
                confirmConsequentialActions = json.optBoolean(
                    "confirmConsequentialActions",
                    current.confirmConsequentialActions
                ),
                floatingMode = json.optString("floatingMode", current.floatingMode),
                floatingSize = json.optString("floatingSize", current.floatingSize),
                floatingOpacity = json.optDouble("floatingOpacity", current.floatingOpacity.toDouble()).toFloat(),
                voiceOutputMode = json.optString("voiceOutputMode", current.voiceOutputMode),
                batterySaver = json.optBoolean("batterySaver", current.batterySaver),
                debugModeEnabled = json.optBoolean("debugModeEnabled", current.debugModeEnabled)
            )
            settingsRepository.save(updated)
            AssistantEngine.applyConfig(updated)
            true
        }.getOrDefault(false)
    }

    @JavascriptInterface
    fun executeAction(intentJson: String): String {
        val result = AssistantEngine.executeIntentJson(intentJson)
        return JSONObject().apply {
            put("ok", result.ok)
            put("status", result.status)
            put("message", result.message)
            put("requiresConfirmation", result.requiresConfirmation)
            if (result.confirmationId != null) put("confirmationId", result.confirmationId)
        }.toString()
    }

    @JavascriptInterface
    fun confirmAction(confirmationId: String): Boolean {
        return AssistantEngine.confirmPendingAction(confirmationId)
    }

    @JavascriptInterface
    fun cancelAction(confirmationId: String): Boolean {
        return AssistantEngine.cancelPendingAction(confirmationId)
    }

    @JavascriptInterface
    fun showFloatingAssistant(): Boolean {
        return AssistantEngine.showOverlay()
    }

    @JavascriptInterface
    fun hideFloatingAssistant(): Boolean {
        return AssistantEngine.hideOverlay()
    }

    @JavascriptInterface
    fun requestPermission(permissionKey: String): Boolean {
        mainHandler.post { onRequestRuntimePermission(permissionKey) }
        return true
    }

    @JavascriptInterface
    fun openAndroidSettings(target: String): Boolean {
        return permissionManager.openPermissionSettings(target)
    }

    @JavascriptInterface
    fun getInstalledAppsJson(): String {
        val apps = AssistantEngine.getInstalledApps()
        val array = JSONArray()
        apps.forEach { app ->
            array.put(JSONObject().apply {
                put("label", app.label)
                put("packageName", app.packageName)
            })
        }
        return array.toString()
    }

    fun pushStateSnapshot() {
        val snapshot = AssistantEngine.currentSnapshot(
            config = settingsRepository.load(),
            permissions = permissionManager.snapshotMap(),
            serviceRunning = backgroundServiceManager.isServiceRunning(),
            overlayVisible = AssistantEngine.isOverlayVisible()
        )
        pushEvent("SERVICE_STATE_CHANGED", snapshot)
    }

    fun pushEvent(type: String, payload: JSONObject) {
        val envelope = JSONObject().apply {
            put("type", type)
            put("timestamp", System.currentTimeMillis())
            put("payload", payload)
        }
        val quoted = JSONObject.quote(envelope.toString())
        mainHandler.post {
            webView.evaluateJavascript(
                "window.__shimiReceiveNativeEvent && window.__shimiReceiveNativeEvent($quoted);",
                null
            )
        }
    }
}
