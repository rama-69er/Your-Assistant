import type { PersonalityStyle, VoiceOutputMode } from '../core/types';
import { synthesizeGeminiSpeech } from './geminiService';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export interface VoiceCallbacks {
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onAudioLevel: (level: number) => void;
  onListeningChange: (listening: boolean) => void;
  onError: (code: string, message: string) => void;
}

/**
 * Manages real microphone SpeechRecognition, Web Audio RMS volume metering,
 * and spoken response playback (Gemini TTS WAV + Web Speech fallback).
 * Always releases microphone tracks and audio contexts on stop().
 */
export class VoiceAssistantController {
  private recognition: SpeechRecognitionLike | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private meterRafId: number | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isListening = false;

  async startListening(callbacks: VoiceCallbacks): Promise<boolean> {
    this.stopSpeaking();
    const Ctor = getSpeechRecognitionCtor();

    if (!Ctor) {
      callbacks.onError(
        'UNSUPPORTED',
        'Voice speech recognition is not supported in this browser. You can still type commands directly below.'
      );
      return false;
    }

    // Start real microphone audio-level meter if getUserMedia is available
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.startAudioMeter(this.mediaStream, callbacks.onAudioLevel);
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        callbacks.onError(
          'PERMISSION_DENIED',
          'I need microphone permission before I can listen to your commands.'
        );
        return false;
      }
      // Continue with SpeechRecognition even if AudioContext metering isn't available
    }

    try {
      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        this.isListening = true;
        callbacks.onListeningChange(true);
      };

      recognition.onresult = (event) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalText += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }
        if (interim.trim()) {
          callbacks.onInterimTranscript(interim.trim());
        }
        if (finalText.trim()) {
          callbacks.onFinalTranscript(finalText.trim());
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          callbacks.onError(
            'PERMISSION_DENIED',
            'I need microphone permission before I can listen to your commands.'
          );
        } else if (event.error === 'no-speech') {
          callbacks.onError('NO_SPEECH', "I didn't hear anything. Tap the microphone when you're ready to speak.");
        } else if (event.error !== 'aborted') {
          callbacks.onError(event.error, `Voice input paused (${event.error}). You can tap to try again or type.`);
        }
        this.stopListening(callbacks.onListeningChange, callbacks.onAudioLevel);
      };

      recognition.onend = () => {
        this.stopListening(callbacks.onListeningChange, callbacks.onAudioLevel);
      };

      this.recognition = recognition;
      recognition.start();
      return true;
    } catch {
      this.stopListening(callbacks.onListeningChange, callbacks.onAudioLevel);
      callbacks.onError('START_FAILED', 'Could not start speech recognition in this browser.');
      return false;
    }
  }

  private startAudioMeter(stream: MediaStream, onLevel: (level: number) => void) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.audioContext = ctx;
      this.analyser = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        onLevel(Math.min(1, rms * 4.5));
        this.meterRafId = window.requestAnimationFrame(tick);
      };
      this.meterRafId = window.requestAnimationFrame(tick);
    } catch {
      onLevel(0);
    }
  }

  stopListening(
    onListeningChange?: (listening: boolean) => void,
    onAudioLevel?: (level: number) => void
  ): void {
    if (this.meterRafId !== null) {
      window.cancelAnimationFrame(this.meterRafId);
      this.meterRafId = null;
    }
    if (this.recognition) {
      const rec = this.recognition;
      this.recognition = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.stop();
      } catch {
        // Ignore already-stopped recognition
      }
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.analyser = null;
    if (this.isListening) {
      this.isListening = false;
    }
    onAudioLevel?.(0);
    onListeningChange?.(false);
  }

  async speak(params: {
    text: string;
    personality: PersonalityStyle;
    mode: VoiceOutputMode;
    cloudGeminiEnabled: boolean;
    onSpeakingStart: () => void;
    onSpeakingEnd: () => void;
  }): Promise<void> {
    this.stopSpeaking();
    const { text, personality, mode, cloudGeminiEnabled, onSpeakingStart, onSpeakingEnd } = params;
    if (mode === 'muted' || !text.trim()) {
      return;
    }

    if (mode === 'gemini_tts' && cloudGeminiEnabled) {
      const tts = await synthesizeGeminiSpeech(text, personality);
      if (tts?.audioBase64) {
        await this.playBase64Audio(tts.audioBase64, tts.mimeType, onSpeakingStart, onSpeakingEnd);
        return;
      }
    }

    // Fallback to device Web Speech Synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = personality === 'calm' ? 0.96 : 1.04;
          utterance.pitch = personality === 'playful' ? 1.12 : 1.03;
          utterance.onstart = () => onSpeakingStart();
          utterance.onend = () => {
            onSpeakingEnd();
            resolve();
          };
          utterance.onerror = () => {
            onSpeakingEnd();
            resolve();
          };
          window.speechSynthesis.speak(utterance);
        } catch {
          onSpeakingEnd();
          resolve();
        }
      });
    }
  }

  private playBase64Audio(
    base64: string,
    mimeType: string,
    onStart: () => void,
    onEnd: () => void
  ): Promise<void> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(`data:${mimeType};base64,${base64}`);
        this.currentAudio = audio;
        audio.onplay = () => onStart();
        audio.onended = () => {
          this.currentAudio = null;
          onEnd();
          resolve();
        };
        audio.onerror = () => {
          this.currentAudio = null;
          onEnd();
          resolve();
        };
        audio.play().catch(() => {
          this.currentAudio = null;
          onEnd();
          resolve();
        });
      } catch {
        onEnd();
        resolve();
      }
    });
  }

  stopSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  releaseAll(
    onListeningChange?: (listening: boolean) => void,
    onAudioLevel?: (level: number) => void
  ): void {
    this.stopListening(onListeningChange, onAudioLevel);
    this.stopSpeaking();
  }
}
