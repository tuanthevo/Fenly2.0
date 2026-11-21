import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeSamples } from './clipSignals';
import {
  buildViralEditPlan,
  checkPlan,
  editableShots,
  hookReadSec,
  roomDetail,
  MAX_TOUR_TOTAL_SEC,
  MOMENT_SEC,
  VIDEO_TEXT_SCALE,
  motionMatchedRate,
  reframeFor,
  LENGTH_PRESETS,
  MAX_HOOK_SHIFT_SEC,
  NUMBER_READ_SEC,
  PACE_PRESETS,
  REFRAME_MAX_SCALE,
  SPEED,
} from './plan';
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

test('5 clean 7 s guided shots make a ~34 s full tour (30-45 s): hook + facts, 3 rooms of ~6.5 s, perk, end card', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.deepEqual(checkPlan(plan), []);
  assert.equal(plan.length, 'full');
  assert.deepEqual(plan.shots.map((s) => s.slotNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(plan.shots.map((s) => s.role), ['hook', 'tour', 'tour', 'tour', 'closer']);
  assert.ok(sec(plan) >= 30 && sec(plan) <= 45, `duration ${sec(plan)}s`);
  assert.ok(onScreen(plan, 0) > 6, 'the opener carries the hook and the facts');
  // Rooms aim for 7 s and shrink to the footage a 7 s clip has (it also plays under the next cut)
  for (const i of [1, 2, 3]) assert.ok(onScreen(plan, i) >= 5.5 && onScreen(plan, i) <= 7.01, `room ${i}: ${onScreen(plan, i)}s`);
  assert.equal(plan.endCard.durationInFrames, Math.round(3.5 * plan.fps));
  assert.equal(plan.shots[0].playbackRate, SPEED.hero);
  assert.equal(plan.shots[0].rampFrames, 0, 'no ramp on frame 0');
  // Calm speed: no 2x ramps, rooms between 0.85x and 1.15x
  for (const s of plan.shots) assert.equal(s.rampFrames, 0, `${s.id} has no speed ramp`);
  for (const s of plan.shots.filter((x) => x.role === 'tour')) {
    assert.ok(s.playbackRate >= 0.85 && s.playbackRate <= 1.15, `${s.id} plays at ${s.playbackRate}x`);
  }
  assert.equal(plan.shots[4].playbackRate, LENGTH_PRESETS.full.closerRate, 'slow-motion perk reveal');
  assert.deepEqual(plan.cuts.map((c) => c.kind), ['whip-left', 'whip-right', 'whip-left', 'light-leak']);
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

test('pace scales the full tour from ~31 s (snappy) to ~36 s (relaxed)', () => {
  const lengths = (Object.keys(PACE_PRESETS) as (keyof typeof PACE_PRESETS)[]).map((pace) =>
    sec(buildViralEditPlan({ listing, clips: guidedClips() }, { pace }))
  );
  const [snappy, balanced, relaxed] = lengths;
  assert.ok(snappy < balanced && balanced < relaxed, lengths.join(' < '));
  assert.ok(snappy >= 28 && relaxed <= 40, lengths.join(', '));
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

test('headline reading time: ~2.7 s for 7 words, +0.3 s per number, capped for long hooks, shorter for the teaser', () => {
  // 1.2 s + 7 words x 0.22 s + 1 number x 0.3 s
  assert.ok(Math.abs(hookReadSec('What $1,450/mo gets you in Mission District', 'full', 'balanced') - 3.04) < 0.01);
  assert.ok(Math.abs(hookReadSec('POV: you just moved into Mission District', 'full', 'balanced') - 2.74) < 0.01);
  assert.equal(NUMBER_READ_SEC, 0.3);
  assert.equal(hookReadSec('This $1,450 room in the Mission comes with a private bath and laundry', 'full', 'balanced'), 3.2);
  const teaser = hookReadSec('What $1,450/mo gets you in Mission District', 'teaser', 'balanced');
  assert.ok(teaser < hookReadSec('What $1,450/mo gets you in Mission District', 'full', 'balanced'));
  assert.ok(teaser <= LENGTH_PRESETS.teaser.hook.maxSec);
});

test('a wall or door edge along one side is cropped with a small zoom anchored on the other side', () => {
  assert.deepEqual(reframeFor(null), { scale: 1, originX: 50 });
  assert.deepEqual(reframeFor({ side: 'right', band: 0.04 }), { scale: 1, originX: 50 }); // too thin to bother
  const pillar = reframeFor({ side: 'right', band: 0.15 });
  assert.equal(pillar.originX, 0); // keep the left side
  assert.ok(Math.abs(pillar.scale - 1 / 0.85) < 0.002);
  const door = reframeFor({ side: 'left', band: 0.4 });
  assert.equal(door.originX, 100);
  assert.equal(door.scale, REFRAME_MAX_SCALE); // never zoom past 1.25x
});

test('rooms are sped up or slowed down to match how fast the camera moves', () => {
  const slow = motionMatchedRate(0.033, 'full', 'balanced'); // a slow shuffle
  const brisk = motionMatchedRate(0.09, 'full', 'balanced'); // a brisk walk
  assert.ok(slow > brisk, `${slow} vs ${brisk}`);
  assert.equal(slow, LENGTH_PRESETS.full.tourRate.max);
  assert.equal(brisk, LENGTH_PRESETS.full.tourRate.min);
  assert.equal(motionMatchedRate(null, 'full', 'balanced'), LENGTH_PRESETS.full.tourRate.fallback);

  // Long enough to play a 7 s room faster than real time
  const clips = guidedClips(undefined, 12);
  clips[1].analysis = { ...analysis({ motion: 0.03 }), durationSec: 12, clean: { startSec: 0.3, endSec: 12, meanMotion: 0.03 } };
  clips[2].analysis = { ...analysis({ motion: 0.12 }), durationSec: 12, clean: { startSec: 0.3, endSec: 12, meanMotion: 0.12 } };
  const plan = buildViralEditPlan({ listing, clips });
  const kitchen = plan.shots.find((s) => s.slotNumber === 2 && s.role === 'tour')!;
  const bath = plan.shots.find((s) => s.slotNumber === 3 && s.role === 'tour')!;
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

test('real phone clips: every shot plays clean footage (no opening wall), about 31 s in total', () => {
  const clips = realClips();
  const plan = buildViralEditPlan({ listing, clips });
  assert.deepEqual(checkPlan(plan), []);
  assert.ok(sec(plan) >= 28 && sec(plan) <= 34, `duration ${sec(plan)}s`);
  for (const shot of plan.shots) {
    const clean = clips.find((c) => c.slotNumber === shot.slotNumber)!.analysis!.clean!;
    const frames = shot.role === 'closer' ? plan.endCard.fromFrame - shot.startFrame : shot.durationInFrames;
    const [from, to] = sourceRange(plan, shot, frames);
    assert.ok(from >= clean.startSec - 1 / plan.fps, `${shot.id} starts at ${from}, clean from ${clean.startSec}`);
    if (shot.role !== 'closer') assert.ok(to <= clean.endSec + 1e-3, `${shot.id} plays to ${to}, clean to ${clean.endSec}`);
  }
  // The hook opens on a clean frame near the analysis' best moment
  const bedroom = clips[0].analysis!;
  assert.ok(plan.shots[0].srcStartSec >= bedroom.best.startSec - MAX_HOOK_SHIFT_SEC - 1e-3, `hook from ${plan.shots[0].srcStartSec}`);
  // No speed ramps anywhere
  assert.ok(plan.shots.every((s) => s.rampFrames === 0));
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
  assert.ok(sec(plan) > 18 && sec(plan) < 26, `${sec(plan)}s`);
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

test('a late best frame keeps the cover; the facts move to the end card instead of an unreadable beat', () => {
  // The kitchen from the host's guided shots, with the best frame where the browser found it (6.5 s)
  const fx = JSON.parse(readFileSync(new URL('./fixtures/guided-shots.json', import.meta.url), 'utf8')) as {
    cols: (keyof ClipSample)[];
    clips: Record<string, { durationSec: number; rows: number[][] }>;
  };
  const clipOf = (name: string, slotNumber: number, room: string): ViralClipInput => {
    const clip = fx.clips[name];
    const samples = clip.rows.map((row) => {
      const s = {} as ClipSample;
      fx.cols.forEach((col, i) => {
        (s as Record<string, number>)[col] = row[i];
      });
      return s;
    });
    return { slotNumber, room, src: `${name}.mov`, durationSec: clip.durationSec, analysis: analyzeSamples(samples, clip.durationSec, { sampleFps: 6 }) };
  };
  const kitchen = clipOf('kitchen', 2, 'Kitchen & Shared Space');
  kitchen.analysis = { ...kitchen.analysis!, best: { ...kitchen.analysis!.best, startSec: 6.5, endSec: 8.17 } };
  const clips = [clipOf('bedroom', 1, 'Bedroom Hook'), kitchen, clipOf('bathroom', 3, 'Bathroom Peek'), clipOf('closet', 4, 'Closet & Storage'), clipOf('living', 5, 'Standout Perk')];
  const plan = buildViralEditPlan(
    { listing, clips },
    { hookSlotNumber: 2, hookTextOverride: 'You just found a $1,450/mo room in Mission District' }
  );
  const opener = plan.shots[0];
  assert.equal(opener.slotNumber, 2);
  // The cover stays near the best frame, on clean footage: 2.5 s earlier this clip shows a cluttered corner
  assert.ok(opener.srcStartSec >= kitchen.analysis!.clean!.startSec - 1e-6);
  assert.ok(opener.srcStartSec >= 6.5 - MAX_HOOK_SHIFT_SEC - 1e-6, `opener from ${opener.srcStartSec}`);
  // Too little footage for a readable facts beat: it is dropped, and the facts still reach the end card
  assert.ok(!opener.callouts.some((c) => c.kind === 'fact'));
  assert.match(plan.endCard.sub, /1 bd/);
  assert.match(plan.endCard.sub, /220 sq ft/);
});

test('long clips use a second moment of the same room instead of being thrown away (3 shots: 9 / 20 / 20 s)', () => {
  const clips = guidedClips([1, 2, 3]).map((c, i) => ({ ...c, durationSec: [9, 20, 20][i] }));
  const before = buildViralEditPlan({ listing, clips: guidedClips([1, 2, 3]).map((c) => ({ ...c, durationSec: 9 })) });
  const plan = buildViralEditPlan({ listing, clips });
  assert.deepEqual(checkPlan(plan), []);
  assert.ok(sec(plan) >= 30 && sec(plan) <= MAX_TOUR_TOTAL_SEC, `duration ${sec(plan)}s`);
  assert.ok(sec(plan) > sec(before) + 8, `${sec(plan)}s vs ${sec(before)}s with short clips`);
  // The 20 s bathroom (a tour room) plays as two moments joined by a zoom cut; the label sits on the first
  const bath = plan.shots.filter((s) => s.slotNumber === 3);
  assert.equal(bath.length, 2);
  assert.ok(bath[0].tag && !bath[1].tag, 'one label per room');
  assert.equal(bath[1].part, 2);
  assert.equal(bath[1].id, 'shot-3-2');
  const cutIntoSecond = plan.cuts[plan.shots.indexOf(bath[1]) - 1];
  assert.equal(cutIntoSecond.kind, 'zoom-through');
  // ...and only there: a cut into a different room is a whip
  plan.cuts.slice(0, -1).forEach((c, k) => {
    if (plan.shots[k].slotNumber !== plan.shots[k + 1].slotNumber) assert.notEqual(c.kind, 'zoom-through', `cut ${k}`);
  });
  // The two moments use different footage, the second one later in the clip
  const [, aEnd] = sourceRange(plan, bath[0]);
  const [bStart, bEnd] = sourceRange(plan, bath[1]);
  assert.ok(bStart >= aEnd - 1e-6 && bEnd <= 20, `${aEnd} -> ${bStart}-${bEnd}`);
  for (const s of bath) assert.ok(onScreen(plan, plan.shots.indexOf(s)) <= MOMENT_SEC + 0.5, `${s.id} ${onScreen(plan, plan.shots.indexOf(s))}s`);
  // The kitchen closer (not the perk) gets a calm moment before its slow reveal
  const kitchen = plan.shots.filter((s) => s.slotNumber === 2);
  assert.deepEqual(kitchen.map((s) => s.role), ['tour', 'closer']);
  // The editor still lists one row per room, and finds each room's detail
  assert.deepEqual(editableShots(plan).map((s) => s.slotNumber), [1, 3, 2]);
  assert.ok(roomDetail(plan, 3).length > 0);
});

test('a perk closer is never shown before its reveal, and the teaser never splits rooms', () => {
  const long = guidedClips().map((c) => ({ ...c, durationSec: 20 }));
  const full = buildViralEditPlan({ listing, clips: long });
  assert.equal(full.shots.filter((s) => s.slotNumber === 5).length, 1);
  assert.ok(sec(full) <= MAX_TOUR_TOTAL_SEC, `${sec(full)}s`);
  assert.deepEqual(checkPlan(full), []);
  const teaser = buildViralEditPlan({ listing, clips: long }, { length: 'teaser' });
  assert.equal(teaser.shots.length, 5);
  assert.ok(teaser.shots.every((s) => s.rampFrames === 0));
});

test('video tours use smaller text', () => {
  const plan = buildViralEditPlan({ listing, clips: guidedClips() });
  assert.equal(plan.textScale, VIDEO_TEXT_SCALE);
  assert.ok(VIDEO_TEXT_SCALE < 1);
});
