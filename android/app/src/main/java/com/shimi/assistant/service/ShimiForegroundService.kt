package com.shimi.assistant.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.shimi.assistant.MainActivity
import com.shimi.assistant.ShimiApplication
import com.shimi.assistant.data.SettingsRepository
import com.shimi.assistant.engine.AssistantEngine

/**
 * Independent Android ForegroundService (`foregroundServiceType="microphone"`).
 * Keeps Shimi's wake-word engine, speech pipeline, action executor, and floating presence alive
 * even when the PWA/WebView Activity is minimized or swiped away.
 * Displays a transparent persistent notification with Listen and Stop actions.
 */
class ShimiForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        AssistantEngine.ensureInitialized(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                SettingsRepository(applicationContext).updateBackgroundEnabled(false)
                AssistantEngine.stopBackgroundPipeline()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_LISTEN_NOW -> {
                AssistantEngine.triggerManualListen()
            }
        }

        val config = SettingsRepository(applicationContext).load()
        val notification = buildNotification(config.name, config.wakeWord, config.wakeWordEnabled)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        AssistantEngine.startBackgroundPipeline(applicationContext)
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        AssistantEngine.stopBackgroundPipeline()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(name: String, wakeWord: String, wakeWordEnabled: Boolean): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            this,
            100,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val listenIntent = Intent(this, ShimiForegroundService::class.java).apply {
            action = ACTION_LISTEN_NOW
        }
        val listenPending = PendingIntent.getService(
            this,
            101,
            listenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, ShimiForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPending = PendingIntent.getService(
            this,
            102,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val subtitle = if (wakeWordEnabled) {
            "Listening locally for \"$wakeWord\" · Tap to open"
        } else {
            "Active in background · Tap Listen to speak"
        }

        return NotificationCompat.Builder(this, ShimiApplication.CHANNEL_ASSISTANT_SERVICE)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("$name Background Assistant")
            .setContentText(subtitle)
            .setOngoing(true)
            .setContentIntent(openPending)
            .addAction(android.R.drawable.ic_btn_speak_now, "Listen", listenPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPending)
            .build()
    }

    companion object {
        const val NOTIFICATION_ID = 4201
        const val ACTION_START = "com.shimi.assistant.action.START"
        const val ACTION_LISTEN_NOW = "com.shimi.assistant.action.LISTEN_NOW"
        const val ACTION_STOP = "com.shimi.assistant.action.STOP"

        @Volatile
        var isRunning: Boolean = false
            private set
    }
}
