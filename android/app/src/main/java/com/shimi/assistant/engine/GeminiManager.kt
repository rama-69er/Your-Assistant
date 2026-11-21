package com.shimi.assistant.engine

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.shimi.assistant.BuildConfig
import com.shimi.assistant.data.AssistantConfig
import com.shimi.assistant.data.CommandParams
import com.shimi.assistant.data.RoutedIntent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Calls the Shimi server-side `/api/shimi/interpret` proxy route.
 * Security rule: NEVER embeds a Gemini API key inside the Android APK.
 */
class GeminiManager(private val context: Context) {

    fun isOnline(): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    suspend fun interpret(utterance: String, config: AssistantConfig): RoutedIntent =
        withContext(Dispatchers.IO) {
            if (!isOnline()) {
                return@withContext RoutedIntent(
                    intent = "GENERAL_ANSWER",
                    category = "CLOUD_GEMINI",
                    spokenReply = "You appear to be offline, so I can't reach Gemini right now. Offline phone commands like flashlight, alarms, timers, volume, and launching apps still work.",
                    robotState = "SORRY",
                    source = "local_offline"
                )
            }

            runCatching {
                val endpoint = "${BuildConfig.SHIMI_API_BASE_URL.trimEnd('/')}/api/shimi/interpret"
                val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 9000
                    readTimeout = 11000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }

                val body = JSONObject().apply {
                    put("utterance", utterance)
                    put("assistantName", config.name)
                    put("personality", "warm")
                }
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }

                val code = conn.responseCode
                val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()
                    ?.use { it.readText() }
                    .orEmpty()
                conn.disconnect()

                if (code !in 200..299) {
                    throw IllegalStateException("Server returned HTTP $code")
                }

                val root = JSONObject(text)
                val interp = root.optJSONObject("interpretation") ?: root
                val paramsJson = interp.optJSONObject("parameters") ?: JSONObject()

                RoutedIntent(
                    intent = interp.optString("intent", "GENERAL_ANSWER"),
                    category = interp.optString("category", "CLOUD_GEMINI"),
                    spokenReply = interp.optString("spokenReply", "Here's what I found."),
                    robotState = interp.optString("robotState", "IDLE"),
                    parameters = CommandParams(
                        appName = paramsJson.optString("appName").ifBlank { null },
                        query = paramsJson.optString("query").ifBlank { null },
                        contact = paramsJson.optString("contact").ifBlank { null },
                        messageBody = paramsJson.optString("messageBody").ifBlank { null },
                        destination = paramsJson.optString("destination").ifBlank { null },
                        timerSeconds = if (paramsJson.has("timerSeconds")) paramsJson.optInt("timerSeconds") else null,
                        alarmTime = paramsJson.optString("alarmTime").ifBlank { null },
                        settingsTarget = paramsJson.optString("settingsTarget").ifBlank { null },
                        targetLabel = paramsJson.optString("targetLabel").ifBlank { null }
                    ),
                    requiresConfirmation = interp.optBoolean("requiresConfirmation", false),
                    confirmationPrompt = interp.optString("confirmationPrompt").ifBlank { null },
                    requiredPermission = interp.optString("requiredPermission").ifBlank { null },
                    source = "gemini"
                )
            }.getOrElse { err ->
                RoutedIntent(
                    intent = "GENERAL_ANSWER",
                    category = "CLOUD_GEMINI",
                    spokenReply = "I couldn't reach Gemini right now (${err.message ?: "connection timeout"}). Try an offline phone command or check your connection.",
                    robotState = "SORRY",
                    source = "local_offline"
                )
            }
        }
}
