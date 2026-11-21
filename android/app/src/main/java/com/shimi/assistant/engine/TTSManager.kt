package com.shimi.assistant.engine

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID

/**
 * Offline-capable Android TextToSpeech manager with speaking start/done callbacks
 * so the assistant cleanly returns to low-power listening after finishing speech.
 */
class TTSManager(context: Context) {

    private var tts: TextToSpeech? = null

    @Volatile
    private var ready = false

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.getDefault()
                ready = true
            }
        }
    }

    fun speak(
        text: String,
        muted: Boolean,
        onStart: () -> Unit = {},
        onDone: () -> Unit = {}
    ) {
        if (muted || text.isBlank() || !ready) {
            onDone()
            return
        }
        val utteranceId = "shimi_${UUID.randomUUID()}"
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {
                if (id == utteranceId) onStart()
            }

            override fun onDone(id: String?) {
                if (id == utteranceId) onDone()
            }

            @Deprecated("Deprecated in Java")
            override fun onError(id: String?) {
                if (id == utteranceId) onDone()
            }
        })
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    fun stop() {
        runCatching { tts?.stop() }
    }

    fun shutdown() {
        runCatching { tts?.stop() }
        runCatching { tts?.shutdown() }
        tts = null
        ready = false
    }
}
