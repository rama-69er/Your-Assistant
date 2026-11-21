package com.shimi.assistant.data

import kotlinx.serialization.Serializable

enum class RobotState {
    IDLE,
    LISTENING,
    THINKING,
    SPEAKING,
    SUCCESS,
    CONFUSED,
    SORRY,
    SLEEPING
}

enum class AIMode(val wireValue: String) {
    AUTO("auto"),
    OFFLINE_ONLY("offline_only");

    companion object {
        fun fromWire(value: String?): AIMode =
            entries.firstOrNull { it.wireValue == value } ?: AUTO
    }
}

enum class WakeWordSensitivity(val wireValue: String, val energyThreshold: Int) {
    LOW("low", 2100),
    BALANCED("balanced", 1450),
    HIGH("high", 950);

    companion object {
        fun fromWire(value: String?): WakeWordSensitivity =
            entries.firstOrNull { it.wireValue == value } ?: BALANCED
    }
}

enum class FloatingMode(val wireValue: String) {
    OVERLAY("overlay"),
    BUBBLE("bubble"),
    NOTIFICATION("notification");

    companion object {
        fun fromWire(value: String?): FloatingMode =
            entries.firstOrNull { it.wireValue == value } ?: OVERLAY
    }
}

enum class FloatingSize(val wireValue: String, val sizeDp: Int) {
    SMALL("small", 56),
    MEDIUM("medium", 70),
    LARGE("large", 84);

    companion object {
        fun fromWire(value: String?): FloatingSize =
            entries.firstOrNull { it.wireValue == value } ?: MEDIUM
    }
}

@Serializable
data class AssistantConfig(
    val name: String = "Shimi",
    val wakeWord: String = "Shimi",
    val wakeWordEnabled: Boolean = true,
    val wakeWordSensitivity: String = "balanced",
    val backgroundAssistantEnabled: Boolean = false,
    val aiMode: String = "auto",
    val cloudGeminiEnabled: Boolean = true,
    val confirmConsequentialActions: Boolean = true,
    val floatingMode: String = "overlay",
    val floatingSize: String = "medium",
    val floatingOpacity: Float = 0.94f,
    val voiceOutputMode: String = "device_tts",
    val batterySaver: Boolean = true,
    val debugModeEnabled: Boolean = false
)

@Serializable
data class CommandParams(
    val appName: String? = null,
    val query: String? = null,
    val contact: String? = null,
    val messageBody: String? = null,
    val destination: String? = null,
    val timerSeconds: Int? = null,
    val alarmTime: String? = null,
    val alarmLabel: String? = null,
    val mediaAction: String? = null,
    val volumeDirection: String? = null,
    val flashlightState: String? = null,
    val settingsTarget: String? = null,
    val scrollDirection: String? = null,
    val targetLabel: String? = null,
    val calendarTitle: String? = null,
    val calendarTime: String? = null
)

@Serializable
data class RoutedIntent(
    val intent: String,
    val category: String,
    val spokenReply: String,
    val robotState: String = "IDLE",
    val parameters: CommandParams = CommandParams(),
    val requiresConfirmation: Boolean = false,
    val confirmationPrompt: String? = null,
    val requiredPermission: String? = null,
    val source: String = "local_offline"
)

@Serializable
data class ActionResult(
    val ok: Boolean,
    val status: String,
    val message: String,
    val requiresConfirmation: Boolean = false,
    val confirmationId: String? = null,
    val executedLocally: Boolean = true
)

@Serializable
data class DebugTracePayload(
    val stage: String,
    val summary: String,
    val detail: String = "",
    val status: String = "info",
    val durationMs: Long? = null
)

@Serializable
data class InstalledAppRecord(
    val label: String,
    val packageName: String
)

@Serializable
data class NativeBridgeEventPayload(
    val type: String,
    val timestamp: Long = System.currentTimeMillis(),
    val payload: Map<String, String> = emptyMap()
)
