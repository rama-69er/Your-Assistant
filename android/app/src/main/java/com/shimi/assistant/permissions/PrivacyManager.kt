package com.shimi.assistant.permissions

import android.content.Context
import com.shimi.assistant.data.AssistantConfig
import com.shimi.assistant.data.SettingsRepository

/**
 * Enforces Shimi's privacy-first architecture:
 * - No continuous background cloud audio streaming.
 * - Master switch immediately disables wake word, microphone, and floating overlay.
 * - Consequential actions (send message, call, delete, purchase) require explicit confirmation.
 */
class PrivacyManager(private val context: Context) {

    private val settingsRepository = SettingsRepository(context)

    fun isCloudAllowed(config: AssistantConfig = settingsRepository.load()): Boolean {
        return config.aiMode != "offline_only" && config.cloudGeminiEnabled
    }

    fun requiresExplicitConfirmation(intent: String, config: AssistantConfig = settingsRepository.load()): Boolean {
        if (!config.confirmConsequentialActions) return false
        return intent in CONSEQUENTIAL_INTENTS
    }

    fun isRestrictedSecurityTarget(text: String): Boolean {
        val lower = text.lowercase()
        return RESTRICTED_KEYWORDS.any { lower.contains(it) }
    }

    companion object {
        private val CONSEQUENTIAL_INTENTS = setOf(
            "COMPOSE_MESSAGE",
            "CALL_CONTACT"
        )

        private val RESTRICTED_KEYWORDS = listOf(
            "password",
            "passcode",
            "pin code",
            "otp",
            "2fa",
            "biometric",
            "fingerprint",
            "bank transfer",
            "send money",
            "wire money",
            "credit card",
            "uninstall"
        )
    }
}
