package com.shimi.assistant.engine

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

/**
 * Active command speech recognizer running on the main thread per Android SpeechRecognizer rules.
 * Prefers on-device offline speech recognition when installed on the phone.
 */
class SpeechEngine(private val context: Context) {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null

    @Volatile
    var isListening: Boolean = false
        private set

    fun startListening(
        preferOffline: Boolean = true,
        onPartial: (String) -> Unit,
        onFinal: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        mainHandler.post {
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                onError("Android SpeechRecognizer is unavailable on this device.")
                return@post
            }
            stopListening()

            val instance = SpeechRecognizer.createSpeechRecognizer(context)
            recognizer = instance
            isListening = true

            instance.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) = Unit
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit

                override fun onEndOfSpeech() {
                    isListening = false
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val partial = partialResults
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        .orEmpty()
                    if (partial.isNotBlank()) onPartial(partial)
                }

                override fun onResults(results: Bundle?) {
                    isListening = false
                    val best = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        .orEmpty()
                        .trim()
                    if (best.isBlank()) {
                        onError("I didn't catch a command. Please try again.")
                    } else {
                        onFinal(best)
                    }
                }

                override fun onError(error: Int) {
                    isListening = false
                    onError(mapError(error))
                }
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                )
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            }

            runCatching { instance.startListening(intent) }.onFailure { err ->
                isListening = false
                onError(err.message ?: "Could not start speech recognition.")
            }
        }
    }

    fun stopListening() {
        mainHandler.post {
            isListening = false
            runCatching { recognizer?.stopListening() }
            runCatching { recognizer?.destroy() }
            recognizer = null
        }
    }

    private fun mapError(code: Int): String = when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "Audio recording error while listening."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
            "Network speech recognition unavailable; install an offline language pack for offline voice."
        SpeechRecognizer.ERROR_NO_MATCH -> "I couldn't recognize that command."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer is busy; please try again."
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected."
        else -> "Speech recognition interrupted (code $code)."
    }
}
