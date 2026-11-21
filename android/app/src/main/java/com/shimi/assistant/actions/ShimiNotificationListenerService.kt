package com.shimi.assistant.actions

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Strictly opt-in NotificationListenerService.
 * Only reads active notifications in memory when the user explicitly asks "Read my latest notification".
 * Never logs or persists notification contents.
 */
class ShimiNotificationListenerService : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
    }

    override fun onListenerDisconnected() {
        if (instance === this) {
            instance = null
        }
        super.onListenerDisconnected()
    }

    fun readLatestSummary(): String? {
        val list: Array<StatusBarNotification> = runCatching { activeNotifications }.getOrNull() ?: return null
        val latest = list
            .filter { !it.isOngoing && it.packageName != packageName }
            .maxByOrNull { it.postTime }
            ?: return null

        val extras = latest.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
        if (title.isBlank() && text.isBlank()) return null
        return buildString {
            if (title.isNotBlank()) append(title)
            if (title.isNotBlank() && text.isNotBlank()) append(": ")
            if (text.isNotBlank()) append(text)
        }
    }

    companion object {
        @Volatile
        var instance: ShimiNotificationListenerService? = null
            private set
    }
}
