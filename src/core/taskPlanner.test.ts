import test from 'node:test';
import assert from 'node:assert/strict';
import { planMultiStepTask, resolveInstalledAppMatch } from './taskPlanner';

test('planMultiStepTask compiles WhatsApp multi-step message with confirmation gate', () => {
  const plan = planMultiStepTask(
    "Open WhatsApp and message Rahul that I'm reaching in 10 minutes",
    true
  );
  assert.ok(plan);
  assert.equal(plan.targetAppName, 'WhatsApp');
  assert.equal(plan.requiresAccessibility, true);
  assert.equal(plan.hasConfirmationGate, true);
  assert.equal(plan.steps.length, 7);
  assert.equal(plan.steps[0].type, 'OPEN_APP');
  assert.equal(plan.steps[2].type, 'FIND_UI');
  assert.equal(plan.steps[2].target, 'Rahul');
  assert.equal(plan.steps[4].type, 'TYPE');
  assert.equal(plan.steps[4].value, "I'm reaching in 10 minutes");
  assert.equal(plan.steps[5].type, 'CONFIRM');
  assert.equal(plan.steps[5].status, 'WAITING_CONFIRMATION');
  assert.equal(plan.steps[6].type, 'CLICK');
});

test('planMultiStepTask handles Go to Rahul and send him phrasing', () => {
  const plan = planMultiStepTask("Go to Rahul and send him 'I'm reaching in 10 minutes'", true);
  assert.ok(plan);
  assert.equal(plan.steps[2].target, 'Rahul');
  assert.equal(plan.steps[4].value, "I'm reaching in 10 minutes");
});

test('planMultiStepTask compiles YouTube search and Maps navigation plans', () => {
  const yt = planMultiStepTask('Open YouTube and search for relaxing music', true);
  assert.ok(yt);
  assert.equal(yt.targetAppName, 'YouTube');
  assert.equal(yt.requiresAccessibility, false);
  assert.equal(yt.steps[0].value, 'relaxing music');

  const maps = planMultiStepTask('Open Maps and navigate to International Airport', true);
  assert.ok(maps);
  assert.equal(maps.targetAppName, 'Maps');
  assert.equal(maps.steps[0].value, 'International Airport');
});

test('resolveInstalledAppMatch supports exact match and multi-match disambiguation', () => {
  const apps = [
    { label: 'WhatsApp', packageName: 'com.whatsapp' },
    { label: 'WhatsApp Business', packageName: 'com.whatsapp.w4b' },
    { label: 'Spotify', packageName: 'com.spotify.music' },
  ];

  const exact = resolveInstalledAppMatch('WhatsApp', apps);
  assert.equal(exact.matched?.packageName, 'com.whatsapp');
  assert.equal(exact.ambiguous.length, 0);

  const single = resolveInstalledAppMatch('spot', apps);
  assert.equal(single.matched?.packageName, 'com.spotify.music');

  const multi = resolveInstalledAppMatch('whats', apps);
  assert.equal(multi.matched, null);
  assert.equal(multi.ambiguous.length, 2);
  assert.match(multi.prompt ?? '', /found 2 matching apps/i);
});
