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
 * Method names and JSON keys match `ShimiAndroidJavascriptInterface` in `src/services/nativeBridge.ts` 1:1.
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
    fun getSnapshotJson(): String {
        val config = settingsRepository.load()
        val state = AssistantEngine.currentSnapshot(
            config = config,
            permissions = permissionManager.snapshotMap(),
            serviceRunning = backgroundServiceManager.isServiceRunning(),
            overlayVisible = AssistantEngine.isOverlayVisible(),
            accessibilityConnected = permissionManager.hasAccessibility(),
            notificationListenerConnected = permissionManager.hasNotificationListener(),
            batteryOptimizationIgnored = permissionManager.isBatteryOptimizationIgnored()
        )
        return state.toString()
    }

    @JavascriptInterface
    fun syncSettingsJson(settingsJson: String) {
        runCatching {
            val json = JSONObject(settingsJson)
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
        }
    }

    @JavascriptInterface
    fun setBackgroundAssistantEnabled(enabled: Boolean): String {
        settingsRepository.updateBackgroundEnabled(enabled)
        val ok = if (enabled) {
            backgroundServiceManager.startService()
        } else {
            backgroundServiceManager.stopService()
            true
        }
        pushStateSnapshot()
        return JSONObject()
            .put("ok", ok)
            .put(
                "message",
                if (enabled) {
                    if (ok) "Shimi foreground service started." else "Grant Microphone permission before starting background listening."
                } else {
                    "Shimi foreground service stopped."
                }
            )
            .toString()
    }

    @JavascriptInterface
    fun startListening(): String {
        AssistantEngine.triggerManualListen()
        return JSONObject().put("ok", true).put("message", "Listening started.").toString()
    }

    @JavascriptInterface
    fun stopListening(): String {
        AssistantEngine.stopListening()
        return JSONObject().put("ok", true).put("message", "Listening stopped.").toString()
    }

    @JavascriptInterface
    fun executeActionJson(actionJson: String): String {
        val result = AssistantEngine.executeIntentJson(actionJson)
        return JSONObject()
            .put("executed", result.ok)
            .put("status", result.status)
            .put("summary", result.message)
            .put("detail", result.message)
            .toString()
    }

    @JavascriptInterface
    fun confirmPendingAction(actionId: String): String {
        val ok = AssistantEngine.confirmPendingAction(actionId)
        return JSONObject()
            .put("executed", ok)
            .put("status", if (ok) "executed" else "error")
            .put("summary", if (ok) "Confirmed and executed." else "No pending action found.")
            .toString()
    }

    @JavascriptInterface
    fun cancelPendingAction(actionId: String): String {
        val ok = AssistantEngine.cancelPendingAction(actionId)
        return JSONObject().put("ok", ok).toString()
    }

    @JavascriptInterface
    fun openAndroidSetting(target: String): String {
        val ok = permissionManager.openPermissionSettings(target)
        return JSONObject()
            .put("ok", ok)
            .put("message", if (ok) "Opened Android $target settings." else "Could not open $target settings.")
            .toString()
    }

    @JavascriptInterface
    fun requestBatteryOptimizationExemption(): String {
        val ok = permissionManager.openPermissionSettings("battery_optimization")
        return JSONObject()
            .put("ok", ok)
            .put("message", "Opened Android battery optimization settings.")
            .toString()
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

    @JavascriptInterface
    fun getDebugLogsJson(): String = "[]"

    @JavascriptInterface
    fun requestPermission(permissionKey: String): Boolean {
        mainHandler.post { onRequestRuntimePermission(permissionKey) }
        return true
    }

    fun pushStateSnapshot() {
        val snapshot = AssistantEngine.currentSnapshot(
            config = settingsRepository.load(),
            permissions = permissionManager.snapshotMap(),
            serviceRunning = backgroundServiceManager.isServiceRunning(),
            overlayVisible = AssistantEngine.isOverlayVisible(),
            accessibilityConnected = permissionManager.hasAccessibility(),
            notificationListenerConnected = permissionManager.hasNotificationListener(),
            batteryOptimizationIgnored = permissionManager.isBatteryOptimizationIgnored()
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
