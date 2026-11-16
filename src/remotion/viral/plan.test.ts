import test from 'node:test';
import assert from 'node:assert/strict';
import { buildViralEditPlan, checkPlan, PACE_PRESETS, SPEED } from './plan';
import type { ClipAnalysis, ViralClipInput, ViralListingInfo } from './types';

const listing: ViralListingInfo = {
  monthlyRent: 1450,
  beds: 1,
  baths: 1,
  neighborhood: 'Mission District',
  city: 'San Francisco',
  roomType: 'Private Room',
  squareFeet: 220,
  amenities: ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi'],
};

const ROOMS = ['Bedroom Hook', 'Kitchen & Shared Space', 'Bathroom Peek', 'Closet & Storage', 'Standout Perk'];

function guidedClips(slots = [1, 2, 3, 4, 5], durationSec = 4.5): ViralClipInput[] {
  return slots.map((slot) => ({
    slotNumber: slot,
    room: ROOMS[slot - 1],
    src: `blob:shot-${slot}`,
    durationSec,
  }));
}

function analysis(partial: Partial<ClipAnalysis> & { startSec?: number }): ClipAnalysis {
  const start = partial.startSec ?? 0.8;
  return {
    durationSec: 4.5,
    sampleFps: 6,
    best: { startSec: start, endSec: start + 1.6, score: 0.9, meanLuma: 0.6, meanCorr: 0.95, minCorr: 0.9 },
    exposureBoost: 0,
    quality: 0.9,
    hookScore: 0.9,
    warnings: [],
    ...partial,
  };
}

test('5 guided shots make a ~10 s balanced edit: hook, 3 rooms, perk closer', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.deepEqual(checkPlan(plan), []);
  assert.deepEqual(plan.shots.map((s) => s.slotNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(plan.shots.map((s) => s.role), ['hook', 'tour', 'tour', 'tour', 'closer']);
  const seconds = plan.totalFrames / plan.fps;
  assert.ok(seconds > 9 && seconds < 11, `duration ${seconds}s`);
  // Fast pace: a new room at least every 1.4 s after the hook
  for (let i = 2; i < plan.shots.length; i++) {
    const gap = (plan.shots[i].startFrame - plan.shots[i - 1].startFrame) / plan.fps;
    assert.ok(gap <= 1.4, `gap before shot ${i} is ${gap}s`);
  }
  assert.equal(plan.shots[0].playbackRate, SPEED.hero);
  assert.ok(plan.shots.filter((s) => s.role === 'tour').every((s) => s.playbackRate === SPEED.tour));
  assert.deepEqual(plan.cuts.map((c) => c.kind), ['whip-left', 'zoom-through', 'whip-right', 'light-leak']);
});

test('the hook names the price and the place on frame 0, and the loop returns to it', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.equal(plan.hook.text, 'What $1,450/mo gets you in Mission District');
  assert.deepEqual(
    plan.hook.segments.filter((s) => s.em).map((s) => s.em),
    ['price', 'place']
  );
  assert.equal(plan.hookExitFrame, plan.shots[1].startFrame);
  assert.ok(plan.loopBridgeFrames >= 4 && plan.loopBridgeFrames <= plan.endCard.durationInFrames);
  assert.equal(plan.endCard.fromFrame + plan.endCard.durationInFrames, plan.totalFrames);
  assert.equal(plan.endCard.lead, 'Would you pay');
  assert.equal(plan.endCard.big, '$1,450/mo');
});

test('every shot fits inside its source clip', () => {
  for (const pace of Object.keys(PACE_PRESETS) as (keyof typeof PACE_PRESETS)[]) {
    const plan = buildViralEditPlan({ listing, clips: guidedClips() }, { pace });
    for (const shot of plan.shots) {
      const usedSec = (shot.durationInFrames / plan.fps) * shot.playbackRate;
      assert.ok(shot.srcStartSec >= 0);
      assert.ok(shot.srcStartSec + usedSec <= 4.5 + 1e-6, `${pace} ${shot.id} uses ${shot.srcStartSec}+${usedSec}`);
    }
  }
});

test('the clip analysis picks the start point, the opener and the exposure fix', () => {
  const clips = guidedClips();
  clips[0].analysis = analysis({ hookScore: 0.7, startSec: 0.5 });
  clips[1].analysis = analysis({ hookScore: 1.2, startSec: 1.0 }); // kitchen is the brightest, steadiest
  clips[3].analysis = analysis({ hookScore: 0.6, startSec: 1.5, exposureBoost: 0.4 });
  const plan = buildViralEditPlan({ listing, clips });
  assert.deepEqual(plan.shots.map((s) => s.slotNumber), [2, 1, 3, 4, 5]);
  assert.equal(plan.shots[0].srcStartSec, 1.0);
  const closet = plan.shots.find((s) => s.slotNumber === 4)!;
  assert.equal(closet.exposure, 0.4);
  // The bedroom is no longer the opener, so it gets a callout
  assert.equal(plan.shots[1].tag, 'Your room');
});

test('host picks win over the analysis and AI', () => {
  const clips = guidedClips();
  clips[1].analysis = analysis({ hookScore: 2 });
  const plan = buildViralEditPlan(
    { listing, clips },
    { hookSlotNumber: 3, ai: { hookSlotNumber: 2 }, tagOverrides: { 2: 'Chef kitchen' } }
  );
  assert.equal(plan.shots[0].slotNumber, 3);
  assert.equal(plan.shots.find((s) => s.slotNumber === 2)!.tag, 'Chef kitchen');
});

test('when the perk opens, the strongest remaining shot closes the video', () => {
  const clips = guidedClips();
  clips[4].analysis = analysis({ hookScore: 2 });
  clips[1].analysis = analysis({ hookScore: 1.1 });
  const plan = buildViralEditPlan({ listing, clips });
  assert.equal(plan.shots[0].slotNumber, 5);
  assert.equal(plan.shots[plan.shots.length - 1].slotNumber, 2);
  assert.equal(plan.shots[plan.shots.length - 1].kicker, 'LAST STOP');
});

test('3 shots still make a valid, shorter edit with no re-hook', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips([1, 3, 5]) });
  assert.deepEqual(checkPlan(plan), []);
  assert.equal(plan.shots.length, 3);
  assert.equal(plan.rehook, null);
  assert.equal(plan.shots[2].kicker, 'THE BEST PART');
  assert.equal(plan.shots[2].tag, 'In-unit laundry');
});

test('5 shots get a mid-video re-hook on the middle room', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.ok(plan.rehook);
  assert.equal(plan.rehook!.text, 'Wait for the best part');
  const middle = plan.shots[2];
  assert.ok(plan.rehook!.fromFrame > middle.startFrame);
  assert.ok(plan.rehook!.fromFrame + plan.rehook!.durationInFrames <= middle.startFrame + middle.durationInFrames);
});

test('a short camera-roll clip as the closer is slowed down; only the end card may hold a frame', () => {
  const clips = guidedClips();
  clips[4].durationSec = 2.0;
  const plan = buildViralEditPlan({ listing, clips });
  const closer = plan.shots[4];
  assert.equal(closer.srcStartSec, 0);
  assert.ok(closer.playbackRate < 1 && closer.playbackRate >= SPEED.minCloser);
});

test('guess-the-rent hides the price until the end card reveal', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() }, { style: 'guess-rent' });
  assert.equal(plan.hidePriceUntilEnd, true);
  assert.ok(!plan.hook.text.includes('$'));
  assert.equal(plan.endCard.lead, 'The rent is');
  assert.ok(plan.sfx.some((c) => c.kind === 'ding' && c.atFrame >= plan.endCard.fromFrame));
});

test('AI copy is used when it is safe, and dropped when it describes who should live there', () => {
  const good = buildViralEditPlan(
    { listing, clips: guidedClips() },
    { ai: { hookText: 'What $1,450/mo gets you in the Mission 🔥', tags: { 2: 'Granite island', 3: 'Double vanity' } } }
  );
  assert.equal(good.hook.text, 'What $1,450/mo gets you in the Mission');
  assert.equal(good.shots[1].tag, 'Granite island');
  assert.equal(good.shots[2].tag, 'Double vanity');

  const bad = buildViralEditPlan(
    { listing, clips: guidedClips() },
    { ai: { hookText: '$1,450 room perfect for young professionals', tags: { 2: 'Adults only' } } }
  );
  assert.equal(bad.hook.text, 'What $1,450/mo gets you in Mission District');
  assert.equal(bad.shots[1].tag, 'Full kitchen');
});

test('music with a BPM puts every cut on a beat', () => {
  const plan = buildViralEditPlan(
    { listing, clips: guidedClips() },
    { music: { src: '/music/track.mp3', bpm: 120 } }
  );
  assert.deepEqual(checkPlan(plan), []);
  const beat = 15; // 120 bpm at 30 fps
  for (const shot of plan.shots) assert.equal(shot.startFrame % beat, 0, `${shot.id} at ${shot.startFrame}`);
  assert.equal(plan.endCard.fromFrame % beat, 0);
});

test('the caption has a price question, specs, a soft nudge and 5 hashtags, with no engagement bait', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  const lines = plan.caption.split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /\$1,450\/mo/);
  assert.match(lines[1], /1 bd · 1 ba · 220 sq ft/);
  assert.equal(lines[3].split(' ').length, 5);
  assert.ok(lines[3].split(' ').every((t) => t.startsWith('#')));
  assert.doesNotMatch(plan.caption, /\b(comment|share this|tag a friend|like if)\b/i);
});

test('sound effects follow the cuts and stay inside the video', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.equal(plan.sfx.filter((c) => c.kind === 'whoosh').length, plan.cuts.length);
  assert.ok(plan.sfx.every((c) => c.atFrame >= 0 && c.atFrame < plan.totalFrames));
  const silent = buildViralEditPlan({ listing, clips: guidedClips() }, { sfx: false });
  assert.deepEqual(silent.sfx, []);
});

test('without WebGL effects the closer cut is a flash instead of a light leak', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() }, { enableEffects: false });
  assert.equal(plan.cuts[plan.cuts.length - 1].kind, 'flash');
  assert.equal(plan.enableEffects, false);
});

test('a single clip still renders: hook headline, then the end card', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips([1]) });
  assert.deepEqual(checkPlan(plan), []);
  assert.equal(plan.shots.length, 1);
  assert.equal(plan.cuts.length, 0);
  assert.equal(plan.hookExitFrame, plan.endCard.fromFrame);
});

test('no clips is an error', () => {
  assert.throws(() => buildViralEditPlan({ listing, clips: [] }));
});
