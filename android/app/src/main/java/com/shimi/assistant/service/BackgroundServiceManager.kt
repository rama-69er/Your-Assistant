package com.shimi.assistant.service

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.shimi.assistant.permissions.PermissionManager

/**
 * Starts and stops ShimiForegroundService cleanly while respecting Android 12–15
 * foreground-service microphone restrictions.
 */
class BackgroundServiceManager(private val context: Context) {

    private val permissionManager = PermissionManager(context)

    fun isServiceRunning(): Boolean = ShimiForegroundService.isRunning

    fun startService(): Boolean {
        if (!permissionManager.hasMicrophone()) {
            return false
        }
        val intent = Intent(context, ShimiForegroundService::class.java).apply {
            action = ShimiForegroundService.ACTION_START
        }
        return runCatching {
            ContextCompat.startForegroundService(context, intent)
            true
        }.getOrDefault(false)
    }

    fun stopService() {
        val intent = Intent(context, ShimiForegroundService::class.java).apply {
            action = ShimiForegroundService.ACTION_STOP
        }
        runCatching { context.stopService(intent) }
    }
}
