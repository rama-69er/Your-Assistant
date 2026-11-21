import React, { useEffect, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Lock,
  Radio,
  Square,
  Trash2,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { ANDROID_KOTLIN_BLUEPRINT } from '../androidBlueprint/kotlinSources';
import { fetchAndroidProjectFiles, type AndroidProjectFile } from '../services/geminiService';
import type {
  AIMode,
  AssistantPreferences,
  FloatingMode,
  FloatingSize,
  NativeServiceSnapshot,
  PermissionStatusMap,
  VoiceOutputMode,
  WakeWordSensitivity,
} from '../core/types';

interface PrivacySettingsViewProps {
  preferences: AssistantPreferences;
  permissions: PermissionStatusMap;
  nativeSnapshot: NativeServiceSnapshot;
  isSessionActive: boolean;
  geminiServerConfigured: boolean;
  onUpdatePreferences: (patch: Partial<AssistantPreferences>) => void;
  onToggleBackgroundAssistant: (enabled: boolean) => void;
  onStopSession: () => void;
  onClearAllAndReset: () => void;
}

export const PrivacySettingsView: React.FC<PrivacySettingsViewProps> = ({
  preferences,
  permissions,
  nativeSnapshot,
  isSessionActive,
  geminiServerConfigured,
  onUpdatePreferences,
  onToggleBackgroundAssistant,
  onStopSession,
  onClearAllAndReset,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [androidFiles, setAndroidFiles] = useState<AndroidProjectFile[]>(() =>
    ANDROID_KOTLIN_BLUEPRINT.map((f) => ({
      path: f.path,
      label: f.label,
      content: f.content,
    }))
  );
  const [loadedFromDisk, setLoadedFromDisk] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAndroidProjectFiles().then((files) => {
      if (active && files.length > 0) {
        setAndroidFiles(files);
        setSelectedFileIndex(0);
        setLoadedFromDisk(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const grantedCount = Object.values(permissions).filter((v) => v === 'granted').length;
  const currentFile = androidFiles[selectedFileIndex] || androidFiles[0];

  const handleCopySource = async () => {
    if (!currentFile) return;
    try {
      await navigator.clipboard.writeText(currentFile.content);
      setCopiedPath(currentFile.path);
      window.setTimeout(() => setCopiedPath(null), 2000);
    } catch {
      // Clipboard may be restricted in non-HTTPS contexts
    }
  };

  const handleDownloadSource = () => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.path.split('/').pop() || 'Shimi.kt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Privacy, Background Service &amp; Android Build
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {preferences.name} is built privacy-first: local-only wake-word detection, offline-first
            phone commands, zero saved conversation history, and zero stored voice recordings.
          </p>
        </div>
        <PWAInstallButton />
      </div>

      {/* Background Service, Wake Word & Privacy Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 space-y-6">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">
              Background Assistant &amp; Wake Word
            </h2>
          </div>

          {/* Master Switch: Shimi Background Assistant */}
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                Shimi Background Assistant
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Runs the native Android foreground service so {preferences.name} stays ready when
                you minimize or close the app. Turning this off immediately stops background
                listening, releases the microphone, and hides the floating overlay.
              </p>
              <p className="text-[11px] text-slate-500">
                Status:{' '}
                {nativeSnapshot.connected
                  ? nativeSnapshot.serviceRunning
                    ? 'Native Android foreground service running'
                    : 'Android companion connected · Service stopped'
                  : 'Browser PWA sandbox (requires native Android APK for background service)'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.backgroundAssistantEnabled}
              aria-label="Toggle Shimi Background Assistant"
              data-testid="toggle-background-assistant"
              onClick={() => onToggleBackgroundAssistant(!preferences.backgroundAssistantEnabled)}
              className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                preferences.backgroundAssistantEnabled ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  preferences.backgroundAssistantEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Custom Wake Word & Sensitivity */}
          <div className="space-y-4 pb-5 border-b border-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Local Wake-Word Detection</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Say your custom wake word (e.g., &ldquo;{preferences.wakeWord}&rdquo;) to wake{' '}
                  {preferences.name} hands-free on Android. Wake-word detection runs locally on
                  device and never streams background audio to the cloud.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.wakeWordEnabled}
                aria-label="Toggle local wake-word detection"
                onClick={() =>
                  onUpdatePreferences({ wakeWordEnabled: !preferences.wakeWordEnabled })
                }
                className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                  preferences.wakeWordEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    preferences.wakeWordEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="shimi-wake-word-input"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Custom wake word
                </label>
                <input
                  id="shimi-wake-word-input"
                  type="text"
                  maxLength={24}
                  value={preferences.wakeWord}
                  onChange={(e) =>
                    onUpdatePreferences({ wakeWord: e.target.value || preferences.name })
                  }
                  placeholder={preferences.name}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 mb-1">Wake sensitivity</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'low', label: 'Low' },
                      { id: 'balanced', label: 'Balanced' },
                      { id: 'high', label: 'High' },
                    ] as { id: WakeWordSensitivity; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdatePreferences({ wakeWordSensitivity: opt.id })}
                      className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
                        preferences.wakeWordSensitivity === opt.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* AI Mode Selector: Offline-First vs Offline Only */}
          <div className="pb-5 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-900">
                AI Routing Mode (Offline-First)
              </p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Deterministic Android actions (flashlight, volume, alarms, timers, launching apps,
              settings, camera, scrolling) always execute locally with zero Gemini API call. Choose
              whether open-ended questions may use Gemini when online.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  { id: 'auto', label: 'Auto (Offline-First + Gemini Online)' },
                  { id: 'offline_only', label: 'Offline Only (Zero Cloud AI)' },
                ] as { id: AIMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`ai-mode-${opt.id}`}
                  onClick={() =>
                    onUpdatePreferences({
                      aiMode: opt.id,
                      cloudGeminiEnabled: opt.id === 'auto',
                    })
                  }
                  className={`min-h-[42px] rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    preferences.aiMode === opt.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Server Gemini route:{' '}
              {geminiServerConfigured
                ? 'Configured on server (API key never stored in APK or browser)'
                : 'Not configured (using offline router)'}
            </p>
          </div>

          {/* Voice Output Mode */}
          <div className="pb-5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Spoken Response Output</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose whether {preferences.name} speaks via Gemini TTS, offline device speech, or stays silent.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'gemini_tts', label: 'Gemini Voice' },
                  { id: 'device_tts', label: 'Device Speech' },
                  { id: 'muted', label: 'Muted' },
                ] as { id: VoiceOutputMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdatePreferences({ voiceOutputMode: opt.id })}
                  className={`min-h-[42px] rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    preferences.voiceOutputMode === opt.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Floating Presence & Safety / Developer Controls */}
          <div className="space-y-4">
            <div className="space-y-3 pb-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Show Floating Robot on Start
                  </p>
                  <p className="text-xs text-slate-500">
                    Displays the draggable companion presence (or Android overlay/notification fallback).
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.showFloatingOnStart}
                  aria-label="Toggle floating robot on start"
                  onClick={() =>
                    onUpdatePreferences({ showFloatingOnStart: !preferences.showFloatingOnStart })
                  }
                  className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                    preferences.showFloatingOnStart ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      preferences.showFloatingOnStart ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-1">Presence mode</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'overlay', label: 'Overlay' },
                        { id: 'bubble', label: 'Bubble' },
                        { id: 'notification', label: 'Notif.' },
                      ] as { id: FloatingMode; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdatePreferences({ floatingMode: opt.id })}
                        className={`min-h-[34px] rounded-lg border text-[11px] font-semibold ${
                          preferences.floatingMode === opt.id
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-700 mb-1">Floating size</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'small', label: 'S' },
                        { id: 'medium', label: 'M' },
                        { id: 'large', label: 'L' },
                      ] as { id: FloatingSize; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdatePreferences({ floatingSize: opt.id })}
                        className={`min-h-[34px] rounded-lg border text-[11px] font-semibold ${
                          preferences.floatingSize === opt.id
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="floating-opacity-slider"
                    className="flex justify-between text-xs font-medium text-slate-700 mb-1"
                  >
                    <span>Opacity</span>
                    <span className="tabular-nums">
                      {Math.round((preferences.floatingOpacity ?? 0.94) * 100)}%
                    </span>
                  </label>
                  <input
                    id="floating-opacity-slider"
                    type="range"
                    min={45}
                    max={100}
                    value={Math.round((preferences.floatingOpacity ?? 0.94) * 100)}
                    onChange={(e) =>
                      onUpdatePreferences({ floatingOpacity: Number(e.target.value) / 100 })
                    }
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Confirm Consequential Actions
                </p>
                <p className="text-xs text-slate-500">
                  Requires explicit tap confirmation before sending WhatsApp/SMS messages or placing calls.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.confirmConsequentialActions}
                aria-label="Toggle consequential action confirmations"
                onClick={() =>
                  onUpdatePreferences({
                    confirmConsequentialActions: !preferences.confirmConsequentialActions,
                  })
                }
                className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                  preferences.confirmConsequentialActions ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    preferences.confirmConsequentialActions ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Battery-Conscious Animations</p>
                <p className="text-xs text-slate-500">
                  Reduces idle animation cadence and puts {preferences.name} to sleep sooner when inactive.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.batterySaver}
                aria-label="Toggle battery-conscious animations"
                onClick={() => onUpdatePreferences({ batterySaver: !preferences.batterySaver })}
                className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                  preferences.batterySaver ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    preferences.batterySaver ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Developer Debug Mode</p>
                <p className="text-xs text-slate-500">
                  Shows the live pipeline trace (Wake word -&gt; Speech -&gt; Intent -&gt; Executor -&gt; Result) on the Assistant screen.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.debugModeEnabled}
                aria-label="Toggle Developer Debug Mode"
                data-testid="toggle-debug-mode"
                onClick={() =>
                  onUpdatePreferences({ debugModeEnabled: !preferences.debugModeEnabled })
                }
                className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                  preferences.debugModeEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    preferences.debugModeEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Right: Privacy Summary & Danger/Reset Actions */}
        <section className="lg:col-span-5 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Current Privacy Summary</h2>

            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Runtime layer</dt>
                <dd className="font-medium text-slate-900 text-right">
                  {nativeSnapshot.connected ? 'Native Android + PWA' : 'Browser PWA'}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Wake-word audio</dt>
                <dd className="font-medium text-emerald-700 text-right">
                  Local-only (never streamed)
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Conversation history</dt>
                <dd className="font-medium text-emerald-700">Never saved</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Voice recordings</dt>
                <dd className="font-medium text-emerald-700">Never stored</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">AI routing mode</dt>
                <dd className="font-medium text-slate-900 text-right">
                  {preferences.aiMode === 'offline_only' ? 'Offline Only' : 'Offline-First + Gemini'}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Active device permissions</dt>
                <dd className="font-medium text-slate-900 tabular-nums">
                  {grantedCount} granted
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            {(isSessionActive || nativeSnapshot.serviceRunning) && (
              <button
                type="button"
                onClick={onStopSession}
                className="w-full min-h-[44px] rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 inline-flex items-center justify-center gap-2"
              >
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                Stop Active Listening &amp; Release Mic
              </button>
            )}

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full min-h-[44px] rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Clear Local Settings &amp; Reset {preferences.name}
              </button>
            ) : (
              <div className="rounded-2xl bg-rose-50 p-3.5 border border-rose-200 space-y-2.5">
                <p className="text-xs text-rose-900 font-medium">
                  This clears your saved assistant name, wake word, color theme, and temporary
                  session state, returning to first-time setup.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmReset(false);
                      onClearAllAndReset();
                    }}
                    className="flex-1 min-h-[38px] rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 min-h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Real Native Android Project Source Explorer (/android) */}
      <section
        data-testid="android-source-explorer"
        className="rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-slate-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Native Android Companion Project ({androidFiles.length} files in /android)
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {loadedFromDisk
                ? 'Loaded live from the /android Gradle & Kotlin companion project in this repository. Open /android in Android Studio to compile the APK with ShimiForegroundService, WakeWordEngine, AccessibilityService, and OverlayManager.'
                : 'Showing native Kotlin companion source files. Open /android in Android Studio to build the APK.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySource}
              className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              {copiedPath === currentFile?.path ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy File</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadSource}
              className="min-h-[38px] rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1 max-h-[132px] overflow-y-auto">
          {androidFiles.map((file, idx) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedFileIndex(idx)}
              className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-mono transition-colors ${
                idx === selectedFileIndex
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {file.label}
            </button>
          ))}
        </div>

        {currentFile && (
          <div className="rounded-2xl bg-slate-950 p-4 overflow-x-auto max-h-[420px]">
            <p className="text-[11px] font-mono text-slate-400 mb-2">{currentFile.path}</p>
            <pre className="text-xs font-mono text-slate-100 leading-relaxed whitespace-pre">
              <code>{currentFile.content}</code>
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};
