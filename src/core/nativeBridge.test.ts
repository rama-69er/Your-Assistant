import test from 'node:test';
import assert from 'node:assert/strict';
import { ShimiNativeBridge } from '../services/nativeBridge';

test('ShimiNativeBridge reports disconnected truthfully in non-Android environment', () => {
  const bridge = new ShimiNativeBridge();
  assert.equal(bridge.isNativeAvailable(), false);
  const snap = bridge.getSnapshot();
  assert.equal(snap.connected, false);
  assert.equal(snap.serviceRunning, false);

  const bgResult = bridge.setBackgroundAssistantEnabled(true);
  assert.equal(bgResult.ok, false);
  assert.match(bgResult.message, /Native Android/i);
});
