import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDED_SHOTS,
  GUIDED_RECORDING_MS,
  MIN_SHOTS_TO_PROCEED,
  createGuidedShotSlots,
  checkCameraRollClip,
  countCompletedShots,
  canProceedWithShots,
  nextShotToCapture,
  missingRequiredShots,
  REQUIRED_SHOT_SLOTS,
  isLandscape,
} from './guidedShots';

test('the shot list: bedroom, kitchen, bathroom, living room and the optional perk, 5-15 s each', () => {
  assert.deepEqual(
    GUIDED_SHOTS.map((s) => s.name),
    ['Bedroom', 'Kitchen', 'Bathroom', 'Shared Space (Living Room)', 'Standout Perk']
  );
  assert.equal(GUIDED_RECORDING_MS, 15000, 'the in-app recorder stops at the top of the range');
  assert.ok(GUIDED_SHOTS.every((s) => s.instruction.includes('(5-15 sec)')), 'hosts are told 5-15 seconds per clip');
  const slots = createGuidedShotSlots();
  assert.equal(slots.length, 5);
  assert.equal(slots[0].title, 'Shot 1: Bedroom');
  assert.ok(slots.every((s) => !s.supportsSwap));
});

test('checkCameraRollClip rejects clips under 5 seconds or unreadable; longer than 15 is still used', () => {
  const short = checkCameraRollClip({ durationSec: 3.4, width: 1080, height: 1920 });
  assert.equal(short.accepted, false);
  assert.match(short.error || '', /5-15 seconds/);

  const unreadable = checkCameraRollClip({ durationSec: NaN, width: 0, height: 0 });
  assert.equal(unreadable.accepted, false);

  const exactlyFive = checkCameraRollClip({ durationSec: 5, width: 1080, height: 1920 });
  assert.equal(exactlyFive.accepted, true);
  assert.equal(exactlyFive.warning, undefined);
  assert.equal(checkCameraRollClip({ durationSec: 22, width: 1080, height: 1920 }).accepted, true);
});

test('checkCameraRollClip accepts landscape clips with a center-crop warning', () => {
  const sideways = checkCameraRollClip({ durationSec: 6, width: 1920, height: 1080 });
  assert.equal(sideways.accepted, true);
  assert.equal(sideways.isLandscape, true);
  assert.match(sideways.warning || '', /center-crop/);
  assert.equal(isLandscape(1080, 1920), false);
  assert.equal(isLandscape(0, 0), false);
});

test('the four required areas are needed to proceed; the perk is optional', () => {
  assert.equal(MIN_SHOTS_TO_PROCEED, 4);
  assert.deepEqual(REQUIRED_SHOT_SLOTS, [1, 2, 4, 3], 'bedroom, kitchen, living room, bathroom');
  const media: Record<number, unknown> = { 1: {}, 3: {}, 5: {} };
  assert.equal(countCompletedShots(media), 3);
  assert.equal(canProceedWithShots(media), false, 'the perk does not stand in for a required area');
  assert.deepEqual(missingRequiredShots(media).map((s) => s.name), ['Kitchen', 'Shared Space (Living Room)']);
  assert.equal(nextShotToCapture(media), 2);
  media[2] = {};
  assert.equal(nextShotToCapture(media), 4, 'the living room comes before the bathroom on screen');
  media[4] = {};
  assert.equal(canProceedWithShots(media), true);
  assert.equal(canProceedWithShots({ 1: {}, 2: {}, 3: {}, 4: {} }), true, 'without the perk');
  assert.equal(nextShotToCapture({ 1: {}, 2: {}, 3: {}, 4: {}, 5: {} }), null);
});

test('Quick Tour shows the four required areas in order; the extra adds the perk', async () => {
  const { shotsForMode, recordingMsFor, instructionFor, GUIDED_SHOTS: ALL } = await import('./guidedShots');
  assert.deepEqual(shotsForMode('quick').map((s) => s.slotNumber), [1, 2, 4, 3]);
  assert.deepEqual(shotsForMode('quick', true).map((s) => s.slotNumber), [1, 2, 4, 3, 5]);
  assert.deepEqual(shotsForMode('guided').map((s) => s.slotNumber), [1, 2, 4, 3, 5]);
  assert.equal(recordingMsFor('quick'), 15000);
  assert.equal(recordingMsFor('guided'), 15000);
  for (const shot of ALL) assert.match(shot.instruction, /\(5-15 sec\)/, shot.name);
  assert.match(instructionFor(ALL[0], 15), /\(15 sec\)/, 'the in-app recorder states its exact length');
  assert.doesNotMatch(instructionFor(ALL[0], 15), /5-15/);
});
