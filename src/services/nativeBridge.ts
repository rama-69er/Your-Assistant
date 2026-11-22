import type {
  AssistantPreferences,
  DebugTraceEntry,
  InstalledAppInfo,
  NativeBridgeEvent,
  NativeServiceSnapshot,
  SelfTestCheckItem,
  SettingsTarget,
  ShimiInterpretation,
} from '../core/types';

/**
 * Contract exposed by Android WebView via `@JavascriptInterface` on `window.ShimiNative`.
 */
export interface ShimiAndroidJavascriptInterface {
  getSnapshotJson: () => string;
  getAssistantConfigJson?: () => string;
  syncSettingsJson: (settingsJson: string) => void;
  setBackgroundAssistantEnabled: (enabled: boolean) => string;
  startListening: () => string;
  stopListening: () => string;
  executeActionJson: (actionJson: string) => string;
  confirmPendingAction: (actionId: string) => string;
  cancelPendingAction: (actionId: string) => string;
  openAndroidSetting: (target: string) => string;
  requestBatteryOptimizationExemption: () => string;
  getInstalledAppsJson: () => string;
  getDebugLogsJson: () => string;
  runSelfTestJson?: () => string;
}

declare global {
  interface Window {
    ShimiNative?: ShimiAndroidJavascriptInterface;
    __shimiReceiveNativeEvent?: (rawEventJson: string) => void;
  }
}

export type NativeEventListener = (event: NativeBridgeEvent) => void;

export interface NativeActionBridgeResponse {
  executed: boolean;
  status: 'executed' | 'pending_confirmation' | 'blocked_permission' | 'error';
  summary: string;
  detail?: string;
}

const DEFAULT_DISCONNECTED_SNAPSHOT: NativeServiceSnapshot = {
  connected: false,
  serviceRunning: false,
  wakeWordActive: false,
  listening: false,
  speaking: false,
  overlayVisible: false,
  accessibilityConnected: false,
  notificationListenerConnected: false,
  batteryOptimizationIgnored: false,
  robotState: 'IDLE',
};

function safeJsonParse<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Bidirectional Web ↔ Native Android Bridge.
 * - When running inside the native Android Shimi APK WebView, delegates
 *   background listening, wake word, overlay, permissions, and phone actions
 *   directly to the Kotlin ForegroundService & ActionExecutor.
 * - When running in a standard browser/PWA without the native wrapper,
 *   truthfully reports `isNativeAvailable() === false` and never fakes success.
 */
export class ShimiNativeBridge {
  private listeners = new Set<NativeEventListener>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.__shimiReceiveNativeEvent = (rawEventJson: string) => {
        const parsed = safeJsonParse<NativeBridgeEvent | null>(rawEventJson, null);
        if (parsed && typeof parsed.type === 'string') {
          this.listeners.forEach((fn) => fn(parsed));
        }
      };
    }
  }

  private getNative(): ShimiAndroidJavascriptInterface | null {
    if (typeof window === 'undefined') return null;
    return window.ShimiNative ?? null;
  }

  isNativeAvailable(): boolean {
    return this.getNative() !== null;
  }

  subscribe(listener: NativeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): NativeServiceSnapshot {
    const api = this.getNative();
    if (!api) return { ...DEFAULT_DISCONNECTED_SNAPSHOT };
    const parsed = safeJsonParse<Partial<NativeServiceSnapshot>>(api.getSnapshotJson(), {});
    return {
      ...DEFAULT_DISCONNECTED_SNAPSHOT,
      ...parsed,
      connected: true,
    };
  }

  syncPreferences(preferences: AssistantPreferences): boolean {
    const api = this.getNative();
    if (!api) return false;
    try {
      api.syncSettingsJson(JSON.stringify(preferences));
      return true;
    } catch {
      return false;
    }
  }

  setBackgroundAssistantEnabled(enabled: boolean): { ok: boolean; message: string } {
    const api = this.getNative();
    if (!api) {
      return {
        ok: false,
        message:
          'Native Android companion is not attached in this browser tab. Install & open the native Shimi Android APK to run the background foreground service.',
      };
    }
    const raw = api.setBackgroundAssistantEnabled(enabled);
    return safeJsonParse(raw, {
      ok: true,
      message: enabled ? 'Background assistant requested.' : 'Background assistant stopped.',
    });
  }

  startNativeListening(): { ok: boolean; message: string } {
    const api = this.getNative();
    if (!api) {
      return { ok: false, message: 'Native Android bridge unavailable.' };
    }
    return safeJsonParse(api.startListening(), { ok: true, message: 'Listening started.' });
  }

  stopNativeListening(): { ok: boolean; message: string } {
    const api = this.getNative();
    if (!api) {
      return { ok: false, message: 'Native Android bridge unavailable.' };
    }
    return safeJsonParse(api.stopListening(), { ok: true, message: 'Listening stopped.' });
  }

  executeAction(interpretation: ShimiInterpretation): NativeActionBridgeResponse | null {
    const api = this.getNative();
    if (!api) return null;
    try {
      const raw = api.executeActionJson(
        JSON.stringify({
          intent: interpretation.intent,
          category: interpretation.category,
          parameters: interpretation.parameters,
          requiresConfirmation: interpretation.requiresConfirmation,
        })
      );
      return safeJsonParse<NativeActionBridgeResponse>(raw, {
        executed: false,
        status: 'error',
        summary: 'Native executor returned an unreadable response.',
      });
    } catch (err) {
      return {
        executed: false,
        status: 'error',
        summary: 'Native bridge call failed.',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  confirmAction(actionId: string): NativeActionBridgeResponse | null {
    const api = this.getNative();
    if (!api) return null;
    return safeJsonParse<NativeActionBridgeResponse>(api.confirmPendingAction(actionId), {
      executed: false,
      status: 'error',
      summary: 'Could not confirm native action.',
    });
  }

  cancelAction(actionId: string): boolean {
    const api = this.getNative();
    if (!api) return false;
    try {
      api.cancelPendingAction(actionId);
      return true;
    } catch {
      return false;
    }
  }

  openAndroidSetting(target: SettingsTarget): { ok: boolean; message: string } {
    const api = this.getNative();
    if (!api) {
      return {
        ok: false,
        message: `Opening Android ${target} settings requires the native Android APK companion.`,
      };
    }
    return safeJsonParse(api.openAndroidSetting(target), {
      ok: true,
      message: `Opened Android ${target} settings.`,
    });
  }

  requestBatteryOptimizationExemption(): { ok: boolean; message: string } {
    const api = this.getNative();
    if (!api) {
      return {
        ok: false,
        message: 'Battery optimization settings can only be launched from the native Android APK.',
      };
    }
    return safeJsonParse(api.requestBatteryOptimizationExemption(), {
      ok: true,
      message: 'Opened Android battery optimization settings.',
    });
  }

  getNativeConfig(): Partial<AssistantPreferences> | null {
    const api = this.getNative();
    if (!api || typeof api.getAssistantConfigJson !== 'function') return null;
    const raw = safeJsonParse<Record<string, unknown> | null>(api.getAssistantConfigJson(), null);
    if (!raw) return null;

    const patch: Partial<AssistantPreferences> = {};
    if (typeof raw.assistantName === 'string' && raw.assistantName.trim()) {
      patch.name = raw.assistantName.trim();
    } else if (typeof raw.name === 'string' && raw.name.trim()) {
      patch.name = raw.name.trim();
    }
    if (typeof raw.wakeWord === 'string' && raw.wakeWord.trim()) {
      patch.wakeWord = raw.wakeWord.trim();
    }
    if (raw.robotStyle === 'pod' || raw.robotStyle === 'aero' || raw.robotStyle === 'deskbot') {
      patch.robotStyle = raw.robotStyle;
    }
    if (
      raw.accessory === 'none' ||
      raw.accessory === 'halo' ||
      raw.accessory === 'beanie' ||
      raw.accessory === 'glasses' ||
      raw.accessory === 'headphones' ||
      raw.accessory === 'star'
    ) {
      patch.accessory = raw.accessory;
    }
    if (raw.personality === 'warm' || raw.personality === 'playful' || raw.personality === 'calm') {
      patch.personality = raw.personality;
    }
    if (typeof raw.themeId === 'string' && raw.themeId.trim()) {
      patch.themeId = raw.themeId.trim();
    }
    if (typeof raw.wakeWordEnabled === 'boolean') {
      patch.wakeWordEnabled = raw.wakeWordEnabled;
    }
    if (typeof raw.backgroundAssistantEnabled === 'boolean') {
      patch.backgroundAssistantEnabled = raw.backgroundAssistantEnabled;
    }
    if (typeof raw.confirmConsequentialActions === 'boolean') {
      patch.confirmConsequentialActions = raw.confirmConsequentialActions;
    }
    if (raw.aiMode === 'auto' || raw.aiMode === 'offline_only') {
      patch.aiMode = raw.aiMode;
    }
    return patch;
  }

  runSelfTest(): SelfTestCheckItem[] | null {
    const api = this.getNative();
    if (!api || typeof api.runSelfTestJson !== 'function') return null;
    const raw = safeJsonParse<Array<{ id?: string; label?: string; passed?: boolean; detail?: string }>>(
      api.runSelfTestJson(),
      []
    );
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.map((item, idx) => ({
      id: typeof item.id === 'string' ? item.id : `native_check_${idx}`,
      label: typeof item.label === 'string' ? item.label : `Check ${idx + 1}`,
      passed: Boolean(item.passed),
      detail: typeof item.detail === 'string' ? item.detail : '',
      scope: 'native' as const,
    }));
  }

  getInstalledApps(): InstalledAppInfo[] {
    const api = this.getNative();
    if (!api) return [];
    return safeJsonParse<InstalledAppInfo[]>(api.getInstalledAppsJson(), []);
  }

  getNativeDebugLogs(): DebugTraceEntry[] {
    const api = this.getNative();
    if (!api) return [];
    return safeJsonParse<DebugTraceEntry[]>(api.getDebugLogsJson(), []);
  }
}

export const nativeBridge = new ShimiNativeBridge();
