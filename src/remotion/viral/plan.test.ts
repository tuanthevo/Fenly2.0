import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeSamples } from './clipSignals';
import { buildViralEditPlan, checkPlan, hookReadSec, motionMatchedRate, LENGTH_PRESETS, PACE_PRESETS, SPEED } from './plan';
import type { ClipAnalysis, ClipSample, ViralClipInput, ViralEditPlan, ViralListingInfo, ViralShot } from './types';

const listing: ViralListingInfo = {
  monthlyRent: 1450,
  beds: 1,
  baths: 1,
  neighborhood: 'Mission District',
  city: 'San Francisco',
  roomType: 'Private Room',
  squareFeet: 220,
  amenities: ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi', 'Utilities Included'],
  leaseTerm: '6 Months',
};

const ROOMS = ['Bedroom Hook', 'Kitchen & Shared Space', 'Bathroom Peek', 'Closet & Storage', 'Standout Perk'];

function guidedClips(slots = [1, 2, 3, 4, 5], durationSec = 7): ViralClipInput[] {
  return slots.map((slot) => ({
    slotNumber: slot,
    room: ROOMS[slot - 1],
    src: `blob:shot-${slot}`,
    durationSec,
  }));
}

function analysis(partial: Partial<ClipAnalysis> & { startSec?: number; motion?: number }): ClipAnalysis {
  const start = partial.startSec ?? 0.8;
  const { startSec: _s, motion, ...rest } = partial;
  return {
    durationSec: 7,
    sampleFps: 6,
    best: { startSec: start, endSec: start + 1.6, score: 0.9, meanLuma: 0.6, meanCorr: 0.95, minCorr: 0.9, meanMotion: motion },
    clean: { startSec: Math.min(0.3, start), endSec: 7, meanMotion: motion },
    exposureBoost: 0,
    quality: 0.9,
    hookScore: 0.9,
    warnings: [],
    ...rest,
  };
}

const sec = (plan: ViralEditPlan) => plan.totalFrames / plan.fps;
const onScreen = (plan: ViralEditPlan, i: number) =>
  ((i < plan.shots.length - 1 ? plan.shots[i + 1].startFrame : plan.endCard.fromFrame) - plan.shots[i].startFrame) / plan.fps;
/** Source seconds a shot plays, ramp included: [start, end) */
function sourceRange(plan: ViralEditPlan, shot: ViralShot, frames = shot.durationInFrames): [number, number] {
  const ramp = Math.min(shot.rampFrames, frames);
  return [shot.srcStartSec, shot.srcStartSec + (ramp * shot.rampRate + (frames - ramp) * shot.playbackRate) / plan.fps];
}

/** The 5 real phone clips from the fixture, analyzed the way the editor does it. */
const fixture = JSON.parse(readFileSync(new URL('./fixtures/clip-samples.json', import.meta.url), 'utf8')) as {
  sampleFps: number;
  cols: (keyof ClipSample)[];
  clips: Record<string, { durationSec: number; rows: number[][] }>;
};
function realClips(): ViralClipInput[] {
  return ['bedroom', 'kitchen', 'bathroom', 'closet', 'living'].map((name, i) => {
    const clip = fixture.clips[name];
    const samples = clip.rows.map((row) => {
      const s = {} as ClipSample;
      fixture.cols.forEach((col, k) => {
        s[col] = row[k];
      });
      return s;
    });
    return {
      slotNumber: i + 1,
      room: ROOMS[i],
      src: `${name}.mov`,
      durationSec: clip.durationSec,
      analysis: analyzeSamples(samples, clip.durationSec, { sampleFps: fixture.sampleFps }),
    };
  });
}

test('5 guided 7 s shots make a ~27 s full tour: hook + facts, 3 rooms of ~5 s, perk, end card', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.deepEqual(checkPlan(plan), []);
  assert.equal(plan.length, 'full');
  assert.deepEqual(plan.shots.map((s) => s.slotNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(plan.shots.map((s) => s.role), ['hook', 'tour', 'tour', 'tour', 'closer']);
  assert.ok(sec(plan) >= 25 && sec(plan) <= 30, `duration ${sec(plan)}s`);
  assert.ok(onScreen(plan, 0) > 5, 'the opener carries the hook and the facts');
  for (const i of [1, 2, 3]) assert.ok(onScreen(plan, i) >= 4.5 && onScreen(plan, i) <= 5.01, `room ${i}: ${onScreen(plan, i)}s`);
  assert.equal(plan.endCard.durationInFrames, Math.round(3.2 * plan.fps));
  assert.equal(plan.shots[0].playbackRate, SPEED.hero);
  assert.equal(plan.shots[0].rampFrames, 0, 'no ramp on frame 0');
  for (const s of plan.shots.slice(1)) {
    assert.ok(s.rampFrames >= 10 && s.rampRate === 2, `${s.id} ramps in`);
  }
  assert.equal(plan.shots[4].playbackRate, LENGTH_PRESETS.full.closerRate, 'slow-motion perk reveal');
  assert.deepEqual(plan.cuts.map((c) => c.kind), ['whip-left', 'zoom-through', 'whip-right', 'light-leak']);
});

test('the teaser is a ~13 s loop with fast rooms and no extra callouts', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() }, { length: 'teaser' });
  assert.deepEqual(checkPlan(plan), []);
  assert.ok(sec(plan) >= 11 && sec(plan) <= 15, `duration ${sec(plan)}s`);
  for (const i of [1, 2, 3]) assert.ok(onScreen(plan, i) <= 2.3, `room ${i}: ${onScreen(plan, i)}s`);
  assert.ok(plan.shots.every((s) => s.callouts.length === 0));
  assert.ok(plan.shots.filter((s) => s.role === 'tour').every((s) => s.playbackRate >= 1.1));
  assert.equal(plan.hookExitFrame, plan.shots[1].startFrame, 'the headline leaves on the first cut');
});

test('pace scales the full tour from ~24 s (snappy) to ~31 s (relaxed)', () => {
  const lengths = (Object.keys(PACE_PRESETS) as (keyof typeof PACE_PRESETS)[]).map((pace) =>
    sec(buildViralEditPlan({ listing, clips: guidedClips() }, { pace }))
  );
  const [snappy, balanced, relaxed] = lengths;
  assert.ok(snappy < balanced && balanced < relaxed, lengths.join(' < '));
  assert.ok(snappy >= 22 && relaxed <= 33, lengths.join(', '));
});

test('the headline stays up for its reading time, then the listing facts answer it', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.equal(plan.hook.text, 'What $1,450/mo gets you in Mission District');
  assert.deepEqual(plan.hook.segments.filter((s) => s.em).map((s) => s.em), ['price', 'place']);
  assert.equal(plan.hookExitFrame, Math.round(hookReadSec(plan.hook.text, 'full', 'balanced') * plan.fps));
  const facts = plan.shots[0].callouts;
  assert.deepEqual(facts.map((c) => c.text), ['1 bed · 1 bath', '220 sq ft', 'Utilities included']);
  assert.ok(facts.every((c) => c.kind === 'fact' && c.inFrame > plan.hookExitFrame));
  assert.ok(plan.priceChipFromFrame > plan.hookExitFrame && plan.priceChipFromFrame < plan.shots[1].startFrame);
  assert.ok(plan.loopBridgeFrames >= 4 && plan.loopBridgeFrames <= plan.endCard.durationInFrames);
  assert.equal(plan.endCard.big, '$1,450/mo');
});

test('headline reading time: ~2.7 s for 7 words, capped for long hooks, shorter for the teaser', () => {
  assert.ok(Math.abs(hookReadSec('What $1,450/mo gets you in Mission District', 'full', 'balanced') - 2.74) < 0.01);
  assert.equal(hookReadSec('This $1,450 room in the Mission comes with a private bath and laundry', 'full', 'balanced'), 3.2);
  assert.ok(hookReadSec('What $1,450/mo gets you in Mission District', 'teaser', 'balanced') < 2.5);
});

test('rooms are sped up or slowed down to match how fast the camera moves', () => {
  const slow = motionMatchedRate(0.033, 'full', 'balanced'); // a slow shuffle
  const brisk = motionMatchedRate(0.09, 'full', 'balanced'); // a brisk walk
  assert.ok(slow > brisk, `${slow} vs ${brisk}`);
  assert.equal(slow, LENGTH_PRESETS.full.tourRate.max);
  assert.equal(brisk, LENGTH_PRESETS.full.tourRate.min);
  assert.equal(motionMatchedRate(null, 'full', 'balanced'), LENGTH_PRESETS.full.tourRate.fallback);

  const clips = guidedClips();
  clips[1].analysis = analysis({ motion: 0.03 });
  clips[2].analysis = analysis({ motion: 0.12 });
  const plan = buildViralEditPlan({ listing, clips });
  const kitchen = plan.shots.find((s) => s.slotNumber === 2)!;
  const bath = plan.shots.find((s) => s.slotNumber === 3)!;
  assert.ok(kitchen.playbackRate > bath.playbackRate, `${kitchen.playbackRate} vs ${bath.playbackRate}`);
});

test('every shot fits inside its clip for every length and pace (only the closer may hold, under the end card)', () => {
  for (const length of ['full', 'teaser'] as const) {
    for (const pace of Object.keys(PACE_PRESETS) as (keyof typeof PACE_PRESETS)[]) {
      for (const dur of [7, 4.5]) {
        const plan = buildViralEditPlan({ listing, clips: guidedClips(undefined, dur) }, { length, pace });
        assert.deepEqual(checkPlan(plan), [], `${length} ${pace} ${dur}s`);
        for (const shot of plan.shots) {
          const frames = shot.role === 'closer' ? plan.endCard.fromFrame - shot.startFrame : shot.durationInFrames;
          const [from, to] = sourceRange(plan, shot, frames);
          assert.ok(from >= 0 && to <= dur + 1e-6, `${length} ${pace} ${dur}s ${shot.id} plays ${from}-${to}`);
        }
      }
    }
  }
});

test('real phone clips: every shot plays clean footage (no opening wall), about 25 s in total', () => {
  const clips = realClips();
  const plan = buildViralEditPlan({ listing, clips });
  assert.deepEqual(checkPlan(plan), []);
  assert.ok(sec(plan) >= 23 && sec(plan) <= 28, `duration ${sec(plan)}s`);
  for (const shot of plan.shots) {
    const clean = clips.find((c) => c.slotNumber === shot.slotNumber)!.analysis!.clean!;
    const frames = shot.role === 'closer' ? plan.endCard.fromFrame - shot.startFrame : shot.durationInFrames;
    const [from, to] = sourceRange(plan, shot, frames);
    assert.ok(from >= clean.startSec - 1 / plan.fps, `${shot.id} starts at ${from}, clean from ${clean.startSec}`);
    if (shot.role !== 'closer') assert.ok(to <= clean.endSec + 1e-3, `${shot.id} plays to ${to}, clean to ${clean.endSec}`);
  }
  // The hook opens on a clean frame near the analysis' best moment
  const bedroom = clips[0].analysis!;
  assert.ok(plan.shots[0].srcStartSec >= bedroom.best.startSec - 1.5 - 1e-3, `hook from ${plan.shots[0].srcStartSec}`);
  // Long rooms play from where the room comes into view and keep their ramp
  assert.ok(plan.shots.filter((s) => s.role === 'tour').every((s) => s.rampFrames > 0));
});

test('a room with little clean footage gets a shorter section instead of crawling', () => {
  const clips = guidedClips();
  clips[2].analysis = analysis({ startSec: 3, clean: { startSec: 3, endSec: 6.5 } });
  const plan = buildViralEditPlan({ listing, clips });
  const bath = plan.shots.find((s) => s.slotNumber === 3)!;
  const i = plan.shots.indexOf(bath);
  assert.ok(onScreen(plan, i) < 4.5 && onScreen(plan, i) >= LENGTH_PRESETS.full.minTourSec - 1e-6, `${onScreen(plan, i)}s`);
  assert.ok(bath.playbackRate >= LENGTH_PRESETS.full.tourRate.min);
  const [from, to] = sourceRange(plan, bath);
  assert.ok(from >= 3 - 1e-6 && to <= 6.5 + 1e-6, `${from}-${to}`);
});

test('the facts beat is skipped when the opener is short; the headline then leaves on the first cut', () => {
  const clips = guidedClips();
  clips[0].durationSec = 3;
  const plan = buildViralEditPlan({ listing, clips });
  assert.deepEqual(checkPlan(plan), []);
  assert.equal(plan.shots[0].callouts.length, 0);
  assert.equal(plan.hookExitFrame, plan.shots[1].startFrame);
});

test('the clip analysis picks the start point, the opener and the exposure fix', () => {
  const clips = guidedClips();
  clips[0].analysis = analysis({ hookScore: 0.7, startSec: 0.5 });
  clips[1].durationSec = 9;
  clips[1].analysis = analysis({ hookScore: 1.2, startSec: 1.0, clean: { startSec: 0.3, endSec: 9 } }); // kitchen is the brightest, steadiest
  clips[3].analysis = analysis({ hookScore: 0.6, startSec: 1.5, exposureBoost: 0.4 });
  const plan = buildViralEditPlan({ listing, clips });
  assert.deepEqual(plan.shots.map((s) => s.slotNumber), [2, 1, 3, 4, 5]);
  assert.equal(plan.shots[0].srcStartSec, 1.0);
  assert.equal(plan.shots.find((s) => s.slotNumber === 4)!.exposure, 0.4);
  // The bedroom is no longer the opener, so it gets a callout
  assert.equal(plan.shots[1].tag, 'Your room');
});

test('host picks win over the analysis and AI, including second callouts', () => {
  const clips = guidedClips();
  clips[1].analysis = analysis({ hookScore: 2 });
  const plan = buildViralEditPlan(
    { listing, clips },
    {
      hookSlotNumber: 3,
      ai: { hookSlotNumber: 2, details: { 2: 'Gas range', 4: 'Built-in shelves' } },
      tagOverrides: { 2: 'Chef kitchen' },
      detailOverrides: { 2: 'Dishwasher', 4: '' },
    }
  );
  assert.equal(plan.shots[0].slotNumber, 3);
  const kitchen = plan.shots.find((s) => s.slotNumber === 2)!;
  assert.equal(kitchen.tag, 'Chef kitchen');
  assert.deepEqual(kitchen.callouts.map((c) => [c.text, c.kind]), [['Dishwasher', 'room']]);
  assert.equal(plan.shots.find((s) => s.slotNumber === 4)!.callouts.length, 0, 'an empty override removes it');
});

test('without AI, rooms get listing facts as second callouts: amenities, then the lease', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  const details = plan.shots.filter((s) => s.role === 'tour').map((s) => s.callouts.map((c) => `${c.kind}:${c.text}`).join());
  assert.deepEqual(details, ['fact:Fast WiFi', 'fact:6-month lease', '']);
  for (const shot of plan.shots.filter((s) => s.role === 'tour' && s.callouts.length)) {
    const c = shot.callouts[0];
    assert.equal(c.row, 1);
    assert.ok(c.inFrame >= shot.tagInFrame + 1.6 * plan.fps, 'the second beat waits ~2 s after the tag');
  }
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
  assert.ok(sec(plan) > 13 && sec(plan) < 20, `${sec(plan)}s`);
});

test('the re-hook lands near the middle, between a room tag and its second callout', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.ok(plan.rehook);
  assert.equal(plan.rehook!.text, 'Wait for the best part');
  const at = plan.rehook!.fromFrame / plan.totalFrames;
  assert.ok(at > 0.3 && at < 0.55, `re-hook at ${Math.round(at * 100)}%`);
  const room = plan.shots.find((s) => s.startFrame <= plan.rehook!.fromFrame && plan.rehook!.fromFrame < s.startFrame + s.durationInFrames)!;
  assert.equal(room.role, 'tour');
  const local = plan.rehook!.fromFrame - room.startFrame;
  assert.ok(local > room.tagInFrame);
  for (const c of room.callouts) assert.ok(local + plan.rehook!.durationInFrames <= c.inFrame, 'gone before the second callout');
});

test('a short camera-roll clip as the closer is slowed down; only the end card may hold a frame', () => {
  const clips = guidedClips();
  clips[4].durationSec = 2.0;
  const plan = buildViralEditPlan({ listing, clips });
  const closer = plan.shots[4];
  assert.ok(closer.srcStartSec <= 0.25);
  assert.ok(closer.playbackRate < 1 && closer.playbackRate >= SPEED.minCloser);
  const [, revealEnd] = sourceRange(plan, closer, plan.endCard.fromFrame - closer.startFrame);
  assert.ok(revealEnd <= 2.0 + 1e-6, 'the reveal itself never freezes');
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
    {
      ai: {
        hookText: 'What $1,450/mo gets you in the Mission 🔥',
        tags: { 2: 'Granite island', 3: 'Double vanity' },
        details: { 2: 'Gas range', 3: 'Double vanity' },
      },
    }
  );
  assert.equal(good.hook.text, 'What $1,450/mo gets you in the Mission');
  assert.equal(good.shots[1].tag, 'Granite island');
  assert.deepEqual(good.shots[1].callouts.map((c) => [c.text, c.kind]), [['Gas range', 'room']]);
  // A detail that repeats the tag falls back to a listing fact
  assert.deepEqual(good.shots[2].callouts.map((c) => c.kind), ['fact']);

  const bad = buildViralEditPlan(
    { listing, clips: guidedClips() },
    { ai: { hookText: '$1,450 room perfect for young professionals', tags: { 2: 'Adults only' }, details: { 2: 'Great for couples' } } }
  );
  assert.equal(bad.hook.text, 'What $1,450/mo gets you in Mission District');
  assert.equal(bad.shots[1].tag, 'Full kitchen');
  assert.ok(bad.shots[1].callouts.every((c) => c.kind === 'fact'));
});

test('music with a BPM puts every cut on a beat', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() }, { music: { src: '/music/track.mp3', bpm: 120 } });
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

test('sound effects follow the cuts and callouts and stay inside the video', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.equal(plan.sfx.filter((c) => c.kind === 'whoosh').length, plan.cuts.length);
  const callouts = plan.shots.reduce((a, s) => a + s.callouts.length, 0);
  assert.ok(plan.sfx.filter((c) => c.kind === 'pop').length >= callouts);
  assert.ok(plan.sfx.every((c) => c.atFrame >= 0 && c.atFrame < plan.totalFrames));
  const silent = buildViralEditPlan({ listing, clips: guidedClips() }, { sfx: false });
  assert.deepEqual(silent.sfx, []);
});

test('without WebGL effects the closer cut is a flash instead of a light leak', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() }, { enableEffects: false });
  assert.equal(plan.cuts[plan.cuts.length - 1].kind, 'flash');
  assert.equal(plan.enableEffects, false);
});

test('a single clip still renders: hook headline, facts, then the end card', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips([1]) });
  assert.deepEqual(checkPlan(plan), []);
  assert.equal(plan.shots.length, 1);
  assert.equal(plan.cuts.length, 0);
  assert.ok(plan.hookExitFrame < plan.endCard.fromFrame);
  const teaser = buildViralEditPlan({ listing, clips: guidedClips([1]) }, { length: 'teaser' });
  assert.equal(teaser.hookExitFrame, teaser.endCard.fromFrame);
});

test('no clips is an error', () => {
  assert.throws(() => buildViralEditPlan({ listing, clips: [] }));
});
