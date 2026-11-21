import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAlarmTime,
  extractDurationSeconds,
  routeCommandLocally,
} from './intentRouter';
import type { PermissionStatusMap } from './types';

const BASE_PERMS: PermissionStatusMap = {
  microphone: 'granted',
  camera: 'granted',
  photos: 'prompt',
  notifications: 'granted',
  contacts: 'granted',
  overlay: 'granted',
  accessibility: 'granted',
  notification_listener: 'granted',
  battery_optimization: 'granted',
};

test('deterministic phone commands route locally without requiring Gemini', () => {
  const flashlight = routeCommandLocally({
    rawUtterance: 'Turn on flashlight.',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(flashlight.matchedLocally, true);
  assert.equal(flashlight.interpretation.intent, 'FLASHLIGHT_TOGGLE');
  assert.equal(flashlight.interpretation.parameters.flashlightOn, true);

  const flashlightOff = routeCommandLocally({
    rawUtterance: 'Shimi, turn off flashlight',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(flashlightOff.matchedLocally, true);
  assert.equal(flashlightOff.interpretation.parameters.flashlightOn, false);

  const yt = routeCommandLocally({
    rawUtterance: 'Open YouTube.',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(yt.matchedLocally, true);
  assert.equal(yt.interpretation.intent, 'OPEN_APP');
  assert.equal(yt.interpretation.parameters.appName, 'YouTube');
});

test('alarms and timers parse cleanly offline', () => {
  assert.equal(extractDurationSeconds('Set a timer for 10 minutes'), 600);
  assert.deepEqual(extractAlarmTime('Set an alarm for 6:30 AM'), {
    hour: 6,
    minute: 30,
    formatted: '6:30 AM',
  });

  const alarm = routeCommandLocally({
    rawUtterance: 'Set an alarm for 7 AM.',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(alarm.matchedLocally, true);
  assert.equal(alarm.interpretation.intent, 'SET_ALARM');
  assert.equal(alarm.interpretation.parameters.alarmHour, 7);
  assert.equal(alarm.interpretation.parameters.alarmMinute, 0);

  const timer = routeCommandLocally({
    rawUtterance: 'Set a timer for 10 minutes.',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(timer.matchedLocally, true);
  assert.equal(timer.interpretation.intent, 'SET_TIMER');
  assert.equal(timer.interpretation.parameters.timerSeconds, 600);
});

test('device settings, volume, media, apps, and accessibility click route locally', () => {
  const wifi = routeCommandLocally({
    rawUtterance: 'Open Wi-Fi settings',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(wifi.matchedLocally, true);
  assert.equal(wifi.interpretation.intent, 'OPEN_SETTINGS');
  assert.equal(wifi.interpretation.parameters.settingsTarget, 'wifi');

  const vol = routeCommandLocally({
    rawUtterance: 'Decrease volume',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(vol.matchedLocally, true);
  assert.equal(vol.interpretation.intent, 'VOLUME_CONTROL');
  assert.equal(vol.interpretation.parameters.volumeAction, 'down');

  const insta = routeCommandLocally({
    rawUtterance: 'Open Instagram.',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(insta.matchedLocally, true);
  assert.equal(insta.interpretation.intent, 'OPEN_APP');
  assert.equal(insta.interpretation.parameters.appName, 'Instagram');

  const click = routeCommandLocally({
    rawUtterance: 'Click the button that says Continue.',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(click.matchedLocally, true);
  assert.equal(click.interpretation.intent, 'CLICK_UI_ELEMENT');
  assert.equal(click.interpretation.parameters.uiElementText, 'Continue');
});

test('consequential communication & destructive commands enforce safety confirmation', () => {
  const call = routeCommandLocally({
    rawUtterance: 'Call Rahul',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(call.matchedLocally, true);
  assert.equal(call.interpretation.intent, 'CALL_CONTACT');
  assert.equal(call.interpretation.requiresConfirmation, true);
  assert.equal(call.interpretation.parameters.contact, 'Rahul');

  const wa = routeCommandLocally({
    rawUtterance: "Open WhatsApp and send Rahul: I'll reach in 10 minutes.",
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(wa.matchedLocally, true);
  assert.equal(wa.interpretation.intent, 'COMPOSE_MESSAGE');
  assert.equal(wa.interpretation.requiresConfirmation, true);
  assert.equal(wa.interpretation.parameters.contact, 'Rahul');
  assert.match(wa.interpretation.parameters.messageBody || '', /10 minutes/i);

  const del = routeCommandLocally({
    rawUtterance: 'Delete this file',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
  });
  assert.equal(del.matchedLocally, true);
  assert.equal(del.interpretation.requiresConfirmation, true);
  assert.equal(del.interpretation.robotState, 'SORRY');
});

test('open-ended reasoning routes to CLOUD_GEMINI online and returns honest offline message offline', () => {
  const online = routeCommandLocally({
    rawUtterance: 'What should I cook tonight with potatoes and paneer?',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
    isOnline: true,
  });
  assert.equal(online.matchedLocally, false);
  assert.equal(online.interpretation.category, 'CLOUD_GEMINI');
  assert.equal(online.interpretation.requiresCloud, true);

  const offline = routeCommandLocally({
    rawUtterance: 'What is the capital of Kazakhstan?',
    assistantName: 'Shimi',
    personality: 'warm',
    permissions: BASE_PERMS,
    isOnline: false,
  });
  assert.equal(offline.matchedLocally, false);
  assert.match(offline.interpretation.spokenReply, /offline/i);
});
