import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        Install Shimi App
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-4 h-4" aria-hidden="true" />
        {isIOS ? 'Install on iOS' : 'Install on Phone'}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Install Shimi on your phone"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              {isIOS ? 'Install on iPhone or iPad' : 'Install Shimi on Android'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {isIOS
                ? '1. Tap the Share button in Safari.\n2. Scroll down and tap Add to Home Screen.'
                : '1. Open this app in Chrome on your Android device.\n2. Tap the browser menu (⋮) and choose Install app or Add to Home screen.'}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              For native Android OS permissions (floating overlay over other apps, AccessibilityService,
              and Notification Listener), download the Kotlin + Jetpack Compose project files in the
              Privacy &amp; Android tab.
            </p>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Offline mode — Using local on-device command parsing</span>
    </div>
  );
};
