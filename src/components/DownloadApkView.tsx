import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { RobotCharacter } from './RobotCharacter';
import { ROBOT_COLOR_THEMES } from '../core/robotStateMachine';
import {
  buildGradlePropertyFlags,
  computeVersionCode,
  formatApkFileName,
  validateApkBuildRequest,
} from '../core/apkBuildConfig';
import type {
  ApkReleaseInfo,
  ApkStatusResponse,
  ApkWorkflowRun,
  AssistantPreferences,
  PersonalityStyle,
  RobotAccessory,
  RobotState,
  RobotStyle,
} from '../core/types';

interface DownloadApkViewProps {
  preferences: AssistantPreferences;
  nativeConnected: boolean;
  onApplyConfigToLocal?: (patch: Partial<AssistantPreferences>) => void;
}

const STYLES: { id: RobotStyle; label: string }[] = [
  { id: 'pod', label: 'Rounded Pod' },
  { id: 'aero', label: 'Aero Companion' },
  { id: 'deskbot', label: 'Desk Bot' },
];

const ACCESSORIES: { id: RobotAccessory; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'halo', label: 'Halo Ring' },
  { id: 'beanie', label: 'Cozy Beanie' },
  { id: 'glasses', label: 'Round Glasses' },
  { id: 'headphones', label: 'Headphones' },
  { id: 'star', label: 'Star Pin' },
];

const PERSONALITIES: { id: PersonalityStyle; label: string }[] = [
  { id: 'warm', label: 'Warm & Friendly' },
  { id: 'playful', label: 'Playful & Light' },
  { id: 'calm', label: 'Calm & Concise' },
];

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export const DownloadApkView: React.FC<DownloadApkViewProps> = ({
  preferences,
  nativeConnected,
  onApplyConfigToLocal,
}) => {
  const [assistantName, setAssistantName] = useState(preferences.name);
  const [wakeWord, setWakeWord] = useState(preferences.wakeWord || preferences.name);
  const [robotStyle, setRobotStyle] = useState<RobotStyle>(preferences.robotStyle);
  const [accessory, setAccessory] = useState<RobotAccessory>(preferences.accessory);
  const [personality, setPersonality] = useState<PersonalityStyle>(preferences.personality);
  const [themeId, setThemeId] = useState<string>(preferences.themeId);
  const [versionName, setVersionName] = useState<string>('2.1.0');
  const [previewState, setPreviewState] = useState<RobotState>('IDLE');

  const [statusLoading, setStatusLoading] = useState(true);
  const [apkStatus, setApkStatus] = useState<ApkStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [buildPhase, setBuildPhase] = useState<
    'idle' | 'submitting' | 'queued' | 'in_progress' | 'completed' | 'failed' | 'ci_unconfigured'
  >('idle');
  const [activeRun, setActiveRun] = useState<ApkWorkflowRun | null>(null);
  const [completedApk, setCompletedApk] = useState<ApkReleaseInfo | null>(null);
  const [buildMessage, setBuildMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [devInfoOpen, setDevInfoOpen] = useState(false);

  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/apk/status');
      const data = (await res.json()) as ApkStatusResponse;
      setApkStatus(data);
      if (data.suggestedVersion) {
        setVersionName(data.suggestedVersion);
      }
    } catch {
      setStatusError('Could not check APK build server status.');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    return () => stopPolling();
  }, [loadStatus, stopPolling]);

  const startPollingRun = useCallback(
    (runId: number) => {
      stopPolling();
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const res = await fetch(`/api/apk/runs/${runId}`);
          if (!res.ok) return;
          const data = (await res.json()) as {
            run?: ApkWorkflowRun;
            latestApk?: ApkReleaseInfo | null;
          };
          if (!data.run) return;
          setActiveRun(data.run);

          if (data.run.status === 'completed') {
            stopPolling();
            if (data.run.conclusion === 'success') {
              setBuildPhase('completed');
              setPreviewState('SUCCESS');
              setCompletedApk(data.latestApk ?? null);
              setBuildMessage(
                data.latestApk
                  ? `BUILD COMPLETE — ${data.latestApk.fileName} is ready to download.`
                  : 'BUILD COMPLETE — GitHub Actions finished. Open the release link to download your APK.'
              );
              loadStatus();
            } else {
              setBuildPhase('failed');
              setPreviewState('SORRY');
              setBuildMessage(
                `GitHub Actions build finished with status: ${data.run.conclusion ?? 'failed'}. Check the workflow log for details.`
              );
            }
          } else if (data.run.status === 'in_progress') {
            setBuildPhase('in_progress');
            setBuildMessage('BUILDING... Compiling native Kotlin Android APK in GitHub Actions.');
          } else {
            setBuildPhase('queued');
            setBuildMessage('QUEUED — Waiting for GitHub Actions runner to start.');
          }
        } catch {
          // Keep polling quietly on transient network hiccup
        }
      }, 6000);
    },
    [loadStatus, stopPolling]
  );

  const handleBuildApk = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);
    setBuildMessage(null);
    setCompletedApk(null);

    const check = validateApkBuildRequest({
      assistantName,
      wakeWord,
      robotStyle,
      accessory,
      personality,
      themeId,
      versionName,
    });

    if (!check.valid || !check.normalized) {
      setValidationErrors(check.errors);
      return;
    }

    setBuildPhase('submitting');
    setPreviewState('THINKING');

    try {
      const res = await fetch('/api/apk/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check.normalized),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        errors?: string[];
        run?: ApkWorkflowRun | null;
        actionsUrl?: string;
      };

      if (res.status === 503 && data.error === 'APK_CI_NOT_CONFIGURED') {
        setBuildPhase('ci_unconfigured');
        setPreviewState('CONFUSED');
        setBuildMessage(
          data.message ||
            'Cloud APK builder is not connected to a GitHub repository yet. Configure GITHUB_REPO and GITHUB_TOKEN on the server.'
        );
        return;
      }

      if (!res.ok) {
        setBuildPhase('failed');
        setPreviewState('SORRY');
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setValidationErrors(data.errors);
        }
        setBuildMessage(data.message || 'APK build dispatch failed.');
        return;
      }

      if (data.run) {
        setActiveRun(data.run);
        setBuildPhase(data.run.status === 'in_progress' ? 'in_progress' : 'queued');
        setBuildMessage(
          `QUEUED — Dispatched GitHub Actions build #${data.run.id} for ${check.normalized.assistantName} v${check.normalized.versionName}.`
        );
        startPollingRun(data.run.id);
      } else {
        setBuildPhase('queued');
        setBuildMessage(
          `QUEUED — Workflow dispatched to GitHub Actions. Check ${data.actionsUrl || 'GitHub Actions'} for live build progress.`
        );
      }
    } catch {
      setBuildPhase('failed');
      setPreviewState('SORRY');
      setBuildMessage('Network error while contacting /api/apk/build.');
    }
  };

  const latestApk = completedApk ?? apkStatus?.latestApk ?? null;
  const gradleFlags = buildGradlePropertyFlags(
    {
      assistantName: assistantName.trim() || 'Shimi',
      wakeWord: wakeWord.trim() || assistantName.trim() || 'Shimi',
      robotStyle,
      accessory,
      personality,
      themeId,
      versionName: versionName.trim() || '2.1.0',
    },
    computeVersionCode(versionName.trim() || '2.1.0', 1)
  );
  const signedPreviewFilename = formatApkFileName(
    assistantName.trim() || 'Shimi',
    versionName.trim() || '2.1.0',
    true
  );
  const unsignedPreviewFilename = formatApkFileName(
    assistantName.trim() || 'Shimi',
    versionName.trim() || '2.1.0',
    false
  );

  return (
    <div className="space-y-8" data-testid="download-apk-view">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Download &amp; Build Android APK
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            Install the native Android Shimi companion for background wake-word listening, floating
            over-app presence, and opt-in Accessibility automation. Build a personalized APK with
            your chosen name, wake word, and robot look baked in from first launch.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStatus}
          disabled={statusLoading}
          className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Check Releases
        </button>
      </div>

      {/* Latest Compiled Shimi APK Card */}
      <section
        aria-label="Latest Shimi APK release"
        data-testid="latest-apk-card"
        className="rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-600" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">Latest Shimi APK</h2>
              {nativeConnected && (
                <span className="text-xs font-medium text-emerald-700">
                  · Running inside native Android APK
                </span>
              )}
            </div>

            {statusLoading ? (
              <p className="text-xs text-slate-500">Checking published Android APK releases...</p>
            ) : statusError ? (
              <p className="text-xs text-rose-700">{statusError}</p>
            ) : latestApk ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  {latestApk.fileName}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    (v{latestApk.versionName}
                    {latestApk.sizeBytes ? ` · ${formatBytes(latestApk.sizeBytes)}` : ''} ·{' '}
                    {latestApk.signed ? 'Signed release APK' : 'Unsigned debug test APK'})
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Published from GitHub Actions Android CI ({apkStatus?.repo}). Download directly on
                  your Android phone to install.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                  {apkStatus?.ciConfigured
                    ? 'Connected to GitHub Actions, but no compiled .apk release has been published yet. Use the personalized builder below to compile your first APK.'
                    : 'No pre-built APK release is published from this host yet. Connect a GitHub repository with GITHUB_REPO and GITHUB_TOKEN on the server to compile and host real signed or debug APKs via GitHub Actions (.github/workflows/build-apk.yml).'}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {latestApk ? (
              <>
                <a
                  href={latestApk.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Download latest APK</span>
                </a>
                <a
                  href={latestApk.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>Release notes</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </>
            ) : (
              <span className="text-xs font-medium text-slate-500">
                {apkStatus?.ciConfigured ? 'No release published yet' : 'GitHub Actions CI not connected'}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Personalized APK Builder Grid (Preserves CustomizeView layout & RobotCharacter!) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Personalized Robot Preview */}
        <section className="lg:col-span-5 rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 lg:sticky lg:top-24">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {assistantName.trim() || 'Shimi'} APK Preview
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                App launcher name, wake word, and robot look embedded at compile time.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">v{versionName || '2.1.0'}</span>
          </div>

          <div className="my-6 flex flex-col items-center justify-center rounded-2xl bg-slate-50 py-8 px-4 border border-slate-200/60">
            <RobotCharacter
              state={previewState}
              themeId={themeId}
              robotStyle={robotStyle}
              accessory={accessory}
              size={220}
              batterySaver={preferences.batterySaver}
              onClick={() =>
                setPreviewState((prev) => (prev === 'SUCCESS' ? 'IDLE' : 'SUCCESS'))
              }
              ariaLabel={`Live APK preview for ${assistantName.trim() || 'Shimi'}`}
            />
            <p className="mt-3 text-xs font-medium text-slate-700">
              Wake word: &ldquo;{wakeWord.trim() || assistantName.trim() || 'Shimi'}&rdquo;
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>Real Native Android Build Guarantee</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              This builder never generates a fake or empty APK. Clicking <strong>Build My APK</strong>{' '}
              dispatches Gradle on GitHub Actions to compile the Kotlin Android companion in{' '}
              <code className="font-mono text-[11px]">/android/</code> with your defaults baked into{' '}
              <code className="font-mono text-[11px]">BuildConfig</code>.
            </p>
          </div>

          {onApplyConfigToLocal && (
            <button
              type="button"
              onClick={() => {
                onApplyConfigToLocal({
                  name: assistantName.trim() || preferences.name,
                  wakeWord: wakeWord.trim() || assistantName.trim() || preferences.wakeWord,
                  robotStyle,
                  accessory,
                  personality,
                  themeId,
                });
                setPreviewState('SUCCESS');
              }}
              className="mt-4 w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Sync these choices to this device too
            </button>
          )}
        </section>

        {/* Right Column: Personalized APK Form + Build Progress */}
        <section className="lg:col-span-7 rounded-3xl bg-white p-6 md:p-8 shadow-sm border border-slate-200/80 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Build your Shimi APK</h2>
            <p className="mt-1 text-xs text-slate-500">
              Your personalized Android app installs with your chosen name on the home screen and
              starts ready with your wake word and character style.
            </p>
          </div>

          <form onSubmit={handleBuildApk} className="space-y-6" noValidate>
            {/* Name, Wake Word & Version */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="apk-assistant-name"
                  className="block text-xs font-semibold text-slate-800"
                >
                  Assistant Name (Launcher Label)
                </label>
                <input
                  id="apk-assistant-name"
                  type="text"
                  value={assistantName}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    if (wakeWord === assistantName) {
                      setWakeWord(nextVal);
                    }
                    setAssistantName(nextVal);
                  }}
                  maxLength={28}
                  placeholder="Milo"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="apk-wake-word"
                  className="block text-xs font-semibold text-slate-800"
                >
                  Default Wake Word
                </label>
                <input
                  id="apk-wake-word"
                  type="text"
                  value={wakeWord}
                  onChange={(e) => setWakeWord(e.target.value)}
                  maxLength={28}
                  placeholder="Milo"
                  className="w-full h-11 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            {/* Theme Selection */}
            <div className="space-y-2 border-t border-slate-100 pt-5">
              <span className="block text-xs font-semibold text-slate-800">Color Theme</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROBOT_COLOR_THEMES.map((theme) => {
                  const active = themeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeId(theme.id)}
                      className={`min-h-[46px] flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50/50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="flex items-center -space-x-1">
                          <span
                            className="w-5 h-5 rounded-full border border-slate-300"
                            style={{ backgroundColor: theme.shell }}
                          />
                          <span
                            className="w-5 h-5 rounded-full border border-white"
                            style={{ backgroundColor: theme.accent }}
                          />
                        </span>
                        <span className="text-xs font-medium text-slate-900">{theme.label}</span>
                      </span>
                      {active && <Check className="w-4 h-4 text-blue-600" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Robot Style */}
            <div className="space-y-2 border-t border-slate-100 pt-5">
              <span className="block text-xs font-semibold text-slate-800">Robot Style</span>
              <div className="grid grid-cols-3 gap-2">
                {STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setRobotStyle(st.id)}
                    className={`min-h-[42px] rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      robotStyle === st.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Accessory */}
            <div className="space-y-2 border-t border-slate-100 pt-5">
              <span className="block text-xs font-semibold text-slate-800">Accessory</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ACCESSORIES.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccessory(acc.id)}
                    className={`min-h-[40px] rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      accessory === acc.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Personality & Version */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-5">
              <div className="sm:col-span-2 space-y-2">
                <span className="block text-xs font-semibold text-slate-800">Personality</span>
                <div className="grid grid-cols-3 gap-2">
                  {PERSONALITIES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonality(p.id)}
                      className={`min-h-[40px] rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                        personality === p.id
                          ? 'border-blue-600 bg-blue-50/60 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="apk-version-input"
                  className="block text-xs font-semibold text-slate-800"
                >
                  Version
                </label>
                <input
                  id="apk-version-input"
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="2.1.0"
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div
                role="alert"
                className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800 space-y-1"
              >
                {validationErrors.map((err) => (
                  <p key={err}>{err}</p>
                ))}
              </div>
            )}

            {/* Submit Build CTA */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                disabled={buildPhase === 'submitting' || buildPhase === 'queued' || buildPhase === 'in_progress'}
                data-testid="build-apk-submit"
                className="min-h-[48px] rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
              >
                {buildPhase === 'submitting' || buildPhase === 'queued' || buildPhase === 'in_progress' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>
                      {buildPhase === 'in_progress'
                        ? 'BUILDING...'
                        : buildPhase === 'queued'
                          ? 'QUEUED...'
                          : 'DISPATCHING...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>Build My APK</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-500">
                Output file: <code className="font-mono">{signedPreviewFilename}</code>
              </p>
            </div>
          </form>

          {/* Real Build Status Feedback Banner */}
          {buildMessage && (
            <div
              role="status"
              data-testid="apk-build-status-banner"
              className={`rounded-2xl p-4 text-xs leading-relaxed border ${
                buildPhase === 'completed'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : buildPhase === 'failed' || buildPhase === 'ci_unconfigured'
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-blue-50 border-blue-200 text-blue-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {buildPhase === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                ) : buildPhase === 'failed' || buildPhase === 'ci_unconfigured' ? (
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-700 animate-spin shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="space-y-2 flex-1">
                  <p className="font-medium">{buildMessage}</p>
                  {activeRun && (
                    <a
                      href={activeRun.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold underline"
                    >
                      <span>View GitHub Actions run #{activeRun.id}</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  )}
                  {completedApk && (
                    <div>
                      <a
                        href={completedApk.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download {completedApk.fileName}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Install instructions */}
          <div className="border-t border-slate-100 pt-5 space-y-2 text-xs text-slate-600">
            <h3 className="font-semibold text-slate-900">How to install your Android APK</h3>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Download the compiled <code className="font-mono">.apk</code> file onto your Android 12–15 phone.</li>
              <li>Open the file and allow installation from your browser or file manager if prompted.</li>
              <li>Launch your assistant, open the <strong>Permissions</strong> tab, and complete the <strong>Make Shimi Your Phone Assistant</strong> checklist.</li>
            </ol>
          </div>
        </section>
      </div>

      {/* Developer Build Information — strictly visible ONLY when Developer Debug Mode is enabled */}
      {preferences.debugModeEnabled && (
        <section
          aria-label="Developer build information"
          data-testid="developer-build-info"
          className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200/80 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <h2 className="text-sm font-bold text-slate-900">Developer Build Information</h2>
            </div>
            <button
              type="button"
              onClick={() => setDevInfoOpen((prev) => !prev)}
              className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
            >
              {devInfoOpen ? 'Hide details' : 'Show Gradle & CI details'}
            </button>
          </div>

          {devInfoOpen && (
            <div className="space-y-3 text-xs text-slate-600 font-mono">
              <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-4 space-y-1.5">
                <p className="text-slate-900 font-semibold">CI Workflow:</p>
                <p>.github/workflows/build-apk.yml (JDK 17 · Android SDK 35 · Gradle)</p>
                <p className="pt-2 text-slate-900 font-semibold">Deterministic Output Filenames:</p>
                <p>Signed release: {signedPreviewFilename}</p>
                <p>Unsigned debug: {unsignedPreviewFilename}</p>
                <p className="pt-2 text-slate-900 font-semibold">Gradle Build Flags:</p>
                <pre className="whitespace-pre-wrap break-all text-[11px] text-slate-700">
                  {`./gradlew assembleRelease \\\n  ${gradleFlags.join(' \\\n  ')}`}
                </pre>
                <p className="pt-2 text-slate-900 font-semibold">
                  Required GitHub Secrets (for signed release builds):
                </p>
                <p>
                  ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
                  ANDROID_KEY_PASSWORD
                </p>
                <p className="pt-2 text-slate-900 font-semibold">
                  Required Server Env Vars (to dispatch from UI):
                </p>
                <p>GITHUB_REPO (owner/repo), GITHUB_TOKEN (actions:write), GITHUB_REF (default main)</p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
