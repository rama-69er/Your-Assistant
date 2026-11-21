package com.shimi.assistant.actions

import android.content.Context
import android.net.Uri
import com.shimi.assistant.data.ActionResult
import com.shimi.assistant.data.RoutedIntent
import com.shimi.assistant.permissions.PermissionManager

/**
 * Executes routed intents against real Android system APIs and services.
 * Always reports truthful permission gaps or Android 10-15 OS boundaries.
 */
class AndroidActionExecutor(
    private val context: Context,
    private val appLauncher: AppLauncher,
    private val deviceControl: DeviceControlManager,
    private val permissionManager: PermissionManager
) {
    fun execute(routed: RoutedIntent): ActionResult {
        val params = routed.parameters
        return when (routed.intent) {
            "TOGGLE_FLASHLIGHT" -> deviceControl.setFlashlight(params.flashlightState ?: "toggle")
            "VOLUME_CONTROL" -> deviceControl.adjustVolume(params.volumeDirection ?: "up")
            "MEDIA_CONTROL" -> deviceControl.dispatchMediaKey(params.mediaAction ?: "play")
            "SET_TIMER" -> deviceControl.setTimer(params.timerSeconds ?: 60, params.alarmLabel ?: "Shimi Timer")
            "SET_ALARM" -> deviceControl.setAlarm(params.alarmTime ?: "7:00 AM", params.alarmLabel ?: "Shimi Alarm")
            "OPEN_SETTINGS" -> deviceControl.openSettings(params.settingsTarget ?: "main")
            "OPEN_CAMERA", "TAKE_PHOTO_TIMER" -> deviceControl.openCamera()

            "OPEN_APP" -> appLauncher.launchByName(params.appName.orEmpty())

            "OPEN_YOUTUBE_SEARCH" -> {
                val query = Uri.encode(params.query.orEmpty())
                deviceControl.openWebOrDeepLink(
                    uriString = "https://www.youtube.com/results?search_query=$query",
                    packageHint = "com.google.android.youtube",
                    successMessage = "Opened YouTube search for \"${params.query.orEmpty()}\"."
                )
            }

            "OPEN_CHROME_SEARCH" -> {
                val query = Uri.encode(params.query.orEmpty())
                deviceControl.openWebOrDeepLink(
                    uriString = "https://www.google.com/search?q=$query",
                    packageHint = "com.android.chrome",
                    successMessage = "Opened browser search for \"${params.query.orEmpty()}\"."
                )
            }

            "OPEN_MAPS_NAVIGATE" -> {
                val dest = params.destination.orEmpty()
                val uri = if (dest.isNotBlank()) {
                    "google.navigation:q=${Uri.encode(dest)}"
                } else {
                    "geo:0,0?q="
                }
                deviceControl.openWebOrDeepLink(
                    uriString = uri,
                    packageHint = "com.google.android.apps.maps",
                    successMessage = if (dest.isNotBlank()) "Opened Google Maps navigation to $dest." else "Opened Google Maps."
                )
            }

            "COMPOSE_MESSAGE" -> {
                val isWhatsApp = params.appName.equals("WhatsApp", ignoreCase = true)
                val body = Uri.encode(params.messageBody.orEmpty())
                if (isWhatsApp) {
                    deviceControl.openWebOrDeepLink(
                        uriString = "https://api.whatsapp.com/send?text=$body",
                        packageHint = "com.whatsapp",
                        successMessage = "Opened WhatsApp message draft${params.contact?.let { " for $it" } ?: ""}."
                    )
                } else {
                    deviceControl.openWebOrDeepLink(
                        uriString = "smsto:?body=$body",
                        packageHint = null,
                        successMessage = "Opened SMS draft${params.contact?.let { " for $it" } ?: ""}."
                    )
                }
            }

            "CALL_CONTACT" -> deviceControl.openDialer(
                contactOrNumber = params.contact.orEmpty(),
                hasContactsPerm = permissionManager.hasContacts()
            )

            "SEARCH_CONTACTS" -> deviceControl.searchContacts(params.contact ?: params.query)
            "OPEN_CALENDAR", "SET_REMINDER" -> deviceControl.openCalendar(params.calendarTitle ?: params.alarmLabel)

            "READ_NOTIFICATIONS" -> {
                if (!permissionManager.hasNotificationListener()) {
                    ActionResult(
                        ok = false,
                        status = "blocked_permission",
                        message = "Notification access is not enabled. Open Notification Access settings to let Shimi read notifications."
                    )
                } else {
                    val summary = ShimiNotificationListenerService.instance?.readLatestSummary()
                    if (summary != null) {
                        ActionResult(true, "executed", "Latest notification: $summary")
                    } else {
                        ActionResult(true, "executed", "You don't have any unread notifications right now.")
                    }
                }
            }

            "SCROLL_DOWN" -> AccessibilityActionExecutor.scroll("down")
            "SCROLL_UP" -> AccessibilityActionExecutor.scroll("up")
            "GO_BACK" -> AccessibilityActionExecutor.goBack()
            "GO_HOME" -> AccessibilityActionExecutor.goHome()
            "OPEN_RECENTS" -> AccessibilityActionExecutor.openRecents()
            "CLICK_UI_ELEMENT" -> AccessibilityActionExecutor.clickByText(params.targetLabel.orEmpty())

            "RESTRICTED_ACTION" -> ActionResult(false, "error", routed.spokenReply)
            "CAPABILITIES", "GENERAL_ANSWER", "CLARIFY" -> ActionResult(true, "executed", routed.spokenReply)

            else -> ActionResult(false, "error", "Action \"${routed.intent}\" is not supported on this device.")
        }
    }
}
