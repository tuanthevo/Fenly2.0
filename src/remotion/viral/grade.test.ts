import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildViralEditPlan } from './plan';
import { analyzeSamples } from './clipSignals';
import { bestGradeFix, gradeFixCandidates, gradePlan, PASS_SCORE, readSecFor, textSpans } from './grade';
import type { BuildViralPlanOptions, ClipSample, ViralClipInput, ViralListingInfo } from './types';

const listing: ViralListingInfo = {
  monthlyRent: 3600,
  beds: 1,
  baths: 1,
  neighborhood: 'Willow Glen',
  city: 'San Jose',
  roomType: 'Private Room',
  amenities: ['Full Kitchen'],
  leaseTerm: '12+ Months',
};
const ROOMS = ['Bedroom Hook', 'Kitchen & Shared Space', 'Bathroom Peek', 'Closet & Storage', 'Standout Perk'];

/** The 5 real phone clips from the fixture, analyzed the way the editor does it. */
function realClips(): ViralClipInput[] {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/clip-samples.json', import.meta.url), 'utf8')) as {
    sampleFps: number;
    cols: (keyof ClipSample)[];
    clips: Record<string, { durationSec: number; rows: number[][] }>;
  };
  return ['bedroom', 'kitchen', 'bathroom', 'closet', 'living'].map((name, i) => {
    const clip = fx.clips[name];
    const samples = clip.rows.map((r) => Object.fromEntries(fx.cols.map((c, k) => [c, r[k]])) as unknown as ClipSample);
    return {
      slotNumber: i + 1,
      room: ROOMS[i],
      src: `${name}.mov`,
      durationSec: clip.durationSec,
      analysis: analyzeSamples(samples, clip.durationSec, { sampleFps: fx.sampleFps }),
    };
  });
}

const grade = (clips: ViralClipInput[], options: BuildViralPlanOptions = {}) =>
  gradePlan(buildViralEditPlan({ listing, clips }, options), clips);
const rowOf = (g: ReturnType<typeof gradePlan>, key: string) => g.rows.find((r) => r.key === key)!;

test('the reading-time rule: 1.2 s + 0.22 s a word, 0.3 s more per number, never under 0.8 s', () => {
  assert.equal(readSecFor('Wait for the best part').toFixed(2), '2.30');
  assert.equal(readSecFor('1 bed · 1 bath').toFixed(2), (1.2 + 0.22 * 4 + 0.6).toFixed(2), 'the dot is not a word');
  assert.equal(readSecFor('Hi'), 1.42);
  assert.equal(readSecFor(''), 0);
});

test('the real 5-room tour scores 18/20 on the rubric, but its 6-9 s clips are too short for the 30 s rule', () => {
  const g = grade(realClips());
  assert.equal(g.rows.length, 10);
  assert.ok(g.total >= PASS_SCORE, g.rows.filter((r) => r.score < 2).map((r) => `${r.label}: ${r.note}`).join(' | '));
  // Filmed before 15 s shots: 5.8-9 s clips with 3-6 s of clean footage each
  assert.ok(g.lengthSec < 30, `${g.lengthSec}s`);
  assert.equal(g.lengthOk, false);
  assert.equal(g.passed, false, 'too short to export');
  assert.match(g.lengthNote ?? '', /too short/);
  // The rooms with the least usable footage are the ones to film again (the perk clip has 3 s)
  assert.equal(g.lengthRetakeSlots.length, 2);
  assert.ok(g.lengthRetakeSlots.includes(5));
});

test('15 s shots meet the 30-50 s rule with 3, 4 or 5 rooms', () => {
  for (const slots of [[1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5]]) {
    const clips = slots.map((slot) => ({ slotNumber: slot, room: ROOMS[slot - 1], src: `x${slot}`, durationSec: 15 }));
    const g = grade(clips);
    assert.ok(g.lengthSec >= 30 && g.lengthSec <= 50, `${slots.length} rooms: ${g.lengthSec}s`);
    assert.equal(g.lengthOk, true);
    assert.equal(g.lengthNote, null);
  }
});

test('the length rule starts at 3 rooms, and the teaser is exempt', () => {
  const two = [1, 2].map((slot) => ({ slotNumber: slot, room: ROOMS[slot - 1], src: `x${slot}`, durationSec: 7 }));
  assert.equal(grade(two).lengthOk, true);
  assert.equal(grade(realClips(), { length: 'teaser' }).lengthOk, true);
});

test('every text in the real tour stays on long enough to read, including the re-hook', () => {
  const plan = buildViralEditPlan({ listing, clips: realClips() });
  for (const s of textSpans(plan)) {
    assert.ok((s.to - s.from) / plan.fps + 1 / plan.fps >= readSecFor(s.text), `${s.what} "${s.text}"`);
  }
});

test('three short rooms fail the length rule and say what to film again', () => {
  const g = grade(realClips().filter((c) => c.slotNumber <= 3));
  assert.ok(g.lengthSec < 30);
  assert.equal(g.passed, false);
  assert.match(g.lengthNote ?? '', /30-50 s/);
});

test('a headline without the rent or the place loses the hook-copy row', () => {
  const g = grade(realClips(), { hookTextOverride: 'Cozy room, come see' });
  assert.equal(rowOf(g, 'hookCopy').score, 0);
  assert.equal(rowOf(grade(realClips(), { hookTextOverride: 'What $3,600/mo gets you' }), 'hookCopy').score, 1);
});

test('a dark, shaky opener scores 0 on frame 0 and asks for that shot again', () => {
  const clips = realClips().map((c) =>
    c.slotNumber === 1
      ? { ...c, analysis: { ...c.analysis!, warnings: [{ kind: 'dark' as const, severity: 'retake' as const, tip: 'dark' }] } }
      : c
  );
  const row = rowOf(grade(clips, { hookSlotNumber: 1 }), 'frame0');
  assert.equal(row.score, 0);
  assert.deepEqual(row.retakeSlots, [1]);
});

test('slow motion fails the speed row', () => {
  const clips = realClips();
  const plan = buildViralEditPlan({ listing, clips });
  plan.shots[2].playbackRate = 0.8;
  assert.equal(rowOf(gradePlan(plan, clips), 'speed').score, 0);
});

test('clips that have not been checked yet hold the footage rows at 1', () => {
  const g = grade(realClips().map((c) => ({ ...c, analysis: null })));
  for (const key of ['frame0', 'openings', 'look']) assert.equal(rowOf(g, key).score, 1, key);
  assert.equal(g.passed, false);
});

test('rooms filmed in very different light lose the look row and name the odd room', () => {
  const clips = realClips().map((c) =>
    c.slotNumber === 4 ? { ...c, analysis: { ...c.analysis!, best: { ...c.analysis!.best, meanLuma: 0.2 }, exposureBoost: 0 } } : c
  );
  const plan = buildViralEditPlan({ listing, clips });
  const row = rowOf(gradePlan(plan, clips), 'look');
  assert.ok(row.score < 2);
  assert.ok(row.retakeSlots.includes(4));
});

test('the best fix puts the standard headline back when the host typed one without the rent', () => {
  const clips = realClips();
  const settings = { hookDraft: 'Cozy room, come see' as string | null };
  const build = (patch: { hookDraft?: string | null }) => {
    const plan = buildViralEditPlan({ listing, clips }, { hookTextOverride: 'hookDraft' in patch ? patch.hookDraft : settings.hookDraft });
    return { plan, grade: gradePlan(plan, clips) };
  };
  const current = build({}).grade;
  const fix = bestGradeFix(current, gradeFixCandidates([1, 2, 3, 4, 5]), build);
  assert.ok(fix);
  assert.equal(fix!.patch.hookDraft, null, 'the smallest change that helps comes first');
  assert.ok(fix!.grade.total > current.total);
  assert.equal(bestGradeFix(fix!.grade, gradeFixCandidates([1]), build), null, 'nothing beats a fixed edit');
});

test('rooms sped up to fit 50 s (up to 1.35x) keep full marks for speed; faster than that does not', () => {
  const clips = realClips();
  const plan = buildViralEditPlan({ listing, clips });
  plan.shots[2].playbackRate = 1.3;
  assert.equal(rowOf(gradePlan(plan, clips), 'speed').score, 2);
  plan.shots[2].playbackRate = 1.5;
  assert.equal(rowOf(gradePlan(plan, clips), 'speed').score, 1);
});

test('a clip that could not be checked on the device does not block export once the checks are done', () => {
  const clips = realClips().map((c) => (c.slotNumber === 3 ? { ...c, analysis: null } : c));
  const plan = buildViralEditPlan({ listing, clips });
  const waiting = gradePlan(plan, clips);
  assert.equal(rowOf(waiting, 'openings').score, 1, 'while checks run, the footage rows wait');
  const done = gradePlan(plan, clips, undefined, true);
  assert.equal(rowOf(done, 'openings').score, 2, 'graded on the rooms that were read');
  assert.equal(rowOf(done, 'look').score, 2);
  assert.ok(done.total >= PASS_SCORE);
  // The unreadable clip as the opener: 1 point off, with a retake offered instead of "wait"
  const opener = clips.map((c) => ({ ...c, analysis: c.slotNumber === 1 ? null : realClips()[c.slotNumber - 1].analysis }));
  const row = rowOf(gradePlan(buildViralEditPlan({ listing, clips: opener }, { hookSlotNumber: 1 }), opener, undefined, true), 'frame0');
  assert.equal(row.score, 1);
  assert.deepEqual(row.retakeSlots, [1]);
  assert.doesNotMatch(row.fix, /Wait/);
});
