import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextAutoState,
  DEFAULT_PREFERENCES,
  getInactivityTimeoutMs,
  sanitizePreferences,
  validateAssistantName,
} from './robotStateMachine';

test('validateAssistantName rejects empty or too-short names and trims valid names', () => {
  assert.equal(validateAssistantName('').valid, false);
  assert.equal(validateAssistantName('   ').valid, false);
  assert.equal(validateAssistantName('A').valid, false);
  const ok = validateAssistantName('  Buddy  ');
  assert.equal(ok.valid, true);
  assert.equal(ok.cleaned, 'Buddy');
});

test('computeNextAutoState transitions IDLE to SLEEPING after inactivity timeout', () => {
  const normalMs = getInactivityTimeoutMs(false);
  const saverMs = getInactivityTimeoutMs(true);
  assert.ok(saverMs < normalMs);
  assert.equal(computeNextAutoState('IDLE', normalMs - 1000, true, false), 'IDLE');
  assert.equal(computeNextAutoState('IDLE', normalMs, true, false), 'SLEEPING');
  assert.equal(computeNextAutoState('IDLE', saverMs, true, true), 'SLEEPING');
});

test('computeNextAutoState settles transient reactions back to IDLE when active or SLEEPING when stopped', () => {
  assert.equal(computeNextAutoState('SUCCESS', 5000, true, false), 'IDLE');
  assert.equal(computeNextAutoState('SORRY', 5000, false, false), 'SLEEPING');
  assert.equal(computeNextAutoState('LISTENING', 60000, true, false), 'LISTENING');
});

test('sanitizePreferences protects against corrupt or invalid stored values', () => {
  const result = sanitizePreferences({
    name: 'Milo',
    themeId: 'nonexistent-theme',
    robotStyle: 'invalid' as never,
    accessory: 'glasses',
    onboardingCompleted: true,
  });
  assert.equal(result.name, 'Milo');
  assert.equal(result.themeId, DEFAULT_PREFERENCES.themeId);
  assert.equal(result.robotStyle, DEFAULT_PREFERENCES.robotStyle);
  assert.equal(result.accessory, 'glasses');
  assert.equal(result.onboardingCompleted, true);
});
