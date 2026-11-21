import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSeconds,
  interpretCommandLocally,
  stripWakePhrase,
} from './commandInterpreter';
import type { PermissionStatusMap } from './types';

const DEFAULT_PERMS: PermissionStatusMap = {
  microphone: 'granted',
  camera: 'granted',
  photos: 'prompt',
  notifications: 'prompt',
  overlay: 'android_native_only',
  accessibility: 'android_native_only',
  notification_listener: 'android_native_only',
  contacts: 'android_native_only',
  battery_optimization: 'android_native_only',
};

test('stripWakePhrase removes custom assistant wake prefixes cleanly', () => {
  assert.equal(stripWakePhrase('Hey Shimi, open my camera.', 'Shimi'), 'open my camera.');
  assert.equal(stripWakePhrase('Buddy, scroll down', 'Buddy'), 'scroll down');
  assert.equal(stripWakePhrase('Open YouTube and search jazz', 'Milo'), 'Open YouTube and search jazz');
});

test('extractSeconds parses numeric and spoken durations', () => {
  assert.equal(extractSeconds('take a picture after five seconds'), 5);
  assert.equal(extractSeconds('snap photo in 10 seconds'), 10);
  assert.equal(extractSeconds('take a picture now'), undefined);
});

test('camera countdown command extracts timer and succeeds when permitted', () => {
  const result = interpretCommandLocally(
    'Shimi, take a picture after five seconds.',
    'Shimi',
    'warm',
    DEFAULT_PERMS
  );
  assert.equal(result.intent, 'TAKE_PHOTO_TIMER');
  assert.equal(result.parameters.timerSeconds, 5);
  assert.equal(result.robotState, 'SUCCESS');
  assert.equal(result.requiredPermission, 'camera');
});

test('denied camera permission triggers SORRY state and honest explanation', () => {
  const result = interpretCommandLocally('Hey Shimi, open my camera.', 'Shimi', 'warm', {
    ...DEFAULT_PERMS,
    camera: 'denied',
  });
  assert.equal(result.intent, 'OPEN_CAMERA');
  assert.equal(result.robotState, 'SORRY');
  assert.match(result.spokenReply, /camera permission/i);
});

test('YouTube search extracts query cleanly', () => {
  const result = interpretCommandLocally(
    'Open YouTube and search for relaxing music',
    'Shimi',
    'warm',
    DEFAULT_PERMS
  );
  assert.equal(result.intent, 'OPEN_YOUTUBE_SEARCH');
  assert.equal(result.parameters.query, 'relaxing music');
  assert.equal(result.robotState, 'SUCCESS');
});

test('WhatsApp message command always requires explicit confirmation', () => {
  const result = interpretCommandLocally(
    'Open WhatsApp and send a message to Alex saying see you soon',
    'Shimi',
    'warm',
    DEFAULT_PERMS
  );
  assert.equal(result.intent, 'COMPOSE_MESSAGE');
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.parameters.appName, 'WhatsApp');
  assert.equal(result.parameters.contact, 'Alex');
  assert.equal(result.parameters.messageBody, 'see you soon');
});

test('notification reading honestly reports native Android permission boundary', () => {
  const result = interpretCommandLocally('Read my latest notification.', 'Shimi', 'warm', DEFAULT_PERMS);
  assert.equal(result.intent, 'READ_NOTIFICATIONS');
  assert.equal(result.robotState, 'SORRY');
  assert.equal(result.requiredPermission, 'notification_listener');
});

test('unclear or empty commands return CONFUSED state and clarification prompt', () => {
  const result = interpretCommandLocally('Shimi', 'Shimi', 'warm', DEFAULT_PERMS);
  assert.equal(result.intent, 'CLARIFY');
  assert.equal(result.robotState, 'CONFUSED');
});
