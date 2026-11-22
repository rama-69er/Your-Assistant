package com.shimi.assistant.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.shimi.assistant.MainActivity
import com.shimi.assistant.ShimiApplication
import com.shimi.assistant.data.SettingsRepository
import com.shimi.assistant.permissions.PermissionManager

/**
 * Handles BOOT_COMPLETED and MY_PACKAGE_REPLACED honestly under Android 12–15 rules.
 * Android 14+ (API 34+) prohibits launching microphone foreground services directly from BOOT_COMPLETED.
 * When background mode was previously enabled, Shimi posts a clear notification so the user can tap once
 * to resume active microphone listening safely and compliantly.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }

        val config = SettingsRepository(context).load()
        if (!config.backgroundAssistantEnabled) return

        val perms = PermissionManager(context)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE && perms.hasMicrophone()) {
            BackgroundServiceManager(context).startService()
            return
        }

        // Android 14+ compliant UX: notify user to tap once to resume microphone FGS
        if (!perms.hasPostNotifications()) return
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("resume_background_assistant", true)
        }
        val pending = PendingIntent.getActivity(
            context,
            4209,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, ShimiApplication.CHANNEL_BOOT_STATUS)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("${config.name} is ready")
            .setContentText("Your assistant is ready. Tap to resume background listening.")
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        context.getSystemService(NotificationManager::class.java)?.notify(4209, notification)
    }
}
