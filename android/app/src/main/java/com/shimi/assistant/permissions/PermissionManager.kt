package com.shimi.assistant.permissions

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.shimi.assistant.actions.ShimiAccessibilityService
import com.shimi.assistant.actions.ShimiNotificationListenerService

/**
 * Queries real Android runtime and special permission states and launches official Settings pages.
 * Never attempts to bypass Android's user consent prompts.
 */
class PermissionManager(private val context: Context) {

    fun hasMicrophone(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    fun hasCamera(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    fun hasContacts(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED

    fun hasPostNotifications(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    fun hasOverlay(): Boolean = Settings.canDrawOverlays(context)

    fun hasAccessibility(): Boolean {
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val expected = ComponentName(context, ShimiAccessibilityService::class.java).flattenToString()
        return enabledServices.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    fun hasNotificationListener(): Boolean {
        val listeners = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        val expected = ComponentName(context, ShimiNotificationListenerService::class.java).flattenToString()
        return listeners.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    fun isBatteryOptimizationIgnored(): Boolean {
        val pm = context.getSystemService(PowerManager::class.java) ?: return false
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun snapshotMap(): Map<String, String> = mapOf(
        "microphone" to if (hasMicrophone()) "granted" else "prompt",
        "camera" to if (hasCamera()) "granted" else "prompt",
        "photos" to "prompt",
        "notifications" to if (hasPostNotifications()) "granted" else "prompt",
        "overlay" to if (hasOverlay()) "granted" else "prompt",
        "accessibility" to if (hasAccessibility()) "granted" else "prompt",
        "notification_listener" to if (hasNotificationListener()) "granted" else "prompt",
        "contacts" to if (hasContacts()) "granted" else "prompt",
        "battery_optimization" to if (isBatteryOptimizationIgnored()) "granted" else "prompt"
    )

    fun openPermissionSettings(permissionKey: String): Boolean {
        val intent = when (permissionKey) {
            "overlay" -> Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
            "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "notification_listener" -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            "battery_optimization" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
            else -> Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${context.packageName}")
            )
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching {
            context.startActivity(intent)
            true
        }.getOrDefault(false)
    }
}
