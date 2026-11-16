import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SAMPLE_H,
  SAMPLE_W,
  analyzeSamples,
  computeFrameSignals,
  exposureBoostForLuma,
  findBestWindow,
  findCleanRange,
} from './clipSignals';
import type { ClipSample } from './types';

/**
 * Signals measured from 8 real phone clips of one rental (sampled at 6 fps,
 * 72x128, center 9:16 crop). Most clips open on a wall, a door edge or a slat
 * panel before the room is revealed, which is exactly what the window picker
 * has to skip.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/clip-samples.json', import.meta.url), 'utf8')
) as { sampleFps: number; cols: (keyof ClipSample)[]; clips: Record<string, { durationSec: number; rows: number[][] }> };

function samplesOf(name: string): { samples: ClipSample[]; durationSec: number } {
  const clip = fixture.clips[name];
  const samples = clip.rows.map((row) => {
    const s = {} as ClipSample;
    fixture.cols.forEach((col, i) => {
      s[col] = row[i];
    });
    return s;
  });
  return { samples, durationSec: clip.durationSec };
}

function solidFrame(value: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SAMPLE_W * SAMPLE_H * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = value;
    px[i + 1] = value;
    px[i + 2] = value;
    px[i + 3] = 255;
  }
  return px;
}

function roomLikeFrame(shift = 0): Uint8ClampedArray {
  // bright "window" block top-right, dark "sofa" bottom-left, mid-gray walls, some edges everywhere
  const px = new Uint8ClampedArray(SAMPLE_W * SAMPLE_H * 4);
  for (let y = 0; y < SAMPLE_H; y++) {
    for (let x = 0; x < SAMPLE_W; x++) {
      let v = 140 + ((x + y + shift) % 7) * 6;
      if (x > 40 && y < 50) v = 235;
      if (x < 34 && y > 80) v = 45;
      if ((x + shift) % 12 === 0) v -= 40;
      const i = (y * SAMPLE_W + x) * 4;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return px;
}

test('a blank wall has no detail, no structure and nothing to track', () => {
  const first = computeFrameSignals(solidFrame(180), null);
  const second = computeFrameSignals(solidFrame(182), first.state);
  assert.ok(Math.abs(first.signals.luma - 180 / 255) < 1e-3);
  assert.equal(first.signals.detail, 0);
  assert.equal(first.signals.structure, 0);
  assert.equal(first.signals.balance, 0);
  assert.equal(second.signals.corr, 0);
  assert.ok(second.signals.motion < 0.01);
});

test('a room-like frame has structure, balanced detail and tracks smoothly', () => {
  const a = computeFrameSignals(roomLikeFrame(0), null);
  const b = computeFrameSignals(roomLikeFrame(1), a.state);
  assert.ok(a.signals.structure > 0.15, `structure ${a.signals.structure}`);
  assert.ok(a.signals.detail > 0.04, `detail ${a.signals.detail}`);
  assert.ok(a.signals.balance > 0.5, `balance ${a.signals.balance}`);
  assert.ok(b.signals.corr > 0.9, `corr ${b.signals.corr}`);
});

test('exposure boost brightens dark clips and leaves well-lit ones alone', () => {
  assert.equal(exposureBoostForLuma(0.6), 0);
  assert.ok(exposureBoostForLuma(0.4) > 0.35 && exposureBoostForLuma(0.4) < 0.45);
  assert.equal(exposureBoostForLuma(0.1), 0.6);
  assert.ok(exposureBoostForLuma(0.9) < 0);
});

// Expected starts come from the reference implementation used to tune the scorer
const EXPECTED_START: Record<string, number> = {
  entry: 0.333,
  living: 4.0,
  kitchen: 6.0,
  dining: 3.0,
  bedroom: 6.333,
  bathroom: 6.333,
  closet: 4.0,
};

test('the window picker skips walls, door edges and whip pans on real clips', () => {
  for (const [name, start] of Object.entries(EXPECTED_START)) {
    const { samples } = samplesOf(name);
    const { window } = findBestWindow(samples, { sampleFps: fixture.sampleFps });
    assert.ok(Math.abs(window.startSec - start) < 0.01, `${name}: ${window.startSec} vs ${start}`);
    assert.ok(window.minCorr > 0.8, `${name} should be steady`);
  }
  // The living-room clip opens on a stucco wall for ~1.5 s; never start there
  assert.ok(findBestWindow(samplesOf('living').samples, { sampleFps: 6 }).window.startSec > 1.8);
  // The kitchen clip opens with a whip past a slat wall; start after it settles
  assert.ok(findBestWindow(samplesOf('kitchen').samples, { sampleFps: 6 }).window.startSec > 3);
});

test('the dark closet is brightened instead of flagged, and clean clips have no warnings', () => {
  const closet = samplesOf('closet');
  const a = analyzeSamples(closet.samples, closet.durationSec, { sampleFps: 6 });
  assert.ok(a.exposureBoost > 0.35, `boost ${a.exposureBoost}`);
  assert.deepEqual(
    a.warnings.map((w) => `${w.kind}:${w.severity}`),
    ['dark:fixed']
  );
  const bedroom = samplesOf('bedroom');
  assert.deepEqual(analyzeSamples(bedroom.samples, bedroom.durationSec, { sampleFps: 6 }).warnings, []);
});

test('a clip that is all blank wall asks for a retake', () => {
  const samples: ClipSample[] = Array.from({ length: 24 }, (_, i) => ({
    t: i / 6,
    luma: 0.7,
    detail: 0.006,
    structure: 0.01,
    corr: 0,
    motion: 0.004,
    balance: 0.2,
  }));
  const a = analyzeSamples(samples, 4, { sampleFps: 6 });
  assert.deepEqual(
    a.warnings.map((w) => `${w.kind}:${w.severity}`),
    ['blank:retake']
  );
});

test('clips shorter than the window still get a window', () => {
  const { samples } = samplesOf('entry');
  const short = samples.slice(0, 5);
  const { window } = findBestWindow(short, { sampleFps: 6 });
  assert.equal(window.startSec, 0);
});

test('the clean range grows the best window back to where the room comes into view', () => {
  // [start, end] of usable footage, read off the real clips frame by frame
  const expected: Record<string, [number, number]> = {
    kitchen: [2.667, 8.667], // the slat-wall whip ends at ~2.6 s
    bedroom: [4.167, 9.0], // opens on the door frame for 4 s
    bathroom: [2.167, 8.5],
    closet: [1.333, 6.0],
    living: [2.833, 5.833], // stucco wall, then a pan, for ~2.8 s
  };
  for (const [name, [start, end]] of Object.entries(expected)) {
    const { samples, durationSec } = samplesOf(name);
    const a = analyzeSamples(samples, durationSec, { sampleFps: 6 });
    assert.ok(Math.abs(a.clean!.startSec - start) < 0.01, `${name} clean from ${a.clean!.startSec}`);
    assert.ok(Math.abs(a.clean!.endSec - end) < 0.01, `${name} clean to ${a.clean!.endSec}`);
    assert.ok(a.clean!.startSec <= a.best.startSec && a.clean!.endSec >= a.best.endSec - 1e-9);
    assert.ok(a.clean!.meanMotion! > 0.02 && a.clean!.meanMotion! < 0.12, `${name} motion ${a.clean!.meanMotion}`);
  }
  // The slow bedroom walk moves less than the brisk bathroom walk (speeds get matched in plan.ts)
  const motion = (name: string) => {
    const { samples, durationSec } = samplesOf(name);
    return analyzeSamples(samples, durationSec, { sampleFps: 6 }).clean!.meanMotion!;
  };
  assert.ok(motion('bedroom') < motion('bathroom') / 2);
});

test('a clean range never reaches into a blank wall, and needs no usable frames to exist', () => {
  const samples: ClipSample[] = Array.from({ length: 24 }, (_, i) => ({
    t: i / 6,
    luma: 0.7,
    detail: 0.006,
    structure: 0.01,
    corr: 0,
    motion: 0.004,
    balance: 0.2,
  }));
  const { window } = findBestWindow(samples, { sampleFps: 6 });
  const clean = findCleanRange(samples, window, 4, { sampleFps: 6 });
  assert.equal(clean.startSec, window.startSec);
  assert.equal(clean.endSec, window.endSec);
});
