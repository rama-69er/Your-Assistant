package com.shimi.assistant.data

import android.content.Context
import android.content.SharedPreferences
import com.shimi.assistant.BuildConfig

/**
 * Local-only persistence for the versioned AssistantConfig.
 * On first launch, loads personalized APK defaults from BuildConfig.SHIMI_DEFAULT_* so
 * customized APKs immediately open with the user's chosen name, wake word, style, accessory,
 * personality, and theme without re-configuring.
 */
class SettingsRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): AssistantConfig {
        if (!prefs.getBoolean(KEY_INITIALIZED, false)) {
            val defaults = buildDefaultsFromBuildConfig()
            save(defaults)
            return defaults
        }

        val name = prefs.getString(KEY_NAME, BuildConfig.SHIMI_DEFAULT_NAME)
            .orEmpty().ifBlank { BuildConfig.SHIMI_DEFAULT_NAME }
        val wakeWord = prefs.getString(KEY_WAKE_WORD, BuildConfig.SHIMI_DEFAULT_WAKE_WORD)
            .orEmpty().ifBlank { name }
        val offlineOnly = prefs.getBoolean(KEY_OFFLINE_ONLY, false)
        val aiMode = prefs.getString(KEY_AI_MODE, if (offlineOnly) "offline_only" else "auto")
            ?: "auto"

        return AssistantConfig(
            schemaVersion = prefs.getInt(KEY_SCHEMA_VERSION, 2),
            name = name,
            wakeWord = wakeWord,
            wakeWordEnabled = prefs.getBoolean(KEY_WAKE_WORD_ENABLED, true),
            wakeWordSensitivity = prefs.getString(KEY_WAKE_WORD_SENSITIVITY, "balanced") ?: "balanced",
            robotStyle = prefs.getString(KEY_ROBOT_STYLE, BuildConfig.SHIMI_DEFAULT_STYLE)
                ?: BuildConfig.SHIMI_DEFAULT_STYLE,
            accessory = prefs.getString(KEY_ACCESSORY, BuildConfig.SHIMI_DEFAULT_ACCESSORY)
                ?: BuildConfig.SHIMI_DEFAULT_ACCESSORY,
            themeId = prefs.getString(KEY_THEME_ID, BuildConfig.SHIMI_DEFAULT_THEME)
                ?: BuildConfig.SHIMI_DEFAULT_THEME,
            personality = prefs.getString(KEY_PERSONALITY, BuildConfig.SHIMI_DEFAULT_PERSONALITY)
                ?: BuildConfig.SHIMI_DEFAULT_PERSONALITY,
            backgroundAssistantEnabled = prefs.getBoolean(KEY_BACKGROUND_ENABLED, false),
            aiMode = aiMode,
            cloudGeminiEnabled = prefs.getBoolean(KEY_CLOUD_GEMINI, !offlineOnly),
            offlineOnly = offlineOnly || aiMode == "offline_only",
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
        val safeName = config.name.ifBlank { BuildConfig.SHIMI_DEFAULT_NAME }
        val safeWake = config.wakeWord.ifBlank { safeName }
        val isOfflineOnly = config.offlineOnly || config.aiMode == "offline_only"
        prefs.edit()
            .putBoolean(KEY_INITIALIZED, true)
            .putInt(KEY_SCHEMA_VERSION, config.schemaVersion)
            .putString(KEY_NAME, safeName)
            .putString(KEY_WAKE_WORD, safeWake)
            .putBoolean(KEY_WAKE_WORD_ENABLED, config.wakeWordEnabled)
            .putString(KEY_WAKE_WORD_SENSITIVITY, config.wakeWordSensitivity)
            .putString(KEY_ROBOT_STYLE, config.robotStyle)
            .putString(KEY_ACCESSORY, config.accessory)
            .putString(KEY_THEME_ID, config.themeId)
            .putString(KEY_PERSONALITY, config.personality)
            .putBoolean(KEY_BACKGROUND_ENABLED, config.backgroundAssistantEnabled)
            .putString(KEY_AI_MODE, if (isOfflineOnly) "offline_only" else "auto")
            .putBoolean(KEY_CLOUD_GEMINI, !isOfflineOnly && config.cloudGeminiEnabled)
            .putBoolean(KEY_OFFLINE_ONLY, isOfflineOnly)
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
        prefs.edit()
            .putBoolean(KEY_INITIALIZED, true)
            .putBoolean(KEY_BACKGROUND_ENABLED, enabled)
            .apply()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
    }

    fun buildDefaultsFromBuildConfig(): AssistantConfig = AssistantConfig(
        schemaVersion = 2,
        name = BuildConfig.SHIMI_DEFAULT_NAME,
        wakeWord = BuildConfig.SHIMI_DEFAULT_WAKE_WORD,
        robotStyle = BuildConfig.SHIMI_DEFAULT_STYLE,
        accessory = BuildConfig.SHIMI_DEFAULT_ACCESSORY,
        themeId = BuildConfig.SHIMI_DEFAULT_THEME,
        personality = BuildConfig.SHIMI_DEFAULT_PERSONALITY
    )

    companion object {
        private const val PREFS_NAME = "shimi_assistant_local_prefs_v2"
        private const val KEY_INITIALIZED = "initialized_from_build_config"
        private const val KEY_SCHEMA_VERSION = "schema_version"
        private const val KEY_NAME = "name"
        private const val KEY_WAKE_WORD = "wake_word"
        private const val KEY_WAKE_WORD_ENABLED = "wake_word_enabled"
        private const val KEY_WAKE_WORD_SENSITIVITY = "wake_word_sensitivity"
        private const val KEY_ROBOT_STYLE = "robot_style"
        private const val KEY_ACCESSORY = "accessory"
        private const val KEY_THEME_ID = "theme_id"
        private const val KEY_PERSONALITY = "personality"
        private const val KEY_BACKGROUND_ENABLED = "background_enabled"
        private const val KEY_AI_MODE = "ai_mode"
        private const val KEY_CLOUD_GEMINI = "cloud_gemini"
        private const val KEY_OFFLINE_ONLY = "offline_only"
        private const val KEY_CONFIRM_CONSEQUENTIAL = "confirm_consequential"
        private const val KEY_FLOATING_MODE = "floating_mode"
        private const val KEY_FLOATING_SIZE = "floating_size"
        private const val KEY_FLOATING_OPACITY = "floating_opacity"
        private const val KEY_VOICE_OUTPUT_MODE = "voice_output_mode"
        private const val KEY_BATTERY_SAVER = "battery_saver"
        private const val KEY_DEBUG_MODE = "debug_mode"
    }
}
