import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDED_SHOTS,
  GUIDED_RECORDING_MS,
  GUIDED_PRE_SHOT_REMINDER,
  MIN_SHOTS_TO_PROCEED,
  createGuidedShotSlots,
  checkCameraRollClip,
  countCompletedShots,
  canProceedWithShots,
  nextShotToCapture,
  isLandscape,
} from './guidedShots';

test('Guided 5-shot list has the 5 shots in order with 7s recording', () => {
  assert.deepEqual(
    GUIDED_SHOTS.map((s) => s.name),
    ['Bedroom Hook', 'Kitchen & Shared Space', 'Bathroom Peek', 'Closet & Storage', 'Standout Perk']
  );
  assert.equal(GUIDED_RECORDING_MS, 15000);
  assert.ok(GUIDED_SHOTS.every((s) => s.instruction.includes('(at least 10 sec)')), 'hosts are told at least 10 seconds per shot');
  const slots = createGuidedShotSlots();
  assert.equal(slots.length, 5);
  assert.equal(slots[0].title, 'Shot 1: Bedroom Hook');
  assert.ok(slots.every((s) => !s.supportsSwap));
});

test('checkCameraRollClip rejects clips under 2 seconds or unreadable', () => {
  const short = checkCameraRollClip({ durationSec: 1.4, width: 1080, height: 1920 });
  assert.equal(short.accepted, false);
  assert.match(short.error || '', /at least 2 seconds/);

  const unreadable = checkCameraRollClip({ durationSec: NaN, width: 0, height: 0 });
  assert.equal(unreadable.accepted, false);

  const exactlyTwo = checkCameraRollClip({ durationSec: 2, width: 1080, height: 1920 });
  assert.equal(exactlyTwo.accepted, true);
  assert.equal(exactlyTwo.warning, undefined);
});

test('checkCameraRollClip accepts landscape clips with a center-crop warning', () => {
  const sideways = checkCameraRollClip({ durationSec: 6, width: 1920, height: 1080 });
  assert.equal(sideways.accepted, true);
  assert.equal(sideways.isLandscape, true);
  assert.match(sideways.warning || '', /center-crop/);
  assert.equal(isLandscape(1080, 1920), false);
  assert.equal(isLandscape(0, 0), false);
});

test('at least 3 shots are needed to proceed, and the next empty shot is tracked', () => {
  assert.equal(MIN_SHOTS_TO_PROCEED, 3);
  const media: Record<number, unknown> = { 1: {}, 3: {} };
  assert.equal(countCompletedShots(media), 2);
  assert.equal(canProceedWithShots(media), false);
  assert.equal(nextShotToCapture(media), 2);
  media[5] = {};
  assert.equal(canProceedWithShots(media), true);
  assert.equal(nextShotToCapture({ 1: {}, 2: {}, 3: {}, 4: {}, 5: {} }), null);
});

test('Quick Tour: 3 shots of 15 s (room, shared space, bathroom), extras add closet and perk', async () => {
  const { shotsForMode, recordingMsFor, instructionFor, GUIDED_SHOTS: ALL } = await import('./guidedShots');
  assert.deepEqual(shotsForMode('quick').map((s) => s.slotNumber), [1, 2, 3]);
  assert.deepEqual(shotsForMode('quick', true).map((s) => s.slotNumber), [1, 2, 3, 4, 5]);
  assert.equal(shotsForMode('guided').length, 5);
  assert.equal(recordingMsFor('quick'), 15000);
  assert.equal(recordingMsFor('guided'), 15000);
  assert.match(instructionFor(ALL[0], 5), /\(5 sec\)/);
  assert.doesNotMatch(instructionFor(ALL[0], 5), /15 sec/);
  // every shot states its length, so the shown length always matches the recording
  for (const shot of ALL) assert.match(shot.instruction, /\(at least \d+ sec\)/, shot.name);
  assert.match(instructionFor(ALL[0], 15), /\(15 sec\)/, 'the in-app recorder states its exact length');
});

test('no filming copy tells the host to walk (walking shakes the camera)', async () => {
  const { WARNING_TIPS } = await import('../remotion/viral/clipSignals');
  const copy = [
    ...GUIDED_SHOTS.flatMap((s) => [s.instruction, s.movementCue]),
    GUIDED_PRE_SHOT_REMINDER,
    ...Object.values(WARNING_TIPS),
  ];
  for (const text of copy) assert.doesNotMatch(text, /\b(walk\w*|steps?)\b/i, text);
});

test('neighbouring shots use different moves', () => {
  for (let i = 0; i + 1 < GUIDED_SHOTS.length; i++) assert.notEqual(GUIDED_SHOTS[i].move, GUIDED_SHOTS[i + 1].move);
});
