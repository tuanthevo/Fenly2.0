import test from 'node:test';
import assert from 'node:assert/strict';
import { bestFennEdit, FENN_PASS, readSec, scoreEdit } from './fennScore';
import { buildViralEditPlan } from './plan';
import type { ClipAnalysis, ViralClipInput, ViralListingInfo } from './types';

const listing: ViralListingInfo = {
  monthlyRent: 1450,
  beds: 1,
  baths: 1,
  neighborhood: 'Mission District',
  city: 'San Francisco',
  roomType: 'Private Room',
  squareFeet: 220,
  amenities: ['Private Bath', 'In-Unit W/D'],
  leaseTerm: '6 Months',
};
const ROOMS = ['Bedroom Hook', 'Kitchen & Shared Space', 'Bathroom Peek', 'Closet & Storage', 'Standout Perk'];

function analysis(over: Partial<ClipAnalysis> = {}): ClipAnalysis {
  return {
    durationSec: 5,
    sampleFps: 6,
    best: { startSec: 0.8, endSec: 2.4, score: 0.9, meanLuma: 0.6, meanCorr: 0.95, minCorr: 0.9, meanMotion: 0.04 },
    clean: { startSec: 0.5, endSec: 4.9, meanMotion: 0.04 },
    steady: { startSec: 0.8, endSec: 4.8, shake: 0.1, meanMotion: 0.04 },
    exposureBoost: 0,
    quality: 0.9,
    hookScore: 0.9,
    warnings: [],
    ...over,
  };
}
const clips = (slots = [1, 2, 3]): ViralClipInput[] =>
  slots.map((slot) => ({ slotNumber: slot, room: ROOMS[slot - 1], src: `blob:${slot}`, durationSec: 5, analysis: analysis() }));
const fenn = { length: 'fenn' as const };
const rowOf = (s: ReturnType<typeof scoreEdit>, id: string) => s.rows.find((r) => r.id === id)!;

test('three steady quick-tour clips pass with nothing to fix', () => {
  const input = { listing, clips: clips() };
  const s = scoreEdit(buildViralEditPlan(input, fenn), input.clips);
  assert.equal(s.rows.length, 10);
  assert.ok(s.score >= FENN_PASS, `score ${s.score}: ${JSON.stringify(s.rows.filter((r) => r.points < 2))}`);
  assert.equal(s.fix, null);
});

test('shaky clips lose the steadiness points, and the fix names the worst one without telling anyone to walk', () => {
  const c = clips([1, 2, 3, 4, 5]);
  c[2].analysis = analysis({ steady: { startSec: 0.8, endSec: 4.8, shake: 0.8, meanMotion: 0.05 } });
  c[3].analysis = analysis({ steady: { startSec: 0.8, endSec: 4.8, shake: 0.5, meanMotion: 0.05 }, warnings: [{ kind: 'dark', severity: 'retake', tip: 'x' }] });
  c[1].analysis = analysis({ clean: { startSec: 2.9, endSec: 4.9 }, steady: { startSec: 2.9, endSec: 4.9, shake: 0.1, meanMotion: 0.04 } });
  const s = scoreEdit(buildViralEditPlan({ listing, clips: c }, fenn), c);
  assert.equal(rowOf(s, 'steadiness').points, 0);
  assert.ok(s.score < FENN_PASS, `score ${s.score}`);
  assert.equal(s.fix?.slotNumber, 3);
  assert.match(s.fix!.tip, /Bathroom Peek/);
  assert.doesNotMatch(s.fix!.tip, /\b(walk\w*|steps?)\b/i);
});

test('one slightly shaky clip costs a point, not a retake', () => {
  const c = clips();
  c[1].analysis = analysis({ steady: { startSec: 0.8, endSec: 4.8, shake: 0.32, meanMotion: 0.05 } });
  const s = scoreEdit(buildViralEditPlan({ listing, clips: c }, fenn), c);
  assert.equal(rowOf(s, 'steadiness').points, 1);
});

test('the headline needs the rent and the place; a listing with no rent does not break the score', () => {
  const input = { listing, clips: clips() };
  const noRent = scoreEdit(buildViralEditPlan(input, { ...fenn, hookTextOverride: 'Come see this lovely room today' }), input.clips);
  assert.equal(rowOf(noRent, 'hookCopy').points, 0);
  const bare = { listing: { ...listing, monthlyRent: 0, neighborhood: '' }, clips: clips() };
  const s = scoreEdit(buildViralEditPlan(bare, fenn), bare.clips);
  assert.ok(Number.isInteger(s.score));
  assert.doesNotMatch(JSON.stringify(s), /undefined|NaN/);
});

test('clips without analysis (older saved edits) and a single clip still score', () => {
  const plain: ViralClipInput[] = clips().map((c) => ({ ...c, analysis: null }));
  assert.ok(scoreEdit(buildViralEditPlan({ listing, clips: plain }, fenn), plain).score > 0);
  const one = clips([1]);
  assert.ok(scoreEdit(buildViralEditPlan({ listing, clips: one }, fenn), one).score > 0);
});

test('Fenn keeps the best cut: never worse than the plain edit, and the host\'s own opener is kept', () => {
  const c = clips([1, 2, 3]);
  c[0].analysis = analysis({ quality: 0.2, hookScore: 2 }); // picked as the opener, but a poor cover
  const input = { listing, clips: c };
  const plain = scoreEdit(buildViralEditPlan(input, fenn), c);
  const best = bestFennEdit(input, fenn);
  assert.ok(best.score.score > plain.score, `${best.score.score} vs ${plain.score}`);
  assert.notEqual(best.plan.shots[0].slotNumber, 1);
  const chosen = bestFennEdit(input, { ...fenn, hookSlotNumber: 1 });
  assert.equal(chosen.plan.shots[0].slotNumber, 1);
});

test('reading time: 1.2 s + 0.22 s a word + 0.3 s a number, at least 0.8 s', () => {
  assert.ok(Math.abs(readSec('Double vanity') - 1.64) < 1e-9);
  assert.ok(Math.abs(readSec('220 sq ft') - 2.16) < 1e-9);
});
