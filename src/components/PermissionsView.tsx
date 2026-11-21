import React, { useState } from 'react';
import { RefreshCw, Shield, Smartphone } from 'lucide-react';
import { PERMISSION_CATALOG } from '../services/permissionManager';
import type { PermissionKey, PermissionStateValue, PermissionStatusMap } from '../core/types';

interface PermissionsViewProps {
  assistantName: string;
  permissions: PermissionStatusMap;
  nativeConnected: boolean;
  onRequestPermission: (key: PermissionKey) => Promise<string>;
  onOpenNativeSettings: (key: PermissionKey) => void;
  onRefreshPermissions: () => Promise<void>;
}

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

  const webPerms = PERMISSION_CATALOG.filter((p) => p.scope === 'web_and_android');
  const nativePerms = PERMISSION_CATALOG.filter((p) => p.scope === 'android_native_only');

  const handleRequest = async (key: PermissionKey) => {
    setBusyKey(key);
    try {
      const msg = await onRequestPermission(key);
      setFeedback(msg);
    } finally {
      setBusyKey(null);
    }
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

        <button
          type="button"
          onClick={async () => {
            await onRefreshPermissions();
            setFeedback('Checked live device permission status.');
          }}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Refresh Status
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-2xl bg-slate-900 px-4 py-3 text-xs text-white"
        >
          {feedback}
        </div>
      )}

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
