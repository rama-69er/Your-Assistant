package com.shimi.assistant

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class ShimiApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return

        val assistantChannel = NotificationChannel(
            CHANNEL_ASSISTANT_SERVICE,
            "Shimi Background Assistant",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Persistent status notification while Shimi background listening is enabled."
            setShowBadge(false)
        }

        val bootStatusChannel = NotificationChannel(
            CHANNEL_BOOT_STATUS,
            "Shimi Startup Status",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Notifies you after device restart when Android requires a tap to resume microphone listening."
        }

        manager.createNotificationChannel(assistantChannel)
        manager.createNotificationChannel(bootStatusChannel)
    }

    companion object {
        const val CHANNEL_ASSISTANT_SERVICE = "shimi_assistant_service"
        const val CHANNEL_BOOT_STATUS = "shimi_boot_status"
    }
}
