package com.shimi.assistant.engine

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.shimi.assistant.data.WakeWordSensitivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.abs

/**
 * Pluggable local wake-word contract so teams can swap in Porcupine / Vosk / Sherpa-ONNX
 * without touching the service or assistant state machine.
 */
interface WakeWordDetector {
    fun start(wakeWord: String, sensitivity: WakeWordSensitivity)
    fun pause()
    fun stop()
}

/**
 * Privacy-first on-device wake-word detector:
 * 1. Low-power local AudioRecord RMS voice activity gate (zero network calls, zero disk recording).
 * 2. Only when speech energy crosses the configured sensitivity threshold does it spin up
 *    Android's on-device SpeechRecognizer (`EXTRA_PREFER_OFFLINE = true`) for a brief window
 *    to check whether the user's custom wake word (e.g., "Shimi" or a pet's name) was spoken.
 * 3. Includes cooldown and backoff so silence never drains battery or floods audio focus.
 */
class WakeWordEngine(
    private val context: Context,
    private val onWakeWordDetected: (matchedPhrase: String, remainderCommand: String) -> Unit,
    private val onDebugTrace: (stage: String, summary: String, detail: String, status: String) -> Unit
) : WakeWordDetector {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var activeWakeWord: String = "shimi"

    @Volatile
    private var sensitivity: WakeWordSensitivity = WakeWordSensitivity.BALANCED

    @Volatile
    private var running = false

    @Volatile
    private var paused = false

    @Volatile
    private var recognizerBusy = false

    private var vadJob: Job? = null
    private var localRecognizer: SpeechRecognizer? = null

    override fun start(wakeWord: String, sensitivity: WakeWordSensitivity) {
        this.activeWakeWord = wakeWord.trim().lowercase(Locale.getDefault()).ifBlank { "shimi" }
        this.sensitivity = sensitivity
        this.paused = false
        if (running) return
        running = true
        onDebugTrace(
            "WAKE_WORD",
            "Local wake-word engine started",
            "Wake word: \"$activeWakeWord\" (sensitivity=${sensitivity.wireValue}, local-only)",
            "ok"
        )
        startEnergyGateLoop()
    }

    override fun pause() {
        paused = true
        releaseLocalRecognizer()
    }

    fun resume() {
        paused = false
    }

    override fun stop() {
        running = false
        paused = false
        vadJob?.cancel()
        vadJob = null
        releaseLocalRecognizer()
    }

    @SuppressLint("MissingPermission")
    private fun startEnergyGateLoop() {
        vadJob?.cancel()
        vadJob = scope.launch {
            val sampleRate = 16000
            val minBuf = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            ).coerceAtLeast(2048)

            var audioRecord: AudioRecord? = null
            try {
                audioRecord = AudioRecord(
                    MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    minBuf * 2
                )
                if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
                    onDebugTrace(
                        "WAKE_WORD",
                        "AudioRecord unavailable",
                        "Microphone unavailable or held by another app; tap-to-talk remains active.",
                        "warn"
                    )
                    return@launch
                }

                val buffer = ShortArray(minBuf / 2)
                audioRecord.startRecording()

                while (isActive && running) {
                    if (paused || recognizerBusy) {
                        delay(180)
                        continue
                    }

                    val read = audioRecord.read(buffer, 0, buffer.size)
                    if (read <= 0) {
                        delay(120)
                        continue
                    }

                    var sum = 0L
                    for (i in 0 until read) {
                        sum += abs(buffer[i].toInt())
                    }
                    val avgAmplitude = (sum / read).toInt()

                    if (avgAmplitude >= sensitivity.energyThreshold) {
                        // Release AudioRecord briefly so SpeechRecognizer can check for the wake word
                        audioRecord.stop()
                        recognizerBusy = true
                        triggerOfflineWakeSpotter()
                        while (isActive && running && recognizerBusy) {
                            delay(100)
                        }
                        if (isActive && running && !paused) {
                            delay(250)
                            runCatching { audioRecord.startRecording() }
                        }
                    } else {
                        delay(90)
                    }
                }
            } catch (err: Exception) {
                onDebugTrace(
                    "WAKE_WORD",
                    "Wake-word loop stopped",
                    err.message ?: "Audio capture error",
                    "error"
                )
            } finally {
                runCatching { audioRecord?.stop() }
                runCatching { audioRecord?.release() }
            }
        }
    }

    private fun triggerOfflineWakeSpotter() {
        mainHandler.post {
            if (!running || paused) {
                recognizerBusy = false
                return@post
            }
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                recognizerBusy = false
                return@post
            }

            releaseLocalRecognizer()
            val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
            localRecognizer = recognizer
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) = Unit
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit

                override fun onPartialResults(partialResults: Bundle?) {
                    checkMatches(partialResults)
                }

                override fun onResults(results: Bundle?) {
                    checkMatches(results)
                    finishSpotterCycle()
                }

                override fun onError(error: Int) {
                    finishSpotterCycle()
                }
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                )
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
            }
            runCatching { recognizer.startListening(intent) }.onFailure { finishSpotterCycle() }
        }
    }

    private fun checkMatches(bundle: Bundle?) {
        if (!recognizerBusy) return
        val candidates = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
        val match = matchWakeWord(candidates, activeWakeWord) ?: return
        finishSpotterCycle()
        paused = true
        onDebugTrace(
            "WAKE_WORD",
            "Wake word detected: \"${match.first}\"",
            if (match.second.isNotBlank()) "Inline command: \"${match.second}\"" else "Opening active command window",
            "ok"
        )
        onWakeWordDetected(match.first, match.second)
    }

    private fun finishSpotterCycle() {
        releaseLocalRecognizer()
        recognizerBusy = false
    }

    private fun releaseLocalRecognizer() {
        mainHandler.post {
            runCatching { localRecognizer?.stopListening() }
            runCatching { localRecognizer?.destroy() }
            localRecognizer = null
        }
    }

    companion object {
        fun matchWakeWord(candidates: List<String>, wakeWord: String): Pair<String, String>? {
            val target = wakeWord.trim().lowercase(Locale.getDefault())
            if (target.isBlank()) return null
            val escaped = Regex.escape(target)
            val pattern = Regex("^(?:hey|hi|ok|okay)?\\s*$escaped(?:[,!?.\\s]+(.*))?$", RegexOption.IGNORE_CASE)
            for (raw in candidates) {
                val cleaned = raw.trim()
                val match = pattern.find(cleaned)
                if (match != null) {
                    val remainder = match.groupValues.getOrNull(1)?.trim().orEmpty()
                    return target to remainder
                }
                if (cleaned.lowercase(Locale.getDefault()).contains(target)) {
                    val idx = cleaned.lowercase(Locale.getDefault()).indexOf(target)
                    val after = cleaned.substring(idx + target.length).trim(' ', ',', '.', '!', '?')
                    return target to after
                }
            }
            return null
        }
    }
}
