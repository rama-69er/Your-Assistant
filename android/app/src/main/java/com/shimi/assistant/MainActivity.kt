package com.shimi.assistant

import android.Manifest
import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.shimi.assistant.bridge.ShimiWebBridge
import com.shimi.assistant.data.SettingsRepository
import com.shimi.assistant.engine.AssistantEngine
import com.shimi.assistant.permissions.PermissionManager
import com.shimi.assistant.service.BackgroundServiceManager

/**
 * Hosts the existing Shimi React/Vite PWA inside a full-screen WebView while binding
 * `window.ShimiNative` to the independent native Android background service.
 * When this Activity is minimized or closed, ShimiForegroundService continues running.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var settingsRepository: SettingsRepository
    private lateinit var permissionManager: PermissionManager
    private lateinit var backgroundServiceManager: BackgroundServiceManager
    private lateinit var bridge: ShimiWebBridge

    private val runtimePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ ->
        bridge.pushStateSnapshot()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        AssistantEngine.ensureInitialized(applicationContext)
        settingsRepository = SettingsRepository(applicationContext)
        permissionManager = PermissionManager(applicationContext)
        backgroundServiceManager = BackgroundServiceManager(applicationContext)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    bridge.pushStateSnapshot()
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest?) {
                    request?.grant(request.resources)
                }
            }
        }

        bridge = ShimiWebBridge(
            webView = webView,
            settingsRepository = settingsRepository,
            permissionManager = permissionManager,
            backgroundServiceManager = backgroundServiceManager,
            onRequestRuntimePermission = { key -> handleRuntimePermissionRequest(key) }
        )

        webView.addJavascriptInterface(bridge, "ShimiNative")
        AssistantEngine.attachBridge(bridge)

        setContentView(webView)
        webView.loadUrl(BuildConfig.SHIMI_PWA_URL)

        if (intent?.getBooleanExtra("resume_background_assistant", false) == true) {
            backgroundServiceManager.startService()
        }
    }

    override fun onResume() {
        super.onResume()
        // Reconnect UI with live native service & permission states after minimization/reopen
        AssistantEngine.attachBridge(bridge)
        bridge.pushStateSnapshot()
    }

    override fun onDestroy() {
        // Detach WebView bridge ONLY — do NOT stop ShimiForegroundService!
        AssistantEngine.detachBridge()
        webView.destroy()
        super.onDestroy()
    }

    private fun handleRuntimePermissionRequest(permissionKey: String) {
        when (permissionKey) {
            "microphone" -> runtimePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            "camera" -> runtimePermissionLauncher.launch(Manifest.permission.CAMERA)
            "contacts" -> runtimePermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
            "notifications" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    runtimePermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    bridge.pushStateSnapshot()
                }
            }
            else -> permissionManager.openPermissionSettings(permissionKey)
        }
    }
}
