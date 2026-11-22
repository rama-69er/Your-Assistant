import test from 'node:test';
import assert from 'node:assert/strict';
import { ShimiNativeBridge, type ShimiAndroidJavascriptInterface } from '../services/nativeBridge';

test('ShimiNativeBridge reports disconnected truthfully in non-Android environment', () => {
  const bridge = new ShimiNativeBridge();
  assert.equal(bridge.isNativeAvailable(), false);
  const snap = bridge.getSnapshot();
  assert.equal(snap.connected, false);
  assert.equal(snap.serviceRunning, false);
  assert.equal(bridge.getNativeConfig(), null);
  assert.equal(bridge.runSelfTest(), null);

  const bgResult = bridge.setBackgroundAssistantEnabled(true);
  assert.equal(bgResult.ok, false);
  assert.match(bgResult.message, /Native Android/i);
});

test('ShimiNativeBridge hydrates personalized BuildConfig defaults and parses self-test checks', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;

  const mockNative: ShimiAndroidJavascriptInterface = {
    getSnapshotJson: () =>
      JSON.stringify({
        serviceRunning: true,
        wakeWordActive: true,
        wakeWordProvider: 'OfflineAcousticWakeProvider',
        robotState: 'IDLE',
      }),
    getAssistantConfigJson: () =>
      JSON.stringify({
        schemaVersion: 2,
        assistantName: 'Milo',
        wakeWord: 'Milo',
        robotStyle: 'aero',
        accessory: 'headphones',
        personality: 'playful',
        themeId: 'sage-emerald',
        confirmConsequentialActions: true,
      }),
    runSelfTestJson: () =>
      JSON.stringify([
        { id: 'mic', label: 'Microphone permission', passed: true, detail: 'Granted' },
        { id: 'wake', label: 'Wake word engine', passed: true, detail: 'OfflineAcousticWakeProvider' },
      ]),
    syncSettingsJson: () => undefined,
    setBackgroundAssistantEnabled: () => JSON.stringify({ ok: true, message: 'Started' }),
    startListening: () => JSON.stringify({ ok: true, message: 'Listening' }),
    stopListening: () => JSON.stringify({ ok: true, message: 'Stopped' }),
    executeActionJson: () => JSON.stringify({ executed: true, status: 'executed', summary: 'Done' }),
    confirmPendingAction: () => JSON.stringify({ executed: true, status: 'executed', summary: 'Confirmed' }),
    cancelPendingAction: () => JSON.stringify({ ok: true }),
    openAndroidSetting: () => JSON.stringify({ ok: true, message: 'Opened' }),
    requestBatteryOptimizationExemption: () => JSON.stringify({ ok: true, message: 'Requested' }),
    getInstalledAppsJson: () => '[]',
    getDebugLogsJson: () => '[]',
  };

  (globalThis as { window?: { ShimiNative?: ShimiAndroidJavascriptInterface } }).window = {
    ShimiNative: mockNative,
  };

  try {
    const bridge = new ShimiNativeBridge();
    assert.equal(bridge.isNativeAvailable(), true);

    const cfg = bridge.getNativeConfig();
    assert.equal(cfg?.name, 'Milo');
    assert.equal(cfg?.wakeWord, 'Milo');
    assert.equal(cfg?.robotStyle, 'aero');
    assert.equal(cfg?.accessory, 'headphones');
    assert.equal(cfg?.personality, 'playful');
    assert.equal(cfg?.themeId, 'sage-emerald');

    const checks = bridge.runSelfTest();
    assert.ok(checks);
    assert.equal(checks.length, 2);
    assert.equal(checks[0].passed, true);
    assert.equal(checks[1].scope, 'native');
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});
