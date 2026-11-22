package com.shimi.assistant.data

import com.shimi.assistant.BuildConfig
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

enum class WakeWordSensitivity(val wireValue: String, val scoreThreshold: Float, val rmsFloor: Int) {
    LOW("low", 0.78f, 1900),
    BALANCED("balanced", 0.64f, 1300),
    HIGH("high", 0.52f, 850);

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

/**
 * Single versioned AssistantConfig shared between the native Android companion and the PWA UI.
 * First launch populates defaults from generated BuildConfig.SHIMI_DEFAULT_* fields.
 */
@Serializable
data class AssistantConfig(
    val schemaVersion: Int = 2,
    val name: String = BuildConfig.SHIMI_DEFAULT_NAME,
    val wakeWord: String = BuildConfig.SHIMI_DEFAULT_WAKE_WORD,
    val wakeWordEnabled: Boolean = true,
    val wakeWordSensitivity: String = "balanced",
    val robotStyle: String = BuildConfig.SHIMI_DEFAULT_STYLE,
    val accessory: String = BuildConfig.SHIMI_DEFAULT_ACCESSORY,
    val themeId: String = BuildConfig.SHIMI_DEFAULT_THEME,
    val personality: String = BuildConfig.SHIMI_DEFAULT_PERSONALITY,
    val backgroundAssistantEnabled: Boolean = false,
    val aiMode: String = "auto",
    val cloudGeminiEnabled: Boolean = true,
    val offlineOnly: Boolean = false,
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
    val executedLocally: Boolean = true,
    val disambiguationOptions: List<String> = emptyList()
)

@Serializable
data class InstalledAppRecord(
    val label: String,
    val packageName: String
)

@Serializable
data class SelfTestCheck(
    val id: String,
    val label: String,
    val ok: Boolean,
    val detail: String
)
