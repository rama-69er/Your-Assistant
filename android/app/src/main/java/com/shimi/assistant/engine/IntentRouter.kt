package com.shimi.assistant.engine

import android.content.Context
import com.shimi.assistant.data.AssistantConfig
import com.shimi.assistant.data.RoutedIntent
import com.shimi.assistant.permissions.PrivacyManager

/**
 * Offline-First Intent Router:
 * 1. Always runs LocalCommandEngine first (zero latency, zero network dependency).
 * 2. Only calls GeminiManager when local rules do not match AND cloud AI is enabled & reachable.
 * 3. Returns an honest offline response if offline or in Offline-Only mode.
 */
class IntentRouter(
    private val context: Context,
    private val geminiManager: GeminiManager,
    private val privacyManager: PrivacyManager
) {
    suspend fun route(utterance: String, config: AssistantConfig): RoutedIntent {
        val local = LocalCommandEngine.parse(
            rawUtterance = utterance,
            assistantName = config.name,
            wakeWord = config.wakeWord,
            confirmConsequential = config.confirmConsequentialActions
        )
        if (local != null) {
            return local
        }

        if (!privacyManager.isCloudAllowed(config)) {
            return RoutedIntent(
                intent = "GENERAL_ANSWER",
                category = "CLOUD_GEMINI",
                spokenReply = "Offline-only mode is active. I can still launch apps, toggle flashlight, set alarms or timers, adjust volume, and navigate screens offline.",
                robotState = "IDLE",
                source = "local_offline"
            )
        }

        return geminiManager.interpret(utterance, config)
    }
}
