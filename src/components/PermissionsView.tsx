import React, { useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  PlayCircle,
  RefreshCw,
  Shield,
  Smartphone,
} from 'lucide-react';
import { PERMISSION_CATALOG } from '../services/permissionManager';
import { nativeBridge } from '../services/nativeBridge';
import type {
  PermissionKey,
  PermissionStateValue,
  PermissionStatusMap,
  SelfTestCheckItem,
} from '../core/types';

interface PermissionsViewProps {
  assistantName: string;
  permissions: PermissionStatusMap;
  nativeConnected: boolean;
  onRequestPermission: (key: PermissionKey) => Promise<string>;
  onOpenNativeSettings: (key: PermissionKey) => void;
  onRefreshPermissions: () => Promise<void>;
}

const SETUP_WIZARD_ITEMS: {
  key: PermissionKey;
  label: string;
  optional?: boolean;
  isNativeOnly: boolean;
  hint: string;
}[] = [
  {
    key: 'microphone',
    label: 'Microphone',
    isNativeOnly: false,
    hint: 'Required for wake word and voice commands.',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    isNativeOnly: false,
    hint: 'Required for the Android foreground service notification.',
  },
  {
    key: 'overlay',
    label: 'Display over other apps',
    isNativeOnly: true,
    hint: 'Shows the small floating robot above other apps.',
  },
  {
    key: 'accessibility',
    label: 'Accessibility service',
    isNativeOnly: true,
    hint: 'Enables opt-in scrolling, tapping, and multi-step app tasks.',
  },
  {
    key: 'battery_optimization',
    label: 'Battery optimization exemption',
    isNativeOnly: true,
    hint: 'Prevents Android from terminating background listening.',
  },
  {
    key: 'notification_listener',
    label: 'Notification access',
    optional: true,
    isNativeOnly: true,
    hint: 'Optional — reads incoming notifications when asked.',
  },
  {
    key: 'contacts',
    label: 'Contacts',
    optional: true,
    isNativeOnly: true,
    hint: 'Optional — resolves contact names for calls and messages.',
  },
  {
    key: 'camera',
    label: 'Camera',
    optional: true,
    isNativeOnly: false,
    hint: 'Optional — opens camera and timed photo capture.',
  },
];

function formatState(state: PermissionStateValue): { label: string; colorClass: string } {
  switch (state) {
    case 'granted':
      return { label: 'Granted', colorClass: 'text-emerald-700' };
    case 'denied':
      return { label: 'Denied', colorClass: 'text-rose-700' };
    case 'prompt':
      return { label: 'Not requested yet', colorClass: 'text-slate-600' };
    case 'unsupported':
      return { label: 'Unavailable on this device', colorClass: 'text-slate-500' };
    case 'android_native_only':
      return { label: 'Requires native Android APK', colorClass: 'text-amber-700' };
  }
}

export const PermissionsView: React.FC<PermissionsViewProps> = ({
  assistantName,
  permissions,
  nativeConnected,
  onRequestPermission,
  onOpenNativeSettings,
  onRefreshPermissions,
}) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<PermissionKey | null>(null);
  const [selfTestResults, setSelfTestResults] = useState<SelfTestCheckItem[] | null>(null);

  const webPerms = PERMISSION_CATALOG.filter((p) => p.scope === 'web_and_android');
  const nativePerms = PERMISSION_CATALOG.filter((p) => p.scope === 'android_native_only');

  const requiredItems = SETUP_WIZARD_ITEMS.filter((i) => !i.optional);
  const grantedRequiredCount = requiredItems.filter((i) => permissions[i.key] === 'granted').length;

  const handleRequest = async (key: PermissionKey) => {
    setBusyKey(key);
    try {
      const msg = await onRequestPermission(key);
      setFeedback(msg);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRunSelfTest = () => {
    const nativeChecks = nativeBridge.runSelfTest();
    if (nativeChecks && nativeChecks.length > 0) {
      setSelfTestResults(nativeChecks);
      const passedCount = nativeChecks.filter((c) => c.passed).length;
      setFeedback(
        `Ran ${nativeChecks.length} native Android checks: ${passedCount}/${nativeChecks.length} passed.`
      );
      return;
    }

    // Honest browser PWA self-test — never fakes native Android capabilities
    const browserChecks: SelfTestCheckItem[] = [
      {
        id: 'web_mic',
        label: 'Microphone permission',
        passed: permissions.microphone === 'granted',
        detail:
          permissions.microphone === 'granted'
            ? 'Microphone granted in this browser.'
            : 'Not granted yet — tap Request Access above.',
        scope: 'web',
      },
      {
        id: 'web_tts',
        label: 'Speech output (TTS)',
        passed: typeof window !== 'undefined' && 'speechSynthesis' in window,
        detail:
          typeof window !== 'undefined' && 'speechSynthesis' in window
            ? 'Browser speech synthesis available.'
            : 'Browser speech synthesis unavailable on this device.',
        scope: 'web',
      },
      {
        id: 'native_service',
        label: 'Native Android Foreground Service',
        passed: false,
        detail: 'Running in browser PWA sandbox. Install the native Android APK for background wake word.',
        scope: 'native',
      },
      {
        id: 'native_overlay',
        label: 'System-wide Floating Overlay',
        passed: false,
        detail: 'Requires Android APK with Display over other apps enabled.',
        scope: 'native',
      },
      {
        id: 'native_accessibility',
        label: 'Accessibility Multi-Step Automation',
        passed: false,
        detail: 'Requires Android APK with Shimi Accessibility Service enabled.',
        scope: 'native',
      },
    ];
    setSelfTestResults(browserChecks);
    setFeedback(
      'Completed real browser diagnostic. Native Android background checks require installing the Shimi APK.'
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Permissions &amp; Android Security
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {assistantName} requests permissions only when you enable the matching feature and never
            pretends a denied or OS-restricted permission is granted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunSelfTest}
            data-testid="test-shimi-button"
            className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <PlayCircle className="w-4 h-4" aria-hidden="true" />
            Test {assistantName}
          </button>

          <button
            type="button"
            onClick={async () => {
              await onRefreshPermissions();
              setFeedback('Checked live device permission status.');
            }}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Refresh Status
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-2xl bg-slate-900 px-4 py-3 text-xs text-white"
        >
          {feedback}
        </div>
      )}

      {/* Make Shimi Your Phone Assistant — Setup Wizard */}
      <section
        aria-label="Phone assistant setup wizard"
        data-testid="assistant-setup-wizard"
        className="rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Make {assistantName} Your Phone Assistant
            </h2>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-2xl">
              Complete these Android permissions once so {assistantName} stays active when minimized,
              listens for your custom wake word, and can open apps or run confirmed phone tasks.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            Core setup: {grantedRequiredCount}/{requiredItems.length} granted
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SETUP_WIZARD_ITEMS.map((item) => {
            const st = permissions[item.key];
            const granted = st === 'granted';
            return (
              <div
                key={item.key}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {granted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-900">{item.label}</span>
                      {item.optional && <span className="text-slate-400">(optional)</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">{item.hint}</p>
                    <p
                      className={`mt-1 text-[11px] font-semibold ${
                        granted ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {granted
                        ? 'Granted'
                        : item.isNativeOnly && !nativeConnected
                          ? 'Needs Android APK'
                          : 'Needs setup'}
                    </p>
                  </div>
                </div>

                {!granted && (
                  <button
                    type="button"
                    disabled={item.isNativeOnly && !nativeConnected}
                    onClick={() => {
                      if (item.isNativeOnly) {
                        onOpenNativeSettings(item.key);
                        setFeedback(`Opened Android settings for ${item.label}.`);
                      } else {
                        handleRequest(item.key);
                      }
                    }}
                    className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {item.isNativeOnly ? 'Open Settings' : 'Allow'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Real Test Shimi Diagnostic Results */}
        {selfTestResults && (
          <div
            data-testid="self-test-results"
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                Diagnostic Results ({nativeConnected ? 'Native Android Engine' : 'Browser Sandbox'})
              </h3>
              <button
                type="button"
                onClick={() => setSelfTestResults(null)}
                className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <div className="space-y-1.5">
              {selfTestResults.map((chk) => (
                <div
                  key={chk.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-white px-3 py-2 border border-slate-200/70 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{chk.label}</p>
                    <p className="text-[11px] text-slate-600">{chk.detail}</p>
                  </div>
                  <span
                    className={`text-[11px] font-semibold whitespace-nowrap ${
                      chk.passed ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {chk.passed ? 'PASS' : 'NEEDS SETUP'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Browser PWA vs Native Android APK Truth Table */}
      <section className="rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80">
        <h2 className="text-base font-bold text-slate-900">
          Browser PWA vs Native Android APK Capabilities
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {assistantName} can perform the maximum set of actions exposed by Android&apos;s public
          APIs and your opt-in AccessibilityService, while respecting Android&apos;s security sandbox.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-semibold">Capability</th>
                <th className="py-2 px-4 font-semibold">Browser / PWA</th>
                <th className="py-2 pl-4 font-semibold">Native Android APK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-2.5 pr-4 font-medium text-slate-900">Background wake word when minimized</td>
                <td className="py-2.5 px-4 text-slate-500">Not permitted by browser sandbox</td>
                <td className="py-2.5 pl-4 text-emerald-700 font-medium">Supported via Foreground Service</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium text-slate-900">Floating robot over other apps</td>
                <td className="py-2.5 px-4 text-slate-500">Inside tab only</td>
                <td className="py-2.5 pl-4 text-emerald-700 font-medium">System overlay (opt-in)</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium text-slate-900">Launch installed apps, flashlight, timers, volume</td>
                <td className="py-2.5 px-4 text-slate-500">Web links only</td>
                <td className="py-2.5 pl-4 text-emerald-700 font-medium">Direct Android Intents &amp; APIs</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium text-slate-900">Multi-step app tasks (WhatsApp draft &amp; confirm)</td>
                <td className="py-2.5 px-4 text-slate-500">Draft link preview only</td>
                <td className="py-2.5 pl-4 text-emerald-700 font-medium">AccessibilityService + confirmation gate</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium text-slate-900">Passwords, OTPs, banking &amp; biometrics</td>
                <td className="py-2.5 px-4 text-slate-500">Blocked</td>
                <td className="py-2.5 pl-4 text-slate-600 font-medium">Blocked by design (privacy guardrail)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Web / PWA Permissions */}
      <section className="rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-blue-600" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">
            Active Device Permissions (Web &amp; Installed PWA)
          </h2>
        </div>

        <div className="mt-5 divide-y divide-slate-100">
          {webPerms.map((item) => {
            const st = permissions[item.key];
            const meta = formatState(st);
            return (
              <div
                key={item.key}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-900">{item.title}</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className={`text-xs font-medium ${meta.colorClass}`}>{meta.label}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.whyNeeded}</p>
                  <p className="text-[11px] text-slate-500">
                    How to manage: {item.howToManage}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busyKey === item.key || st === 'granted'}
                  onClick={() => handleRequest(item.key)}
                  className={`min-h-[42px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    st === 'granted'
                      ? 'bg-slate-100 text-slate-500 cursor-default'
                      : 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer'
                  }`}
                >
                  {busyKey === item.key
                    ? 'Requesting...'
                    : st === 'granted'
                      ? 'Enabled'
                      : 'Request Access'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Native Android-Only OS Permissions */}
      <section className="rounded-3xl bg-white p-6 md:p-7 shadow-sm border border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <Smartphone className="w-5 h-5 text-slate-700" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">
            Native Android OS Permissions ({nativeConnected ? 'Android Companion Active' : 'Kotlin APK Required'})
          </h2>
        </div>
        <p className="mt-1.5 text-xs text-slate-600 leading-relaxed max-w-3xl">
          Android strictly isolates browsers from system-wide overlays, accessibility automation,
          battery optimization exemptions, and other apps&apos; notifications. Even when granted on
          the native Android companion APK, {assistantName} never automates passwords, banking/payment
          confirmations, or Android security dialogs.
        </p>

        <div className="mt-5 divide-y divide-slate-100">
          {nativePerms.map((item) => {
            const st = permissions[item.key];
            const meta = formatState(st);
            return (
              <div
                key={item.key}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-900">{item.title}</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className={`text-xs font-medium ${meta.colorClass}`}>
                      {nativeConnected ? meta.label : 'Not granted in web sandbox'}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {item.androidPermissionName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.whyNeeded}</p>
                  <p className="text-[11px] text-slate-500">{item.howToManage}</p>
                </div>

                {nativeConnected && (
                  <button
                    type="button"
                    disabled={st === 'granted'}
                    onClick={() => {
                      onOpenNativeSettings(item.key);
                      setFeedback(`Opened Android Settings for ${item.title}.`);
                    }}
                    className={`min-h-[42px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      st === 'granted'
                        ? 'bg-slate-100 text-slate-500 cursor-default'
                        : 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer'
                    }`}
                  >
                    {st === 'granted' ? 'Enabled' : 'Open Android Settings'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
