import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Lock,
  Square,
  Trash2,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { ANDROID_KOTLIN_BLUEPRINT } from '../androidBlueprint/kotlinSources';
import type {
  AssistantPreferences,
  PermissionStatusMap,
  VoiceOutputMode,
} from '../core/types';

interface PrivacySettingsViewProps {
  preferences: AssistantPreferences;
  permissions: PermissionStatusMap;
  isSessionActive: boolean;
  geminiServerConfigured: boolean;
  onUpdatePreferences: (patch: Partial<AssistantPreferences>) => void;
  onStopSession: () => void;
  onClearAllAndReset: () => void;
}

export const PrivacySettingsView: React.FC<PrivacySettingsViewProps> = ({
  preferences,
  permissions,
  isSessionActive,
  geminiServerConfigured,
  onUpdatePreferences,
  onStopSession,
  onClearAllAndReset,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const grantedCount = Object.values(permissions).filter((v) => v === 'granted').length;
  const currentBlueprintFile = ANDROID_KOTLIN_BLUEPRINT[selectedFileIndex];

  const handleCopySource = async () => {
    try {
      await navigator.clipboard.writeText(currentBlueprintFile.content);
      setCopiedPath(currentBlueprintFile.path);
      window.setTimeout(() => setCopiedPath(null), 2000);
    } catch {
      // Clipboard may be restricted in non-HTTPS contexts
    }
  };

  const handleDownloadSource = () => {
    const blob = new Blob([currentBlueprintFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentBlueprintFile.path.split('/').pop() || 'Shimi.kt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Privacy, Controls &amp; Android Build
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {preferences.name} is built privacy-first: zero saved conversation history, zero stored
            voice recordings, zero retained photos, and no tracking or analytics.
          </p>
        </div>
        <PWAInstallButton />
      </div>

      {/* Privacy & Processing Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 space-y-6">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">Data &amp; Processing Controls</h2>
          </div>

          {/* Cloud Gemini Toggle */}
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                Cloud Gemini Understanding
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                When enabled, only your active command text (and any photo you explicitly select in
                Photo Picker) is sent over HTTPS to our server&apos;s Gemini API route to interpret
                intent. Nothing is logged or stored. Turn off to use 100% local rule-based parsing.
              </p>
              <p className="text-[11px] text-slate-500">
                Server Gemini configuration:{' '}
                {geminiServerConfigured ? 'Available on server' : 'Not configured (using local fallback)'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.cloudGeminiEnabled}
              aria-label="Toggle Cloud Gemini understanding"
              onClick={() =>
                onUpdatePreferences({ cloudGeminiEnabled: !preferences.cloudGeminiEnabled })
              }
              className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 ${
                preferences.cloudGeminiEnabled ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  preferences.cloudGeminiEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Voice Output Mode */}
          <div className="pb-5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Spoken Response Output</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose whether {preferences.name} speaks via Gemini TTS, local browser speech, or stays silent.
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

          {/* Battery Saver & Floating Preferences */}
          <div className="space-y-4">
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
                className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 ${
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
                <p className="text-sm font-semibold text-slate-900">Show Floating Robot on Start</p>
                <p className="text-xs text-slate-500">
                  Displays the draggable companion overlay whenever you start an assistant session.
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
                className={`min-w-[52px] h-7 rounded-full p-1 transition-colors shrink-0 ${
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
          </div>
        </section>

        {/* Right: Privacy Summary & Danger/Reset Actions */}
        <section className="lg:col-span-5 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Current Privacy Summary</h2>

            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Stored locally</dt>
                <dd className="font-medium text-slate-900 text-right">
                  Name, appearance &amp; toggles only
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
                <dt className="text-slate-500">Always-on wake word</dt>
                <dd className="font-medium text-slate-900 text-right">
                  Off (Tap-to-talk only)
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
            {isSessionActive && (
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
                  This clears your saved assistant name, color theme, and temporary session state,
                  returning to first-time setup.
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

      {/* Native Android (Kotlin + Jetpack Compose + Material 3) Project Export */}
      <section className="rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-slate-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Native Android Project Source (Kotlin &amp; Jetpack Compose)
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This browser preview runs Shimi as an installable PWA. To compile a native APK with
              Android&apos;s <code className="font-mono">SYSTEM_ALERT_WINDOW</code> floating
              overlay, <code className="font-mono">ShimiAccessibilityService</code>, and{' '}
              <code className="font-mono">NotificationListenerService</code>, open these modular
              Kotlin files in Android Studio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySource}
              className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              {copiedPath === currentBlueprintFile.path ? (
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

        <div className="flex flex-wrap gap-1.5 pt-1">
          {ANDROID_KOTLIN_BLUEPRINT.map((file, idx) => (
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

        <div className="rounded-2xl bg-slate-950 p-4 overflow-x-auto">
          <p className="text-[11px] font-mono text-slate-400 mb-2">
            {currentBlueprintFile.path}
          </p>
          <pre className="text-xs font-mono text-slate-100 leading-relaxed whitespace-pre">
            <code>{currentBlueprintFile.content}</code>
          </pre>
        </div>
      </section>
    </div>
  );
};
