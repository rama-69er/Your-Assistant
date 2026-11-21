package com.shimi.assistant.data

import android.content.Context
import android.content.SharedPreferences

/**
 * Local-only persistence for Shimi preferences.
 * Never stores conversation transcripts, voice recordings, or API keys.
 */
class SettingsRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): AssistantConfig {
        val name = prefs.getString(KEY_NAME, "Shimi").orEmpty().ifBlank { "Shimi" }
        val wakeWord = prefs.getString(KEY_WAKE_WORD, name).orEmpty().ifBlank { name }
        return AssistantConfig(
            name = name,
            wakeWord = wakeWord,
            wakeWordEnabled = prefs.getBoolean(KEY_WAKE_WORD_ENABLED, true),
            wakeWordSensitivity = prefs.getString(KEY_WAKE_WORD_SENSITIVITY, "balanced") ?: "balanced",
            backgroundAssistantEnabled = prefs.getBoolean(KEY_BACKGROUND_ENABLED, false),
            aiMode = prefs.getString(KEY_AI_MODE, "auto") ?: "auto",
            cloudGeminiEnabled = prefs.getBoolean(KEY_CLOUD_GEMINI, true),
            confirmConsequentialActions = prefs.getBoolean(KEY_CONFIRM_CONSEQUENTIAL, true),
            floatingMode = prefs.getString(KEY_FLOATING_MODE, "overlay") ?: "overlay",
            floatingSize = prefs.getString(KEY_FLOATING_SIZE, "medium") ?: "medium",
            floatingOpacity = prefs.getFloat(KEY_FLOATING_OPACITY, 0.94f).coerceIn(0.45f, 1.0f),
            voiceOutputMode = prefs.getString(KEY_VOICE_OUTPUT_MODE, "device_tts") ?: "device_tts",
            batterySaver = prefs.getBoolean(KEY_BATTERY_SAVER, true),
            debugModeEnabled = prefs.getBoolean(KEY_DEBUG_MODE, false)
        )
    }

    fun save(config: AssistantConfig) {
        prefs.edit()
            .putString(KEY_NAME, config.name.ifBlank { "Shimi" })
            .putString(KEY_WAKE_WORD, config.wakeWord.ifBlank { config.name.ifBlank { "Shimi" } })
            .putBoolean(KEY_WAKE_WORD_ENABLED, config.wakeWordEnabled)
            .putString(KEY_WAKE_WORD_SENSITIVITY, config.wakeWordSensitivity)
            .putBoolean(KEY_BACKGROUND_ENABLED, config.backgroundAssistantEnabled)
            .putString(KEY_AI_MODE, config.aiMode)
            .putBoolean(KEY_CLOUD_GEMINI, config.cloudGeminiEnabled)
            .putBoolean(KEY_CONFIRM_CONSEQUENTIAL, config.confirmConsequentialActions)
            .putString(KEY_FLOATING_MODE, config.floatingMode)
            .putString(KEY_FLOATING_SIZE, config.floatingSize)
            .putFloat(KEY_FLOATING_OPACITY, config.floatingOpacity.coerceIn(0.45f, 1.0f))
            .putString(KEY_VOICE_OUTPUT_MODE, config.voiceOutputMode)
            .putBoolean(KEY_BATTERY_SAVER, config.batterySaver)
            .putBoolean(KEY_DEBUG_MODE, config.debugModeEnabled)
            .apply()
    }

    fun updateBackgroundEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_BACKGROUND_ENABLED, enabled).apply()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val PREFS_NAME = "shimi_assistant_local_prefs_v2"
        private const val KEY_NAME = "name"
        private const val KEY_WAKE_WORD = "wake_word"
        private const val KEY_WAKE_WORD_ENABLED = "wake_word_enabled"
        private const val KEY_WAKE_WORD_SENSITIVITY = "wake_word_sensitivity"
        private const val KEY_BACKGROUND_ENABLED = "background_enabled"
        private const val KEY_AI_MODE = "ai_mode"
        private const val KEY_CLOUD_GEMINI = "cloud_gemini"
        private const val KEY_CONFIRM_CONSEQUENTIAL = "confirm_consequential"
        private const val KEY_FLOATING_MODE = "floating_mode"
        private const val KEY_FLOATING_SIZE = "floating_size"
        private const val KEY_FLOATING_OPACITY = "floating_opacity"
        private const val KEY_VOICE_OUTPUT_MODE = "voice_output_mode"
        private const val KEY_BATTERY_SAVER = "battery_saver"
        private const val KEY_DEBUG_MODE = "debug_mode"
    }
}
