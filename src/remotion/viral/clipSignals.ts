/**
 * Local "filming coach" for the viral editor: finds the cleanest stretch of
 * each clip without any server or AI call.
 *
 * Each sampled frame is reduced to a 72x128 thumbnail (center 9:16 crop, the
 * part the feed shows) and measured (see ClipSample). A sliding window then
 * scores every 1.6 s stretch for:
 *   - structure: real room shapes, not a blank wall or a texture close-up
 *   - brightness: after the exposure fix we can apply
 *   - steadiness: thumbnails that change smoothly from sample to sample
 *   - no wall or door edge covering part of the frame (strip balance)
 *   - a little forward motion (energy), but no whip pans
 * The first frame of the window counts extra, because it is what viewers see
 * as the cut lands.
 *
 * Tuned on real phone footage of a rental (8 clips that open on walls, door
 * edges and slat panels before the room is revealed). Pure functions only;
 * analyzeClipInBrowser.ts does the DOM sampling.
 */
import type { ClipAnalysis, ClipRange, ClipSample, ClipWindow, SteadyWindow } from './types';

export const SAMPLE_W = 72;
export const SAMPLE_H = 128;
export const COARSE_FACTOR = 4;
export const DEFAULT_SAMPLE_FPS = 6;
export const DEFAULT_WINDOW_SEC = 1.6;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export type FrameState = {
  luma: Float32Array;
  coarse: Float32Array;
  coarseStd: number;
};

function meanStd(values: Float32Array): { mean: number; std: number } {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  const mean = sum / values.length;
  let v = 0;
  for (let i = 0; i < values.length; i++) v += (values[i] - mean) ** 2;
  return { mean, std: Math.sqrt(v / values.length) };
}

/**
 * Measures one RGBA frame (canvas ImageData order). `prev` is the state of
 * the previous sample of the same clip, or null for the first one.
 */
export function computeFrameSignals(
  rgba: ArrayLike<number>,
  prev: FrameState | null,
  width = SAMPLE_W,
  height = SAMPLE_H
): { signals: Omit<ClipSample, 't'>; state: FrameState } {
  const n = width * height;
  const luma = new Float32Array(n);
  let lumaSum = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luma[i] = y;
    lumaSum += y;
  }

  // Fine detail: mean |dx| + mean |dy|, plus the same gradient split into 3 vertical strips
  let gxSum = 0;
  let gySum = 0;
  const stripWidth = Math.floor((width - 1) / 3);
  const strips = [0, 0, 0];
  const stripCounts = [0, 0, 0];
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      const i = yy * width + xx;
      const dx = xx < width - 1 ? Math.abs(luma[i + 1] - luma[i]) : 0;
      const dy = yy < height - 1 ? Math.abs(luma[i + width] - luma[i]) : 0;
      if (xx < width - 1) gxSum += dx;
      if (yy < height - 1) gySum += dy;
      if (xx < width - 1 && yy < height - 1) {
        const s = Math.floor(xx / stripWidth);
        if (s < 3) {
          strips[s] += dx + dy;
          stripCounts[s] += 1;
        }
      }
    }
  }
  const detail = gxSum / ((width - 1) * height) + gySum / (width * (height - 1));
  const { coverage, edgeLeft, edgeRight } = columnCoverage(luma, width, height);
  const stripMeans = strips.map((s, k) => (stripCounts[k] ? s / stripCounts[k] : 0));
  const maxStrip = Math.max(...stripMeans);
  const balance = maxStrip > 1e-6 ? Math.min(...stripMeans) / maxStrip : 0;

  // Coarse 18x32 thumbnail (4x4 box filter)
  const cw = Math.floor(width / COARSE_FACTOR);
  const ch = Math.floor(height / COARSE_FACTOR);
  const coarse = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let s = 0;
      for (let oy = 0; oy < COARSE_FACTOR; oy++) {
        for (let ox = 0; ox < COARSE_FACTOR; ox++) {
          s += luma[(cy * COARSE_FACTOR + oy) * width + cx * COARSE_FACTOR + ox];
        }
      }
      coarse[cy * cw + cx] = s / (COARSE_FACTOR * COARSE_FACTOR);
    }
  }
  const { mean: cMean, std: coarseStd } = meanStd(coarse);

  let corr = 1;
  let motion = 0;
  if (prev) {
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(luma[i] - prev.luma[i]);
    motion = diff / n;
    if (prev.coarseStd < 0.02 || coarseStd < 0.02) {
      corr = 0; // nothing to track: blank wall or lens covered
    } else {
      const { mean: pMean } = meanStd(prev.coarse);
      let cov = 0;
      for (let i = 0; i < coarse.length; i++) cov += (coarse[i] - cMean) * (prev.coarse[i] - pMean);
      corr = cov / coarse.length / (coarseStd * prev.coarseStd);
    }
  }

  return {
    signals: {
      luma: lumaSum / n,
      detail,
      structure: coarseStd,
      corr: clamp(corr, -1, 1),
      motion,
      balance,
      coverage,
      edgeLeft,
      edgeRight,
    },
    state: { luma, coarse, coarseStd },
  };
}

/**
 * Column detail below this (mean |dx| + |dy| per pixel, 5-column average)
 * means "nothing to see": a painted wall, a door edge, a pillar. Tuned on the
 * host's clips: hallway walls and door edges sit at 0.005-0.025, rooms above 0.04.
 */
export const COLUMN_DETAIL_MIN = 0.03;

/**
 * How much of the frame shows the room, by column, and how wide a featureless
 * band runs along each side. A band may contain a few detailed columns (the
 * door frame's own lines): it is the widest stretch from the edge that is at
 * least 85% featureless and ends on a featureless column.
 */
export function columnCoverage(
  luma: ArrayLike<number>,
  width = SAMPLE_W,
  height = SAMPLE_H
): { coverage: number; edgeLeft: number; edgeRight: number } {
  const col = new Float32Array(width);
  for (let x = 0; x < width - 1; x++) {
    let s = 0;
    for (let y = 0; y < height - 1; y++) {
      const i = y * width + x;
      s += Math.abs(luma[i + 1] - luma[i]) + Math.abs(luma[i + width] - luma[i]);
    }
    col[x] = s / (height - 1);
  }
  col[width - 1] = col[width - 2] ?? 0;
  const low: boolean[] = [];
  for (let x = 0; x < width; x++) {
    let s = 0;
    let c = 0;
    for (let k = -2; k <= 2; k++) {
      const j = x + k;
      if (j >= 0 && j < width) {
        s += col[j];
        c += 1;
      }
    }
    low.push(s / c < COLUMN_DETAIL_MIN);
  }
  const band = (fromRight: boolean) => {
    let best = 0;
    let lowCount = 0;
    for (let k = 0; k < width; k++) {
      const x = fromRight ? width - 1 - k : k;
      if (low[x]) lowCount += 1;
      if (low[x] && lowCount / (k + 1) >= 0.85) best = k + 1;
    }
    return best / width;
  };
  return {
    coverage: low.filter((l) => !l).length / width,
    edgeLeft: band(false),
    edgeRight: band(true),
  };
}

/** Stops of exposure that bring a clip's mean luma toward ~0.55 (dark rooms up to +0.6). */
export function exposureBoostForLuma(meanLuma: number): number {
  if (!(meanLuma > 0)) return 0.6;
  if (meanLuma < 0.55) return clamp(Math.log2(0.55 / meanLuma) * 0.9, 0, 0.6);
  if (meanLuma > 0.78) return -clamp((meanLuma - 0.78) * 1.5, 0, 0.25);
  return 0;
}

/** 1 when at least 90% of the columns show the room, 0 at 60% or less (missing = older data, counts as 1). */
export function coverageFactor(coverage: number | undefined): number {
  return coverage === undefined ? 1 : clamp((coverage - 0.6) / 0.3, 0, 1);
}

/** How usable a single frame is as the first frame after a cut (0..1). */
export function frameQuality(s: ClipSample): number {
  return (
    clamp(s.structure / 0.18, 0, 1) *
    clamp(s.detail / 0.04, 0, 1) *
    clamp((s.balance - 0.15) / 0.45, 0, 1) *
    coverageFactor(s.coverage)
  );
}

export type WindowScore = {
  score: number;
  meanLuma: number;
  meanCorr: number;
  minCorr: number;
  meanMotion: number;
  structure: number;
  brightness: number;
  startQuality: number;
};

export function scoreWindow(samples: ClipSample[]): WindowScore {
  const n = samples.length;
  const mean = (k: 'luma' | 'detail' | 'structure' | 'balance') => samples.reduce((a, s) => a + s[k], 0) / n;
  const meanLuma = mean('luma');
  const structure = clamp(mean('structure') / 0.18, 0, 1) * clamp(mean('detail') / 0.04, 0, 1);
  const after = samples.slice(1);
  const corrs = after.length ? after.map((s) => s.corr) : [1];
  const meanCorr = corrs.reduce((a, c) => a + c, 0) / corrs.length;
  const minCorr = Math.min(...corrs);
  const meanMotion = after.length ? after.reduce((a, s) => a + s.motion, 0) / after.length : 0;
  const meanCoverage = samples.every((s) => s.coverage === undefined)
    ? undefined
    : samples.reduce((a, s) => a + (s.coverage ?? 1), 0) / n;
  const balance = clamp((mean('balance') - 0.25) / 0.45, 0, 1) * coverageFactor(meanCoverage);
  const corrected = meanLuma * 2 ** exposureBoostForLuma(meanLuma);
  const brightness = 1 - clamp(Math.abs(corrected - 0.6) / 0.3, 0, 1);
  const steadiness = clamp((meanCorr - 0.6) / 0.35, 0, 1);
  const energy =
    meanMotion >= 0.015 && meanMotion <= 0.09
      ? 1
      : meanMotion < 0.015
      ? 0.6
      : clamp(1 - (meanMotion - 0.09) / 0.08, 0, 1);
  const jumpPenalty = minCorr < 0.5 ? 0.3 : 0;
  const startQuality = Math.min(frameQuality(samples[0]), n > 1 ? frameQuality(samples[1]) : 1);
  const raw =
    0.3 * structure + 0.2 * brightness + 0.25 * steadiness + 0.15 * balance + 0.1 * energy - jumpPenalty;
  return {
    score: raw * (0.7 + 0.3 * startQuality),
    meanLuma,
    meanCorr,
    minCorr,
    meanMotion,
    structure,
    brightness,
    startQuality,
  };
}

export type BestWindowOptions = {
  windowSec?: number;
  sampleFps?: number;
  /** Skip the tap-to-record shake at the very start */
  minStartSec?: number;
  /** Skip the stop at the very end */
  tailSec?: number;
};

export function findBestWindow(
  samples: ClipSample[],
  options: BestWindowOptions = {}
): { window: ClipWindow; detail: WindowScore } {
  if (samples.length === 0) {
    throw new Error('findBestWindow needs at least one sample');
  }
  const fps = options.sampleFps ?? DEFAULT_SAMPLE_FPS;
  const windowSec = options.windowSec ?? DEFAULT_WINDOW_SEC;
  const w = Math.max(2, Math.round(windowSec * fps));
  const first = Math.ceil((options.minStartSec ?? 0.25) * fps - 1e-9);
  const tail = Math.round((options.tailSec ?? 0.2) * fps);
  let best: { i: number; s: WindowScore } | null = null;
  for (let i = first; i + w + tail <= samples.length; i++) {
    const s = scoreWindow(samples.slice(i, i + w));
    if (!best || s.score > best.s.score) best = { i, s };
  }
  if (!best) best = { i: 0, s: scoreWindow(samples) }; // clip shorter than the window
  const startSec = samples[best.i].t;
  const last = samples[Math.min(samples.length - 1, best.i + w - 1)];
  return {
    window: {
      startSec,
      endSec: last.t + 1 / fps,
      score: best.s.score,
      meanLuma: best.s.meanLuma,
      meanCorr: best.s.meanCorr,
      minCorr: best.s.minCorr,
      meanMotion: best.s.meanMotion,
    },
    detail: best.s,
  };
}

/** A shot may open on footage only when at least this share of the frame shows the room. */
export const OPENING_COVERAGE_MIN = 0.9;

/** The room is in view (not a wall, door edge or black frame). */
function isUsableFrame(s: ClipSample): boolean {
  return frameQuality(s) >= 0.3 && s.luma >= 0.1;
}

/**
 * Grows the best window into the whole run of usable footage around it: room
 * in view and steady from sample to sample, bridging a single blurry sample.
 * A 5 s shot can then play from where the room comes into view instead of
 * slowing down, or starting on the wall the clip opened on.
 */
export function findCleanRange(
  samples: ClipSample[],
  window: ClipWindow,
  durationSec: number,
  options: BestWindowOptions = {}
): ClipRange {
  const fps = options.sampleFps ?? DEFAULT_SAMPLE_FPS;
  const minStart = (options.minStartSec ?? 0.25) - 1e-6;
  const steady = (s: ClipSample) => s.corr >= 0.6;
  let lo = samples.findIndex((s) => s.t >= window.startSec - 1e-6);
  if (lo < 0) lo = 0;
  let hi = lo;
  while (hi + 1 < samples.length && samples[hi + 1].t < window.endSec - 1e-6) hi++;

  // Earlier footage joins when its frame is usable, shows the whole room (it may be the first
  // frame viewers see after the cut, so no door edge or pillar) and the step into the run is steady
  const showsRoom = (s: ClipSample) => (s.coverage ?? 1) >= OPENING_COVERAGE_MIN;
  const canPrepend = (j: number) =>
    j >= 0 && samples[j].t >= minStart && isUsableFrame(samples[j]) && showsRoom(samples[j]) && steady(samples[j + 1]);
  while (lo > 0) {
    if (canPrepend(lo - 1)) lo -= 1;
    else if (canPrepend(lo - 2) && steady(samples[lo - 1])) lo -= 2;
    else break;
  }
  const canAppend = (j: number) => j < samples.length && isUsableFrame(samples[j]) && steady(samples[j]);
  while (hi < samples.length - 1) {
    if (canAppend(hi + 1)) hi += 1;
    else if (canAppend(hi + 2)) hi += 2;
    else break;
  }
  const run = samples.slice(lo + 1, hi + 1);
  const meanMotion = run.length ? run.reduce((a, s) => a + s.motion, 0) / run.length : window.meanMotion ?? 0;
  return {
    startSec: Math.min(samples[lo].t, window.startSec),
    endSec: Math.min(durationSec, Math.max(samples[hi].t + 1 / fps, window.endSec)),
    meanMotion,
  };
}

/**
 * A featureless band (pillar, door edge, wall) that stays along one side of
 * the usable footage: its typical width (75th percentile, so a band that is
 * there most of the time counts). Null when there is none, or when both sides
 * have one (cropping one side would not help).
 */
export function sideBand(samples: ClipSample[], range: ClipRange): ClipAnalysis['reframe'] {
  const inRange = samples.filter((s) => s.t >= range.startSec - 1e-6 && s.t < range.endSec - 1e-6);
  if (inRange.length === 0 || inRange.every((s) => s.edgeLeft === undefined && s.edgeRight === undefined)) return null;
  const p75 = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
  };
  const left = p75(inRange.map((s) => s.edgeLeft ?? 0));
  const right = p75(inRange.map((s) => s.edgeRight ?? 0));
  const MIN_BAND = 0.05;
  if (left >= MIN_BAND && right >= MIN_BAND) return null;
  if (right >= MIN_BAND) return { side: 'right', band: Math.round(right * 1000) / 1000 };
  if (left >= MIN_BAND) return { side: 'left', band: Math.round(left * 1000) / 1000 };
  return null;
}

/** Fenn's shots: slow-moving, 3 to 5 seconds each */
export const FENN_SHOT_MIN_SEC = 3;
export const FENN_SHOT_MAX_SEC = 5;
/** Above this the steadiest window still jolts: ask for a slower retake (the host's 13 real clips measure 0.05-0.34) */
export const SHAKE_RETAKE = 0.45;
/** Mean frame-to-frame change above this reads as a fast sweep, not a slow move */
export const FAST_MOTION = 0.11;

/** 0 (smooth, even movement) .. 1: jolts between samples, and movement that speeds up and stops. */
export function shakeOf(samples: ClipSample[]): { shake: number; meanMotion: number } {
  const after = samples.slice(1);
  if (after.length === 0) return { shake: 0, meanMotion: 0 };
  const meanCorr = after.reduce((a, s) => a + s.corr, 0) / after.length;
  const meanMotion = after.reduce((a, s) => a + s.motion, 0) / after.length;
  const motionStd = Math.sqrt(after.reduce((a, s) => a + (s.motion - meanMotion) ** 2, 0) / after.length);
  const shake = 0.6 * (1 - clamp((meanCorr - 0.6) / 0.35, 0, 1)) + 0.4 * clamp(motionStd / 0.04, 0, 1);
  return { shake: Math.round(shake * 1000) / 1000, meanMotion };
}

/**
 * The steadiest stretch of `range`, up to maxSec long (the whole range when it
 * is shorter). A window that opens on a clear view of the room wins over one
 * that opens on a wall or door edge. Null only when the range holds under two samples.
 */
export function findSteadyWindow(
  samples: ClipSample[],
  range: ClipRange,
  options: { maxSec?: number; sampleFps?: number } = {}
): SteadyWindow | null {
  const fps = options.sampleFps ?? DEFAULT_SAMPLE_FPS;
  const inRange = samples.filter((s) => s.t >= range.startSec - 1e-6 && s.t + 1 / fps <= range.endSec + 1e-6);
  if (inRange.length < 2) return null;
  const w = Math.min(inRange.length, Math.max(2, Math.round((options.maxSec ?? FENN_SHOT_MAX_SEC) * fps)));
  const opensClear = (s: ClipSample) => isUsableFrame(s) && (s.coverage ?? 1) >= OPENING_COVERAGE_MIN;
  let best: { i: number; cost: number; shake: number; meanMotion: number } | null = null;
  for (let i = 0; i + w <= inRange.length; i++) {
    const m = shakeOf(inRange.slice(i, i + w));
    const cost = m.shake + (opensClear(inRange[i]) ? 0 : 1);
    if (!best || cost < best.cost - 1e-9) best = { i, cost, ...m };
  }
  if (!best) return null;
  return {
    startSec: inRange[best.i].t,
    endSec: inRange[best.i + w - 1].t + 1 / fps,
    shake: best.shake,
    meanMotion: best.meanMotion,
  };
}

export const WARNING_TIPS = {
  dark: 'This shot is too dark. Turn on every light and open the blinds, then retake it.',
  darkFixed: 'A little dark, so we brightened it for you.',
  shaky: 'Try that one slower. Feet planted, both hands on the phone, one slow move.',
  blank: 'This shot is mostly wall. Stand in the doorway facing into the room.',
  short: 'This clip is short, so we slowed it down a little to fit.',
} as const;

export function analyzeSamples(
  samples: ClipSample[],
  durationSec: number,
  options: BestWindowOptions = {}
): ClipAnalysis {
  const sampleFps = options.sampleFps ?? DEFAULT_SAMPLE_FPS;
  const { window, detail } = findBestWindow(samples, options);
  const exposureBoost = exposureBoostForLuma(window.meanLuma);
  const warnings: ClipAnalysis['warnings'] = [];
  if (window.meanLuma < 0.28) {
    warnings.push({ kind: 'dark', severity: 'retake', tip: WARNING_TIPS.dark });
  } else if (exposureBoost >= 0.2) {
    warnings.push({ kind: 'dark', severity: 'fixed', tip: WARNING_TIPS.darkFixed });
  }
  const clean = findCleanRange(samples, window, durationSec, options);
  const steady = findSteadyWindow(samples, clean, { sampleFps }) ?? undefined;
  const bestFrame = samples.reduce((a, s) => Math.max(a, frameQuality(s)), 0);
  if (bestFrame < 0.3) {
    // Nothing but wall: "shaky" would be misleading, there is simply nothing to track
    warnings.push({ kind: 'blank', severity: 'retake', tip: WARNING_TIPS.blank });
  } else if (
    window.minCorr < 0.45 ||
    window.meanCorr < 0.75 ||
    (steady && (steady.shake > SHAKE_RETAKE || steady.meanMotion > FAST_MOTION))
  ) {
    warnings.push({ kind: 'shaky', severity: 'retake', tip: WARNING_TIPS.shaky });
  }
  return {
    durationSec,
    sampleFps,
    best: window,
    clean,
    steady,
    reframe: sideBand(samples, clean),
    exposureBoost,
    quality: clamp(window.score, 0, 1),
    hookScore: window.score + 0.15 * detail.brightness,
    warnings,
  };
}
