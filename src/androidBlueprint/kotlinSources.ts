export interface AndroidBlueprintFile {
  label: string;
  path: string;
  content: string;
}

export const ANDROID_KOTLIN_BLUEPRINT: AndroidBlueprintFile[] = [
  {
    label: 'AndroidManifest.xml',
    path: 'android/app/src/main/AndroidManifest.xml',
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Requested only when user enables the corresponding feature -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />

    <application
        android:name=".ShimiApplication"
        android:allowBackup="false"
        android:label="Shimi"
        android:supportsRtl="true"
        android:theme="@style/Theme.Shimi">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Foreground service hosting draggable floating robot when overlay permission is granted -->
        <service
            android:name=".overlay.FloatingRobotService"
            android:exported="false"
            android:foregroundServiceType="microphone" />

        <!-- Explicit user opt-in AccessibilityService for scrolling / back / accessible fields -->
        <service
            android:name=".actions.ShimiAccessibilityService"
            android:exported="false"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/shimi_accessibility_config" />
        </service>
    </application>
</manifest>`,
  },
  {
    label: 'ShimiApp.kt',
    path: 'android/app/src/main/java/com/shimi/assistant/ui/ShimiApp.kt',
    content: `package com.shimi.assistant.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.shimi.assistant.model.RobotState
import com.shimi.assistant.settings.AssistantSettings

@Composable
fun ShimiApp(
    settings: AssistantSettings,
    robotState: RobotState,
    isActive: Boolean,
    latestReply: String,
    onStartShimi: () -> Unit,
    onStopShimi: () -> Unit,
    onSpeakCommand: () -> Unit
) {
    val assistantName = settings.assistantName.ifBlank { "Shimi" }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(assistantName) })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            RobotCharacter(
                state = robotState,
                modifier = Modifier.size(220.dp)
            )

            Surface(
                shape = MaterialTheme.shapes.large,
                tonalElevation = 2.dp
            ) {
                Text(
                    text = latestReply,
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyLarge
                )
            }

            Button(
                onClick = if (isActive) onStopShimi else onStartShimi,
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Text(if (isActive) "Stop $assistantName" else "Start $assistantName")
            }

            if (isActive) {
                FilledTonalButton(
                    onClick = onSpeakCommand,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text("Tap to Talk")
                }
            }
        }
    }
}`,
  },
  {
    label: 'FloatingRobotService.kt',
    path: 'android/app/src/main/java/com/shimi/assistant/overlay/FloatingRobotService.kt',
    content: `package com.shimi.assistant.overlay

import android.app.*
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import androidx.core.app.NotificationCompat

/**
 * Displays the draggable floating Shimi robot over other apps ONLY after
 * Settings.canDrawOverlays(context) is explicitly granted by the user.
 * Stops cleanly and releases window + microphone resources on Stop.
 */
class FloatingRobotService : Service() {

    private var windowManager: WindowManager? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildForegroundNotification())
        attachOverlayIfNeeded()
        return START_NOT_STICKY
    }

    private fun attachOverlayIfNeeded() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 24
            y = 260
        }
        // Attach ComposeView hosting RobotCharacter with drag gesture listener
        // windowManager?.addView(overlayComposeView, params)
    }

    private fun buildForegroundNotification(): Notification {
        val channelId = "shimi_active_session"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Shimi Assistant Active",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Shimi is active")
            .setContentText("Tap to pause listening or stop the floating companion.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        windowManager = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 4201
    }
}`,
  },
  {
    label: 'AndroidActionController.kt',
    path: 'android/app/src/main/java/com/shimi/assistant/actions/AndroidActionController.kt',
    content: `package com.shimi.assistant.actions

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore

sealed class ActionResult {
    data class Executed(val summary: String) : ActionResult()
    data class BlockedPermission(val permission: String, val explanation: String) : ActionResult()
    data class RequiresConfirmation(val summary: String, val pendingIntent: Intent) : ActionResult()
    data class Failed(val reason: String) : ActionResult()
}

class AndroidActionController(private val context: Context) {

    fun openCamera(): ActionResult {
        val intent = Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return launchSafely(intent, "Opened Android camera")
    }

    fun searchYouTube(query: String): ActionResult {
        val uri = Uri.parse("https://www.youtube.com/results?search_query=\${Uri.encode(query)}")
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return launchSafely(intent, "Opened YouTube search for $query")
    }

    fun navigateMaps(destination: String): ActionResult {
        val uri = Uri.parse("google.navigation:q=\${Uri.encode(destination)}")
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage("com.google.android.apps.maps")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return launchSafely(intent, "Started Maps navigation to $destination")
    }

    fun prepareMessageDraft(phoneOrContact: String, body: String): ActionResult {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:\${Uri.encode(phoneOrContact)}")).apply {
            putExtra("sms_body", body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        // Consequential messaging action ALWAYS requires explicit user confirmation first
        return ActionResult.RequiresConfirmation(
            summary = "Confirm opening message draft to $phoneOrContact",
            pendingIntent = intent
        )
    }

    private fun launchSafely(intent: Intent, successMessage: String): ActionResult {
        return try {
            context.startActivity(intent)
            ActionResult.Executed(successMessage)
        } catch (e: Exception) {
            ActionResult.Failed("Could not open the target app on this device.")
        }
    }
}`,
  },
  {
    label: 'ShimiAccessibilityService.kt',
    path: 'android/app/src/main/java/com/shimi/assistant/actions/ShimiAccessibilityService.kt',
    content: `package com.shimi.assistant.actions

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Strictly opt-in AccessibilityService for navigating back, returning home,
 * and scrolling accessible views. Never bypasses authentication or payment dialogs.
 */
class ShimiAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Privacy-first: do not log or store screen text from user apps
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) instance = null
    }

    fun performBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)

    fun performHome(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)

    fun performScrollForward(): Boolean {
        val root = rootInActiveWindow ?: return false
        return findScrollableNode(root)?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) == true
    }

    private fun findScrollableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val match = findScrollableNode(child)
            if (match != null) return match
        }
        return null
    }

    companion object {
        @Volatile
        var instance: ShimiAccessibilityService? = null
            private set
    }
}`,
  },
  {
    label: 'GeminiService.kt',
    path: 'android/app/src/main/java/com/shimi/assistant/ai/GeminiService.kt',
    content: `package com.shimi.assistant.ai

/**
 * Security note: Never hardcode GEMINI_API_KEY in the Android APK.
 * Use Firebase AI Logic (with App Check) or a secure backend proxy endpoint
 * like /api/shimi/interpret so credentials never ship inside client binaries.
 */
interface GeminiService {
    suspend fun interpretCommand(
        utterance: String,
        assistantName: String,
        personality: String
    ): Result<StructuredCommandResponse>
}

data class StructuredCommandResponse(
    val spokenReply: String,
    val robotState: String,
    val intent: String,
    val requiresConfirmation: Boolean,
    val parameters: Map<String, String>
)`,
  },
];
