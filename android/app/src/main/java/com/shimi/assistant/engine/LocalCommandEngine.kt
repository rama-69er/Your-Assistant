package com.shimi.assistant.engine

import com.shimi.assistant.data.CommandParams
import com.shimi.assistant.data.RoutedIntent
import java.util.Locale

/**
 * Deterministic offline-first command parser on Android.
 * Mirrors the TypeScript intentRouter so core phone commands NEVER require Gemini or internet.
 */
object LocalCommandEngine {

    private val WORD_TO_NUM = mapOf(
        "one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5,
        "six" to 6, "seven" to 7, "eight" to 8, "nine" to 9, "ten" to 10,
        "fifteen" to 15, "twenty" to 20, "thirty" to 30
    )

    fun stripWakeWord(raw: String, assistantName: String, wakeWord: String): String {
        val names = listOf(wakeWord, assistantName)
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString("|") { Regex.escape(it) }
        if (names.isBlank()) return raw.trim()
        val regex = Regex("^(?:hey|hi|ok|okay)?\\s*(?:$names)[,!?.\\s]*", RegexOption.IGNORE_CASE)
        return raw.trim().replace(regex, "").trim()
    }

    fun parse(
        rawUtterance: String,
        assistantName: String,
        wakeWord: String,
        confirmConsequential: Boolean
    ): RoutedIntent? {
        val cleaned = stripWakeWord(rawUtterance, assistantName, wakeWord)
        val lower = cleaned.lowercase(Locale.getDefault())

        if (cleaned.isBlank()) {
            return RoutedIntent(
                intent = "CLARIFY",
                category = "LOCAL_SYSTEM",
                spokenReply = "I'm listening! What would you like me to do?",
                robotState = "CONFUSED"
            )
        }

        // Security guard
        if (Regex("\\b(password|passcode|pin code|otp|2fa|biometric|bank transfer|send money|credit card|uninstall)\\b").containsMatchIn(lower)) {
            return RoutedIntent(
                intent = "RESTRICTED_ACTION",
                category = "LOCAL_SYSTEM",
                spokenReply = "For your security, $assistantName cannot enter passwords, handle banking or payments, or bypass Android security dialogs.",
                robotState = "SORRY"
            )
        }

        // Flashlight
        if (Regex("\\b(flashlight|torch)\\b").containsMatchIn(lower)) {
            val state = when {
                Regex("\\b(off|disable|stop)\\b").containsMatchIn(lower) -> "off"
                Regex("\\b(on|enable|turn on)\\b").containsMatchIn(lower) -> "on"
                else -> "toggle"
            }
            return RoutedIntent(
                intent = "TOGGLE_FLASHLIGHT",
                category = "LOCAL_DEVICE",
                spokenReply = if (state == "off") "Turning off the flashlight." else "Turning on the flashlight.",
                robotState = "SUCCESS",
                parameters = CommandParams(flashlightState = state)
            )
        }

        // Volume
        if (Regex("\\b(volume|mute|unmute|louder|quieter)\\b").containsMatchIn(lower)) {
            val dir = when {
                Regex("\\bunmute\\b").containsMatchIn(lower) -> "unmute"
                Regex("\\bmute|silent\\b").containsMatchIn(lower) -> "mute"
                Regex("\\b(down|lower|decrease|quieter)\\b").containsMatchIn(lower) -> "down"
                else -> "up"
            }
            return RoutedIntent(
                intent = "VOLUME_CONTROL",
                category = "LOCAL_DEVICE",
                spokenReply = when (dir) {
                    "up" -> "Turning the volume up."
                    "down" -> "Turning the volume down."
                    "mute" -> "Muting media volume."
                    else -> "Unmuting media volume."
                },
                robotState = "SUCCESS",
                parameters = CommandParams(volumeDirection = dir)
            )
        }

        // Media controls
        if (Regex("\\b(pause music|pause media|stop music|play music|resume music|next track|next song|skip track|previous track|previous song)\\b").containsMatchIn(lower)) {
            val action = when {
                Regex("\\b(next|skip)\\b").containsMatchIn(lower) -> "next"
                Regex("\\bprevious|back\\b").containsMatchIn(lower) -> "previous"
                Regex("\\b(pause|stop)\\b").containsMatchIn(lower) -> "pause"
                else -> "play"
            }
            return RoutedIntent(
                intent = "MEDIA_CONTROL",
                category = "LOCAL_DEVICE",
                spokenReply = "Sending $action to your media player.",
                robotState = "SUCCESS",
                parameters = CommandParams(mediaAction = action)
            )
        }

        // Timer
        if (Regex("\\b(timer|countdown)\\b").containsMatchIn(lower)) {
            val seconds = extractDurationSeconds(lower)
            if (seconds != null) {
                return RoutedIntent(
                    intent = "SET_TIMER",
                    category = "LOCAL_DEVICE",
                    spokenReply = "Setting a timer for ${formatDuration(seconds)}.",
                    robotState = "SUCCESS",
                    parameters = CommandParams(timerSeconds = seconds, alarmLabel = "$assistantName Timer")
                )
            }
        }

        // Alarm
        if (Regex("\\balarm\\b").containsMatchIn(lower)) {
            val time = Regex("\\b(\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)\\b", RegexOption.IGNORE_CASE)
                .find(cleaned)?.groupValues?.get(1)?.trim() ?: "7:00 AM"
            return RoutedIntent(
                intent = "SET_ALARM",
                category = "LOCAL_DEVICE",
                spokenReply = "Setting an alarm for $time.",
                robotState = "SUCCESS",
                parameters = CommandParams(alarmTime = time, alarmLabel = "$assistantName Alarm")
            )
        }

        // Android Settings shortcuts
        if (Regex("\\b(settings?|wi-?fi|bluetooth|battery|display|accessibility|notification settings?)\\b").containsMatchIn(lower) &&
            Regex("\\b(open|show|go to|settings?|turn on|turn off|toggle)\\b").containsMatchIn(lower)
        ) {
            val target = when {
                Regex("\\bwi-?fi\\b").containsMatchIn(lower) -> "wifi"
                Regex("\\bbluetooth\\b").containsMatchIn(lower) -> "bluetooth"
                Regex("\\bbattery\\b").containsMatchIn(lower) -> "battery"
                Regex("\\bdisplay|brightness\\b").containsMatchIn(lower) -> "display"
                Regex("\\baccessibility\\b").containsMatchIn(lower) -> "accessibility"
                Regex("\\bnotification\\b").containsMatchIn(lower) -> "notifications"
                else -> "main"
            }
            return RoutedIntent(
                intent = "OPEN_SETTINGS",
                category = "LOCAL_DEVICE",
                spokenReply = "Opening Android $target settings.",
                robotState = "SUCCESS",
                parameters = CommandParams(settingsTarget = target)
            )
        }

        // Camera & timed photo
        if (Regex("\\b(camera|take a picture|take a photo|snap a photo|selfie)\\b").containsMatchIn(lower)) {
            val seconds = extractDurationSeconds(lower)
            return if (seconds != null) {
                RoutedIntent(
                    intent = "TAKE_PHOTO_TIMER",
                    category = "LOCAL_DEVICE",
                    spokenReply = "Opening the camera with a $seconds-second countdown.",
                    robotState = "SUCCESS",
                    parameters = CommandParams(timerSeconds = seconds),
                    requiredPermission = "camera"
                )
            } else {
                RoutedIntent(
                    intent = "OPEN_CAMERA",
                    category = "LOCAL_DEVICE",
                    spokenReply = "Opening your camera.",
                    robotState = "SUCCESS",
                    requiredPermission = "camera"
                )
            }
        }

        // YouTube search
        if (lower.contains("youtube")) {
            val query = Regex("(?:search(?:\\s+for)?|play|watch|find)\\s+(.+)$", RegexOption.IGNORE_CASE)
                .find(cleaned)?.groupValues?.get(1)?.trim()
            return if (!query.isNullOrBlank()) {
                RoutedIntent(
                    intent = "OPEN_YOUTUBE_SEARCH",
                    category = "LOCAL_APP",
                    spokenReply = "Opening YouTube to search for \"$query\".",
                    robotState = "SUCCESS",
                    parameters = CommandParams(appName = "YouTube", query = query)
                )
            } else {
                RoutedIntent(
                    intent = "OPEN_APP",
                    category = "LOCAL_APP",
                    spokenReply = "Opening YouTube.",
                    robotState = "SUCCESS",
                    parameters = CommandParams(appName = "YouTube")
                )
            }
        }

        // Maps navigation
        if (Regex("\\b(maps|navigate|directions)\\b").containsMatchIn(lower)) {
            val dest = Regex("(?:navigate|directions)\\s+(?:to|for)\\s+(.+)$", RegexOption.IGNORE_CASE)
                .find(cleaned)?.groupValues?.get(1)?.trim()
            return RoutedIntent(
                intent = "OPEN_MAPS_NAVIGATE",
                category = "LOCAL_APP",
                spokenReply = if (!dest.isNullOrBlank()) "Opening Maps for directions to $dest." else "Opening Google Maps.",
                robotState = "SUCCESS",
                parameters = CommandParams(appName = "Maps", destination = dest)
            )
        }

        // WhatsApp / SMS message (confirmation-gated)
        if (Regex("\\b(whatsapp|send a message|text|message)\\b").containsMatchIn(lower)) {
            val contact = Regex("\\bto\\s+([a-zA-Z0-9 .'-]{1,40}?)(?=\\s+(?:saying|that|with|:)|$)", RegexOption.IGNORE_CASE)
                .find(cleaned)?.groupValues?.get(1)?.trim()
            val body = Regex("(?:saying|that says|:)\\s+(.+)$", RegexOption.IGNORE_CASE)
                .find(cleaned)?.groupValues?.get(1)?.trim()
            val appName = if (lower.contains("whatsapp")) "WhatsApp" else "Messages"
            return RoutedIntent(
                intent = "COMPOSE_MESSAGE",
                category = "LOCAL_APP",
                spokenReply = if (confirmConsequential) {
                    "I prepared a $appName message${contact?.let { " to $it" } ?: ""}. Please confirm before I proceed."
                } else {
                    "Opening $appName draft${contact?.let { " for $it" } ?: ""}."
                },
                robotState = "SUCCESS",
                parameters = CommandParams(appName = appName, contact = contact, messageBody = body),
                requiresConfirmation = confirmConsequential,
                confirmationPrompt = "Confirm sending $appName message${contact?.let { " to $it" } ?: ""}${body?.let { ": \"$it\"" } ?: ""}?"
            )
        }

        // Call contact (confirmation-gated)
        if (Regex("^(?:call|dial|phone)\\s+(.+)$", RegexOption.IGNORE_CASE).containsMatchIn(cleaned)) {
            val contact = Regex("^(?:call|dial|phone)\\s+(.+)$", RegexOption.IGNORE_CASE)
                .find(cleaned)?.groupValues?.get(1)?.trim()
            return RoutedIntent(
                intent = "CALL_CONTACT",
                category = "LOCAL_APP",
                spokenReply = if (confirmConsequential) {
                    "Would you like me to open the dialer for ${contact ?: "that contact"}? Please confirm first."
                } else {
                    "Opening the dialer for ${contact ?: "that contact"}."
                },
                robotState = "SUCCESS",
                parameters = CommandParams(contact = contact),
                requiresConfirmation = confirmConsequential,
                confirmationPrompt = "Confirm opening phone dialer for ${contact ?: "this number"}?",
                requiredPermission = "contacts"
            )
        }

        // Notifications
        if (Regex("\\b(notification|notifications)\\b").containsMatchIn(lower)) {
            return RoutedIntent(
                intent = "READ_NOTIFICATIONS",
                category = "LOCAL_SYSTEM",
                spokenReply = "Checking your latest notification.",
                robotState = "IDLE",
                requiredPermission = "notification_listener"
            )
        }

        // Accessibility screen actions
        if (Regex("\\bscroll\\s+(down|up)\\b").containsMatchIn(lower)) {
            val dir = if (lower.contains("up")) "up" else "down"
            return RoutedIntent(
                intent = if (dir == "up") "SCROLL_UP" else "SCROLL_DOWN",
                category = "LOCAL_ACCESSIBILITY",
                spokenReply = "Scrolling $dir.",
                robotState = "SUCCESS",
                parameters = CommandParams(scrollDirection = dir),
                requiredPermission = "accessibility"
            )
        }

        if (Regex("^(?:go\\s+back|back)$").matches(lower)) {
            return RoutedIntent(
                intent = "GO_BACK",
                category = "LOCAL_ACCESSIBILITY",
                spokenReply = "Going back.",
                robotState = "SUCCESS",
                requiredPermission = "accessibility"
            )
        }

        if (Regex("^(?:go\\s+home|home\\s+screen)$").matches(lower)) {
            return RoutedIntent(
                intent = "GO_HOME",
                category = "LOCAL_ACCESSIBILITY",
                spokenReply = "Going to the home screen.",
                robotState = "SUCCESS",
                requiredPermission = "accessibility"
            )
        }

        if (Regex("^(?:click|tap|press)\\s+(.+)$", RegexOption.IGNORE_CASE).containsMatchIn(cleaned)) {
            val label = Regex("^(?:click|tap|press)\\s+(.+)$", RegexOption.IGNORE_CASE)
                .find(cleaned)?.groupValues?.get(1)?.trim()
            return RoutedIntent(
                intent = "CLICK_UI_ELEMENT",
                category = "LOCAL_ACCESSIBILITY",
                spokenReply = "Tapping \"$label\".",
                robotState = "SUCCESS",
                parameters = CommandParams(targetLabel = label),
                requiredPermission = "accessibility"
            )
        }

        // Generic "Open <App>"
        val openMatch = Regex("^(?:open|launch|start)\\s+([a-zA-Z0-9 .+'-]{2,40})$", RegexOption.IGNORE_CASE).find(cleaned)
        if (openMatch != null) {
            val appName = openMatch.groupValues[1].trim()
            return RoutedIntent(
                intent = "OPEN_APP",
                category = "LOCAL_APP",
                spokenReply = "Opening $appName.",
                robotState = "SUCCESS",
                parameters = CommandParams(appName = appName)
            )
        }

        // Capabilities
        if (Regex("\\b(what can you do|help|capabilities)\\b").containsMatchIn(lower)) {
            return RoutedIntent(
                intent = "CAPABILITIES",
                category = "LOCAL_SYSTEM",
                spokenReply = "I can launch installed apps, toggle the flashlight, adjust volume and media, set alarms and timers, open Android settings, start camera and Maps, read notifications, scroll or tap via Accessibility, and answer questions.",
                robotState = "IDLE"
            )
        }

        // Everything else falls through to IntentRouter (Gemini online if allowed, or honest offline fallback)
        return null
    }

    private fun extractDurationSeconds(lower: String): Int? {
        val m = Regex("(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty)\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)")
            .find(lower) ?: return null
        val rawNum = m.groupValues[1]
        val unit = m.groupValues[2]
        val value = rawNum.toIntOrNull() ?: WORD_TO_NUM[rawNum] ?: return null
        return when {
            unit.startsWith("h") -> value * 3600
            unit.startsWith("m") -> value * 60
            else -> value
        }.coerceIn(1, 86400)
    }

    private fun formatDuration(seconds: Int): String = when {
        seconds >= 3600 -> "${seconds / 3600} hour(s)"
        seconds >= 60 -> "${seconds / 60} minute(s)"
        else -> "$seconds second(s)"
    }
}
