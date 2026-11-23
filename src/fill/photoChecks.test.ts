import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_LIMITS, dHash, hammingDistance, laplacianVariance, meanBrightness, photoWarnings, type GrayImage } from './photoChecks';

const gray = (width: number, height: number, at: (x: number, y: number) => number): GrayImage => {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = at(x, y);
  return { data, width, height };
};
const ok = { brightness: 120, sharpness: 500, width: 2400, height: 1800, required: true, phash: '0000000000000000', otherHashes: [] as string[] };
const ids = (input: Partial<typeof ok>) => photoWarnings({ ...ok, ...input }).map((w) => w.id);

test('a good landscape photo has no warnings', () => {
  assert.deepEqual(photoWarnings(ok), []);
});

test('too dark: just under the brightness limit warns, at the limit does not', () => {
  assert.deepEqual(ids({ brightness: PHOTO_LIMITS.minBrightness - 0.1 }), ['dark']);
  assert.deepEqual(ids({ brightness: PHOTO_LIMITS.minBrightness }), []);
  assert.equal(photoWarnings({ ...ok, brightness: 10 })[0].text, 'Turn on more lights or open the blinds.');
});

test('blurry: just under the sharpness limit warns, at the limit does not', () => {
  assert.deepEqual(ids({ sharpness: PHOTO_LIMITS.minSharpness - 0.1 }), ['blurry']);
  assert.deepEqual(ids({ sharpness: PHOTO_LIMITS.minSharpness }), []);
  assert.equal(photoWarnings({ ...ok, sharpness: 1 })[0].text, 'Hold still and tap to focus.');
});

test('too small: under 1280 px on the long side warns', () => {
  assert.deepEqual(ids({ width: 1279, height: 960 }), ['small']);
  assert.deepEqual(ids({ width: 1280, height: 960 }), []);
  assert.equal(photoWarnings({ ...ok, width: 800, height: 600 })[0].text, 'Use your camera instead of a screenshot.');
});

test('portrait warns on required shots only', () => {
  assert.deepEqual(ids({ width: 1800, height: 2400, required: true }), ['portrait']);
  assert.deepEqual(ids({ width: 1800, height: 2400, required: false }), []);
  assert.equal(photoWarnings({ ...ok, width: 1800, height: 2400 })[0].text, 'Turn your phone sideways for a wider view.');
});

test('near-duplicate: a hash within the distance limit of another photo warns', () => {
  const near = '0000000000000003'; // 2 bits away
  const far = 'ffffffff00000000'; // 32 bits away
  assert.deepEqual(ids({ otherHashes: [far, near] }), ['duplicate']);
  assert.deepEqual(ids({ otherHashes: [far] }), []);
  assert.equal(hammingDistance('0000000000000000', near), 2);
  assert.ok(PHOTO_LIMITS.duplicateDistance >= 2 && PHOTO_LIMITS.duplicateDistance < 32);
});

test('meanBrightness averages the pixels', () => {
  assert.equal(meanBrightness(gray(4, 4, () => 40)), 40);
  assert.equal(meanBrightness(gray(2, 1, (x) => (x ? 200 : 100))), 150);
});

test('laplacianVariance is zero for a flat image and high for sharp edges', () => {
  assert.equal(laplacianVariance(gray(32, 32, () => 128)), 0);
  const checker = laplacianVariance(gray(32, 32, (x, y) => ((x + y) % 2 ? 255 : 0)));
  const soft = laplacianVariance(gray(32, 32, (x) => 100 + x)); // a smooth ramp
  assert.ok(checker > PHOTO_LIMITS.minSharpness);
  assert.ok(soft < PHOTO_LIMITS.minSharpness);
});

test('dHash: the same picture brighter hashes the same; a different picture does not', () => {
  const a = gray(64, 48, (x, y) => (x * 3 + y) % 200);
  const brighter = gray(64, 48, (x, y) => ((x * 3 + y) % 200) + 30);
  const other = gray(64, 48, (x, y) => (Math.sin(x * y) > 0 ? 220 : 20));
  assert.match(dHash(a), /^[0-9a-f]{16}$/);
  assert.ok(hammingDistance(dHash(a), dHash(brighter)) <= PHOTO_LIMITS.duplicateDistance);
  assert.ok(hammingDistance(dHash(a), dHash(other)) > PHOTO_LIMITS.duplicateDistance);
});
