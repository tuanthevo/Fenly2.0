/**
 * Turns the host's guided clips into a short-form edit plan.
 *
 * FULL TOUR (default, balanced pace, 5 guided 7 s shots, about 27 s;
 * snappy ~24 s, relaxed ~31 s)
 *   0.0 s   HOOK     best frame of the best shot, price + neighborhood headline.
 *                    On screen for its reading time (2.5-3.2 s), 1.0x speed.
 *   ~2.7 s  ANSWER   same shot keeps rolling; "1 bed · 1 bath", "220 sq ft" and
 *                    an amenity pop in (about 3 s).
 *   ~5.7 s  ROOMS    ~5 s per room: a 2x speed ramp through the whip / zoom
 *                    cut, then a speed matched to how fast the camera moves
 *                    (0.95-1.35x) so every room feels equally paced; the room
 *                    callout at 0.3 s and a second detail at ~2.3 s. A
 *                    "wait for…" re-hook lands near the middle of the video.
 *   ~20.7 s PERK     light-leak cut, 2x ramp into 0.85x slow motion, the perk
 *                    revealed big (about 3.4 s).
 *   ~24.1 s END      price question over the last shot (about 3.2 s), then the
 *                    first frame fades back in so the video loops.
 *
 * TEASER (~13-15 s): same structure without the answer beat or second callouts,
 * ~2.2 s rooms at 1.1-1.6x.
 *
 * Section lengths shrink to fit the clean footage a clip actually has (room in
 * view, steady camera, from the clip analysis), so a short clip never shows a
 * wall or freezes; only the closer may hold its last frame, under the end card.
 *
 * Why: 2026 data puts the best-performing tour length at roughly 20-35 s
 * (enough watch time for the algorithm, still high completion), viewers decide
 * in the first seconds, and most watch with the sound off, so text carries the
 * story and something new happens every ~2 s. Sources: docs/viral-playbook.md.
 *
 * Pure function, no DOM and no Remotion imports, so it is unit tested and can
 * run on the server too.
 */
import {
  buildSocialCaption,
  cleanTag,
  defaultHook,
  defaultTags,
  endCardCopy,
  heroFacts,
  hookFontSizeFor,
  listingFacts,
  hookFromText,
  placeLabel,
  priceLabel,
  rehookText,
  sanitizeHookText,
  specsLine,
  stripEmoji,
  violatesFairHousing,
} from './copy';
import { VIDEO } from './theme';
import type {
  BuildViralPlanInput,
  BuildViralPlanOptions,
  ClipRange,
  ClipWarning,
  HookCopy,
  ViralCallout,
  ViralClipInput,
  ViralCut,
  ViralCutKind,
  ViralEditPlan,
  ViralLength,
  ViralPace,
  ViralSfxCue,
  ViralShot,
  ViralShotRole,
  ViralStyleId,
} from './types';

export type LengthPreset = {
  label: string;
  /** Shown next to the label in the editor */
  approxLabel: string;
  /** Headline reading time: baseSec + perWordSec * words, kept inside min..max */
  hook: { baseSec: number; perWordSec: number; minSec: number; maxSec: number };
  /** The opener keeps rolling with listing facts after the headline (0 = no facts beat) */
  heroFactsSec: number;
  /** Per room, when the clip has enough clean footage */
  tourSec: number;
  /** Never cut a room shorter than this (unless the clip itself is shorter) */
  minTourSec: number;
  closerSec: number;
  endCardSec: number;
  /**
   * Room speed matched to camera movement: sqrt(targetMotion / measured), so a
   * slow shuffle gets sped up and a brisk walk stays near real time.
   */
  tourRate: { targetMotion: number; fallback: number; min: number; max: number };
  closerRate: number;
  /** Speed ramp into rooms and the closer: rate for (in-cut frames + extraFrames) */
  ramp: { rate: number; extraFrames: number } | null;
  /** Second callout on each room shot */
  details: boolean;
};

export const LENGTH_PRESETS: Record<ViralLength, LengthPreset> = {
  full: {
    label: 'Full tour',
    approxLabel: '~30s',
    hook: { baseSec: 1.2, perWordSec: 0.22, minSec: 2.5, maxSec: 3.2 },
    heroFactsSec: 3,
    tourSec: 5,
    minTourSec: 2.6,
    closerSec: 3.4,
    endCardSec: 3.2,
    tourRate: { targetMotion: 0.075, fallback: 1.12, min: 0.95, max: 1.35 },
    closerRate: 0.85,
    ramp: { rate: 2, extraFrames: 4 },
    details: true,
  },
  teaser: {
    label: 'Teaser',
    approxLabel: '~15s',
    hook: { baseSec: 1, perWordSec: 0.18, minSec: 2, maxSec: 2.6 },
    heroFactsSec: 0,
    tourSec: 2.2,
    minTourSec: 1.2,
    closerSec: 2.2,
    endCardSec: 2.2,
    tourRate: { targetMotion: 0.1, fallback: 1.35, min: 1.1, max: 1.6 },
    closerRate: 1,
    ramp: { rate: 2, extraFrames: 3 },
    details: false,
  },
};

/** Pace scales the section lengths (and nudges speed) on top of the length preset. */
export const PACE_PRESETS: Record<
  ViralPace,
  { label: string; scale: number; hookScale: number; rateScale: number; cutFrames: number; bridgeFrames: number }
> = {
  snappy: { label: 'Snappy', scale: 0.85, hookScale: 0.94, rateScale: 1.08, cutFrames: 6, bridgeFrames: 8 },
  balanced: { label: 'Balanced', scale: 1, hookScale: 1, rateScale: 1, cutFrames: 7, bridgeFrames: 9 },
  relaxed: { label: 'Relaxed', scale: 1.15, hookScale: 1.06, rateScale: 0.92, cutFrames: 8, bridgeFrames: 10 },
};

/** Speed limits. The hook plays in real time so its first frame and headline read cleanly. */
export const SPEED = { hero: 1, minHero: 0.8, minTour: 0.9, minCloser: 0.7, max: 1.6 } as const;

export const CUT_CYCLE: ViralCutKind[] = ['whip-left', 'zoom-through', 'whip-right'];
export const CLOSER_OVERLAY_FRAMES = 12;

/** Guided slots that usually make the best opener: bedroom, perk, kitchen. */
export const SLOT_HOOK_PRIOR: Record<number, number> = { 1: 0.1, 2: 0.06, 3: 0, 4: -0.05, 5: 0.08 };

/** The hook may start this much before its best frame to make room for the facts beat. */
export const MAX_HOOK_SHIFT_SEC = 1.5;
/** A facts beat shorter than this is dropped (the facts still appear on the end card). */
const MIN_FACTS_SEC = 1.2;
const MIN_HOOK_SEC = 1.8;
const MIN_CLOSER_SEC = 1.5;
const HERO_KEEP_RATE = 0.85;
const CLOSER_KEEP_RATE = 0.75;
/** A room may play up to 15% slower than its matched speed to fill its section */
const ROOM_KEEP_FACTOR = 0.85;
const SOURCE_TAIL_SEC = 0.05;
const MIN_START_SEC = 0.25;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const PRICE_IN_TEXT = /\$\s?\d/;

function hookScoreOf(clip: ViralClipInput): number {
  return (clip.analysis?.hookScore ?? 0.5) + (SLOT_HOOK_PRIOR[clip.slotNumber] ?? 0);
}

function byHookScore(a: ViralClipInput, b: ViralClipInput): number {
  return hookScoreOf(b) - hookScoreOf(a) || a.slotNumber - b.slotNumber;
}

/** Host choice, then AI choice, then the brightest, steadiest shot (bedroom on ties). */
export function pickHookSlot(clips: ViralClipInput[], options: BuildViralPlanOptions = {}): number {
  const slots = new Set(clips.map((c) => c.slotNumber));
  if (options.hookSlotNumber != null && slots.has(options.hookSlotNumber)) return options.hookSlotNumber;
  const ai = options.ai?.hookSlotNumber;
  if (ai != null && slots.has(ai)) return ai;
  return [...clips].sort(byHookScore)[0].slotNumber;
}

/**
 * Hook first, then the rooms in walk-through order, ending on the perk
 * (slot 5). If the perk opens the video, the strongest remaining shot closes.
 */
export function orderShots(clips: ViralClipInput[], hookSlot: number): ViralClipInput[] {
  const sorted = [...clips].sort((a, b) => a.slotNumber - b.slotNumber);
  const hook = sorted.find((c) => c.slotNumber === hookSlot) ?? sorted[0];
  const rest = sorted.filter((c) => c !== hook);
  if (rest.length === 0) return [hook];
  const closer = rest.find((c) => c.slotNumber === 5) ?? [...rest].sort(byHookScore)[0];
  return [hook, ...rest.filter((c) => c !== closer), closer];
}

/** Headline reading time: a beat to land, then about 4.5 words per second, within the preset's range. */
export function hookReadSec(text: string, length: ViralLength, pace: ViralPace): number {
  const h = LENGTH_PRESETS[length].hook;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp((h.baseSec + h.perWordSec * words) * PACE_PRESETS[pace].hookScale, h.minSec, h.maxSec * PACE_PRESETS[pace].hookScale);
}

type SourceInfo = { duration: number; preferred: number; clean: ClipRange; motion: number | null };

function sourceInfo(clip: ViralClipInput, aiWindow?: { startSec: number; endSec?: number }): SourceInfo {
  const duration = clip.durationSec > 0 ? clip.durationSec : clip.analysis?.durationSec ?? 4.5;
  const end = Math.max(0, duration - SOURCE_TAIL_SEC);
  const fallbackStart = duration >= 3 ? 0.6 : Math.min(0.2, end);
  const preferred = clamp(aiWindow?.startSec ?? clip.analysis?.best.startSec ?? fallbackStart, 0, end);
  const analysisClean = clip.analysis?.clean;
  let clean: ClipRange;
  if (aiWindow) {
    clean = { startSec: preferred, endSec: clamp(aiWindow.endSec ?? end, preferred, end) };
  } else if (analysisClean) {
    clean = {
      startSec: clamp(Math.min(analysisClean.startSec, preferred), 0, end),
      endSec: clamp(Math.max(analysisClean.endSec, clip.analysis!.best.endSec), preferred, end),
    };
  } else {
    clean = { startSec: Math.min(MIN_START_SEC, preferred), endSec: end };
  }
  const motion = analysisClean?.meanMotion ?? clip.analysis?.best.meanMotion ?? null;
  return { duration, preferred, clean, motion: motion && motion > 0 ? motion : null };
}

/** Room speed matched to camera movement (see LengthPreset.tourRate). */
export function motionMatchedRate(motion: number | null, length: ViralLength, pace: ViralPace): number {
  const r = LENGTH_PRESETS[length].tourRate;
  const base = motion ? Math.sqrt(r.targetMotion / motion) : r.fallback;
  return round3(clamp(base * PACE_PRESETS[pace].rateScale, r.min, r.max));
}

export type FitRequest = {
  role: ViralShotRole;
  /** Frames the shot occupies (for the closer this includes the end card) */
  durationInFrames: number;
  /** Frames that must play clean footage (the closer's end card may run past it or hold) */
  cleanFrames: number;
  fps: number;
  rate: number;
  keepRate: number;
  minRate: number;
  ramp: { frames: number; rate: number } | null;
};

export type FitResult = { srcStartSec: number; playbackRate: number; rampFrames: number; rampRate: number };

/**
 * Where to start inside the source clip, how fast to play and whether to ramp,
 * so the shot stays on clean footage. When footage is short, in order: end the
 * shot where the clean footage ends, slow down a little (down to keepRate)
 * keeping the speed ramp, then drop the ramp, then use footage outside the
 * clean range, then slow down to minRate; anything still missing holds the
 * last frame (only expected under the closer's end card).
 */
export function fitSource(clip: ViralClipInput, req: FitRequest, aiWindow?: { startSec: number; endSec?: number }): FitResult {
  const src = sourceInfo(clip, aiWindow);
  const { fps } = req;
  const end = Math.max(0, src.duration - SOURCE_TAIL_SEC);
  const frames = Math.max(1, Math.min(req.cleanFrames, req.durationInFrames));
  const ramp = req.ramp && req.ramp.frames > 0 ? { frames: Math.min(req.ramp.frames, frames - 1), rate: req.ramp.rate } : null;
  type Ramp = typeof ramp;
  const rampSrcFrames = (r: Ramp) => (r ? r.frames * r.rate : 0);
  const need = (rate: number, r: Ramp) => (rampSrcFrames(r) + (frames - (r ? r.frames : 0)) * rate) / fps;
  /** Fastest rate up to req.rate that fits `len` seconds of footage, or null below `floor`. */
  const rateFor = (len: number, r: Ramp, floor: number): number | null => {
    const rest = frames - (r ? r.frames : 0);
    if (rest <= 0) return null;
    const rate = Math.min(req.rate, (len * fps - rampSrcFrames(r)) / rest);
    return rate >= floor - 1e-9 ? rate : null;
  };
  // Earliest start: anywhere in the clean range, but the hook stays near its best frame
  const earliest =
    req.role === 'hook' ? Math.max(src.clean.startSec, src.preferred - MAX_HOOK_SHIFT_SEC) : src.clean.startSec;
  const place = (sec: number, limitEnd: number, from: number) =>
    src.preferred >= from && src.preferred + sec <= limitEnd + 1e-9 ? src.preferred : Math.max(from, limitEnd - sec);
  const done = (start: number, rate: number, r: Ramp): FitResult => ({
    // Snap to the frame grid (the tolerance absorbs float error such as 4.833 * 30 = 144.99)
    srcStartSec: Math.floor(Math.max(0, start) * fps + 0.01) / fps,
    playbackRate: round3(rate),
    rampFrames: r ? r.frames : 0,
    rampRate: r ? round3(r.rate) : round3(rate),
  });
  const keep = Math.min(req.keepRate, req.rate);

  // 1. Clean footage with the ramp, slowing to keepRate if needed; 2. the same without the ramp
  const cleanLen = src.clean.endSec - earliest;
  for (const r of ramp ? [ramp, null] : [null]) {
    const rate = rateFor(cleanLen, r, keep);
    if (rate != null) return done(place(need(rate, r), src.clean.endSec, earliest), rate, r);
  }
  // 3. Slow down further (to minRate) rather than show a wall
  const slowRate = rateFor(cleanLen, null, Math.min(req.minRate, req.rate));
  if (slowRate != null) return done(place(need(slowRate, null), src.clean.endSec, earliest), slowRate, null);
  // 4. Footage outside the clean range
  const from = Math.min(MIN_START_SEC, earliest);
  const wholeLen = end - from;
  const wholeRate = rateFor(wholeLen, null, keep);
  if (wholeRate != null) return done(place(need(wholeRate, null), end, from), wholeRate, null);
  // 5. Slow down to the floor; whatever is still missing holds the last frame
  const floorRate = Math.min(req.rate, Math.max(req.minRate, (wholeLen * fps) / frames));
  return done(Math.min(earliest, end - need(floorRate, null)), floorRate, null);
}

/** Seconds of clean footage a shot can use, from the earliest allowed start. */
function cleanSeconds(src: SourceInfo, role: ViralShotRole): number {
  const earliest = role === 'hook' ? Math.max(src.clean.startSec, src.preferred - MAX_HOOK_SHIFT_SEC) : src.clean.startSec;
  return Math.max(0, src.clean.endSec - earliest);
}

function resolveHook(style: ViralStyleId, input: BuildViralPlanInput, options: BuildViralPlanOptions): HookCopy {
  const fallback = defaultHook(style, input.listing);
  const hostText = sanitizeHookText(options.hookTextOverride);
  if (hostText) return hookFromText(hostText, input.listing, fallback.kicker);
  if (style === 'price-hook') {
    const aiText = sanitizeHookText(options.ai?.hookText);
    if (aiText && PRICE_IN_TEXT.test(aiText) && !violatesFairHousing(aiText)) {
      return hookFromText(aiText, input.listing, fallback.kicker);
    }
  }
  return fallback;
}

function aiTag(text: string | undefined): string {
  if (!text || violatesFairHousing(text)) return '';
  return cleanTag(text);
}

/** Snaps section boundaries to music beats when a BPM is known. */
function snapToBeats(seconds: number[], endCardSec: number, fps: number, bpm: number | null) {
  if (!bpm) {
    return { primary: seconds.map((s) => Math.round(s * fps)), endCard: Math.round(endCardSec * fps) };
  }
  const beat = (fps * 60) / bpm;
  const beats = seconds.map((s) => Math.max(2, Math.round((s * fps) / beat)));
  const endBeats = Math.max(3, Math.round((endCardSec * fps) / beat));
  const edges = [0];
  for (const b of [...beats, endBeats]) edges.push(edges[edges.length - 1] + b);
  const at = edges.map((e) => Math.round(e * beat));
  return {
    primary: seconds.map((_, i) => at[i + 1] - at[i]),
    endCard: at[at.length - 1] - at[at.length - 2],
  };
}

export function buildViralEditPlan(input: BuildViralPlanInput, options: BuildViralPlanOptions = {}): ViralEditPlan {
  const clips = input.clips.filter((c) => Boolean(c.src));
  if (clips.length === 0) throw new Error('buildViralEditPlan needs at least one clip');

  const fps = options.fps ?? VIDEO.fps;
  const style: ViralStyleId = options.style ?? 'price-hook';
  const pace: ViralPace = options.pace ?? 'balanced';
  const length: ViralLength = options.length ?? 'full';
  const enableEffects = options.enableEffects ?? true;
  const preset = PACE_PRESETS[pace];
  const lp = LENGTH_PRESETS[length];
  const bpm =
    options.music?.src && options.music.bpm && options.music.bpm >= 60 && options.music.bpm <= 200
      ? options.music.bpm
      : null;
  const listing = input.listing;

  const ordered = orderShots(clips, pickHookSlot(clips, options));
  const n = ordered.length;
  const roles: ViralShotRole[] = ordered.map((_, i) => (i === 0 ? 'hook' : i === n - 1 ? 'closer' : 'tour'));
  const sources = ordered.map((clip) => sourceInfo(clip, options.ai?.windows?.[clip.slotNumber]));

  // Cuts: whip / zoom transitions between rooms, a light-leak (or flash) hit into the closer
  const cutKinds: ViralCutKind[] = [];
  for (let i = 0; i < n - 1; i++) {
    cutKinds.push(i === n - 2 ? (enableEffects ? 'light-leak' : 'flash') : CUT_CYCLE[i % CUT_CYCLE.length]);
  }
  const isOverlay = (kind: ViralCutKind) => kind === 'flash' || kind === 'light-leak';
  const overlapOf = (kind: ViralCutKind) => (isOverlay(kind) ? 0 : preset.cutFrames);
  const inOverlapOf = (i: number) => (i > 0 ? overlapOf(cutKinds[i - 1]) : 0);
  const rampFor = (i: number) =>
    lp.ramp && roles[i] !== 'hook'
      ? { frames: Math.max(inOverlapOf(i), CLOSER_OVERLAY_FRAMES / 2) + lp.ramp.extraFrames, rate: lp.ramp.rate }
      : null;

  // Speeds: rooms matched to camera movement; the closer eases into slow motion.
  // keepRates: how far a shot may slow down to fill its section with clean footage.
  const rates = roles.map((role, i) =>
    role === 'hook' ? SPEED.hero : role === 'closer' ? lp.closerRate : motionMatchedRate(sources[i].motion, length, pace)
  );
  const keepRates = roles.map((role, i) =>
    role === 'hook'
      ? HERO_KEEP_RATE
      : role === 'closer'
      ? CLOSER_KEEP_RATE
      : round3(Math.min(rates[i], Math.max(lp.tourRate.min, rates[i] * ROOM_KEEP_FACTOR)))
  );

  // Section lengths: the preset's targets, shortened to the clean footage each clip has
  const hook = resolveHook(style, input, options);
  const hookTarget = hookReadSec(hook.text, length, pace);
  // Each shot also plays under the transition out of it, and frames round up: leave that footage spare
  const spareSec = (i: number) => (i < n - 1 ? overlapOf(cutKinds[i]) : 0) / fps + 1 / fps;
  const heroMax = cleanSeconds(sources[0], 'hook') / HERO_KEEP_RATE - spareSec(0);
  /** The most a clip can fill at the slowest allowed speed: section minimums never exceed it */
  const hardMax = (i: number, minRate: number) =>
    (sources[i].duration - SOURCE_TAIL_SEC - Math.min(MIN_START_SEC, sources[i].clean.startSec)) / minRate - spareSec(i);
  const hookSec = Math.min(hookTarget, Math.max(Math.min(MIN_HOOK_SEC, hardMax(0, SPEED.minHero)), heroMax));
  let factsSec = n > 0 ? clamp(heroMax - hookSec, 0, lp.heroFactsSec * preset.scale) : 0;
  if (factsSec < MIN_FACTS_SEC) factsSec = 0;
  const seconds = roles.map((role, i) => {
    if (role === 'hook') return hookSec + factsSec;
    const ramp = rampFor(i);
    if (role === 'closer') {
      // The reveal plays clean footage; only the end card after it may hold the last frame
      const rampExtra = ramp ? (ramp.frames * (ramp.rate - keepRates[i])) / fps : 0;
      const fit = (cleanSeconds(sources[i], 'closer') - rampExtra) / keepRates[i] - 1 / fps;
      const floor = Math.min(MIN_CLOSER_SEC * preset.scale, hardMax(i, SPEED.minCloser));
      return clamp(fit, floor, lp.closerSec * preset.scale);
    }
    // A room keeps its matched speed and gets shorter rather than crawl to fill time
    const rampExtra = ramp ? (ramp.frames * (ramp.rate - keepRates[i])) / fps : 0;
    const fit = (cleanSeconds(sources[i], 'tour') - rampExtra) / keepRates[i] - spareSec(i);
    const floor = Math.min(lp.minTourSec * preset.scale, hardMax(i, SPEED.minTour));
    return clamp(fit, floor, lp.tourSec * preset.scale);
  });
  const { primary, endCard: endCardFrames } = snapToBeats(seconds, lp.endCardSec * preset.scale, fps, bpm);

  // Callouts
  const tags = defaultTags(listing);
  const closerIdx = n - 1;
  const closerTag = (() => {
    if (n < 2) return '';
    const clip = ordered[closerIdx];
    const perkSlot = clip.slotNumber === 5;
    return (
      cleanTag(options.perkOverride ?? options.tagOverrides?.[clip.slotNumber]) ||
      aiTag(perkSlot ? options.ai?.perkLabel ?? options.ai?.tags?.[clip.slotNumber] : options.ai?.tags?.[clip.slotNumber]) ||
      tags[clip.slotNumber] ||
      cleanTag(clip.room)
    );
  })();
  const tourTags = ordered.map((clip, i) =>
    roles[i] === 'tour'
      ? cleanTag(options.tagOverrides?.[clip.slotNumber]) ||
        aiTag(options.ai?.tags?.[clip.slotNumber]) ||
        tags[clip.slotNumber] ||
        cleanTag(clip.room)
      : ''
  );
  const saidAlready = [closerTag, ...tourTags].filter(Boolean);
  const facts = factsSec > 0 ? heroFacts(listing, saidAlready) : [];
  const factQueue = lp.details ? listingFacts(listing, [...saidAlready, ...facts]) : [];

  const shots: ViralShot[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const clip = ordered[i];
    const role = roles[i];
    const inOverlap = inOverlapOf(i);
    const outOverlap = i < n - 1 ? overlapOf(cutKinds[i]) : 0;
    const isLast = i === n - 1;
    const durationInFrames = primary[i] + (isLast ? endCardFrames : outOverlap);
    const fit = fitSource(
      clip,
      {
        role,
        durationInFrames,
        cleanFrames: isLast ? primary[i] : durationInFrames,
        fps,
        rate: rates[i],
        keepRate: keepRates[i],
        minRate: role === 'hook' ? SPEED.minHero : role === 'closer' ? SPEED.minCloser : SPEED.minTour,
        ramp: rampFor(i),
      },
      options.ai?.windows?.[clip.slotNumber]
    );

    let tag = '';
    let kicker = '';
    if (role === 'closer') {
      tag = closerTag;
      kicker = clip.slotNumber === 5 ? 'THE BEST PART' : 'LAST STOP';
    } else if (role === 'tour') {
      tag = tourTags[i];
    }
    const tagInFrame = inOverlap + 3;
    const visibleEnd = durationInFrames - outOverlap - 1;

    const callouts: ViralCallout[] = [];
    if (role === 'hook' && facts.length > 0) {
      const from = Math.round(hookSec * fps) + 4;
      const rows = facts.length === 3 ? [-1, 0, 1] : facts.length === 2 ? [0, 1] : [0];
      facts.forEach((text, k) => callouts.push({ text, kind: 'fact', inFrame: from + 6 * k, outFrame: visibleEnd, row: rows[k] }));
    }
    if (role === 'tour' && lp.details) {
      const hostDetail = options.detailOverrides?.[clip.slotNumber];
      const aiDetail = aiTag(options.ai?.details?.[clip.slotNumber]);
      const detail =
        hostDetail !== undefined
          ? cleanTag(hostDetail)
            ? { text: cleanTag(hostDetail), kind: 'room' as const }
            : null
          : aiDetail && aiDetail.toLowerCase() !== tag.toLowerCase()
          ? { text: aiDetail, kind: 'room' as const }
          : factQueue.length > 0
          ? { text: factQueue.shift()!, kind: 'fact' as const }
          : null;
      const inFrame = tagInFrame + Math.max(Math.round(1.6 * fps), Math.round(0.42 * primary[i]));
      if (detail && inFrame < visibleEnd - Math.round(1.2 * fps)) {
        callouts.push({ ...detail, inFrame, outFrame: visibleEnd, row: 1 });
      }
    }

    shots.push({
      id: `shot-${clip.slotNumber}`,
      slotNumber: clip.slotNumber,
      room: clip.room,
      src: clip.src,
      role,
      srcStartSec: fit.srcStartSec,
      playbackRate: fit.playbackRate,
      durationInFrames,
      startFrame: cursor,
      inOverlapFrames: inOverlap,
      outOverlapFrames: outOverlap,
      exposure: clamp(clip.analysis?.exposureBoost ?? 0, -0.25, 0.6),
      tag,
      kicker,
      tagInFrame,
      callouts,
      rampFrames: fit.rampFrames,
      rampRate: fit.rampRate,
      isLandscape: Boolean(clip.isLandscape),
    });
    cursor += primary[i];
  }

  const cuts: ViralCut[] = cutKinds.map((kind, i) => ({
    kind,
    durationInFrames: isOverlay(kind) ? CLOSER_OVERLAY_FRAMES : preset.cutFrames,
    overlapFrames: overlapOf(kind),
    atFrame: shots[i + 1].startFrame,
  }));

  const last = shots[n - 1];
  const totalFrames = last.startFrame + last.durationInFrames;
  const endCardFrom = totalFrames - endCardFrames;
  const endCopy = endCardCopy(style, listing);

  // The headline leaves after its reading time when the opener carries a facts beat, else on the first cut
  const firstCut = cuts[0];
  const hookExitFrame = factsSec > 0 ? Math.round(hookSec * fps) : firstCut ? firstCut.atFrame : endCardFrom;
  const hookExitFrames = factsSec > 0 ? 10 : (firstCut?.overlapFrames || 8) + 4;
  const priceChipFromFrame =
    factsSec > 0
      ? hookExitFrame + hookExitFrames
      : firstCut
      ? firstCut.atFrame + firstCut.overlapFrames + 2
      : endCardFrom;

  // Re-hook ("wait for the best part") on the room nearest the middle of the video
  let rehook: ViralEditPlan['rehook'] = null;
  const tourIdx = shots.map((s, i) => (s.role === 'tour' ? i : -1)).filter((i) => i >= 0);
  if (n >= 4 && tourIdx.length > 0) {
    const target = (length === 'full' ? 0.45 : 0.5) * totalFrames;
    const k =
      length === 'full'
        ? tourIdx.reduce((a, b) => (Math.abs(shots[b].startFrame - target) < Math.abs(shots[a].startFrame - target) ? b : a))
        : Math.floor(n / 2);
    const shot = shots[k];
    const from = shot.startFrame + (length === 'full' ? shot.tagInFrame + Math.round(0.5 * fps) : shot.inOverlapFrames + 6);
    const room = primary[k] - (from - shot.startFrame) - 8;
    rehook = {
      text: rehookText(style, last.slotNumber === 5),
      fromFrame: from,
      durationInFrames: Math.min(Math.round(1.2 * fps), Math.max(12, room)),
    };
  }

  const sfx: ViralSfxCue[] = [];
  if (options.sfx ?? true) {
    cuts.forEach((cut, i) => {
      sfx.push(
        cut.overlapFrames > 0
          ? { kind: 'whoosh', atFrame: cut.atFrame - 2, volume: 0.5 }
          : { kind: 'whoosh', atFrame: cut.atFrame - 4, volume: 0.35 }
      );
      const next = shots[i + 1];
      if (next.role === 'tour' && next.tag) sfx.push({ kind: 'pop', atFrame: next.startFrame + next.tagInFrame, volume: 0.35 });
      if (next.role === 'closer') sfx.push({ kind: 'ding', atFrame: next.startFrame + next.tagInFrame, volume: 0.45 });
    });
    for (const shot of shots) {
      shot.callouts.forEach((c, k) =>
        sfx.push({ kind: 'pop', atFrame: shot.startFrame + c.inFrame, volume: shot.role === 'hook' && k > 0 ? 0.22 : 0.3 })
      );
    }
    sfx.push(
      style === 'guess-rent'
        ? { kind: 'ding', atFrame: endCardFrom + 6, volume: 0.55 }
        : { kind: 'pop', atFrame: endCardFrom + 4, volume: 0.35 }
    );
  }
  const cues = sfx
    .map((c) => ({ ...c, atFrame: clamp(Math.round(c.atFrame), 0, totalFrames - 1) }))
    .sort((a, b) => a.atFrame - b.atFrame);

  const warnings: ClipWarning[] = [];
  for (const clip of clips) {
    for (const w of clip.analysis?.warnings ?? []) warnings.push({ ...w, slotNumber: clip.slotNumber });
  }
  for (const w of options.ai?.warnings ?? []) {
    const tip = stripEmoji(w.tip || '');
    if (tip) warnings.push({ slotNumber: w.slotNumber, kind: 'ai', severity: 'retake', tip });
  }

  const highlights = [last.role === 'closer' ? last.tag : '', ...shots.filter((s) => s.role === 'tour').map((s) => s.tag)].filter(
    (t) => t && t !== 'The best part'
  );
  const aiCaption = (options.ai?.socialCaption || '').trim();
  const caption =
    aiCaption && aiCaption.length <= 2200 && !violatesFairHousing(aiCaption)
      ? aiCaption
      : buildSocialCaption(style, listing, highlights);

  const music = options.music?.src
    ? {
        src: options.music.src,
        volume: clamp(options.music.volume ?? 0.55, 0, 1),
        startSec: Math.max(0, options.music.startSec ?? 0),
        bpm,
      }
    : null;

  return {
    version: 2,
    fps,
    width: VIDEO.width,
    height: VIDEO.height,
    style,
    pace,
    length,
    hook,
    hookFontSize: hookFontSizeFor(hook.text),
    hookExitFrame,
    hookExitFrames,
    priceLabel: priceLabel(listing.monthlyRent),
    placeLabel: placeLabel(listing),
    specsLabel: specsLine(listing),
    hidePriceUntilEnd: style === 'guess-rent',
    priceChipFromFrame,
    rehook,
    endCard: { fromFrame: endCardFrom, durationInFrames: endCardFrames, ...endCopy },
    loopBridgeFrames: Math.max(4, Math.min(preset.bridgeFrames, endCardFrames - 8)),
    shots,
    cuts,
    sfx: cues,
    totalFrames,
    audio: {
      keepRoomSound: options.keepRoomSound ?? false,
      roomSoundVolume: 0.35,
      sfxEnabled: options.sfx ?? true,
      music,
    },
    showWatermark: options.showWatermark ?? false,
    enableEffects,
    caption,
    warnings,
  };
}

export function getPlanDurationInFrames(plan: ViralEditPlan): number {
  return plan.totalFrames;
}

/** Returns a list of problems (empty when the plan's timeline is self-consistent). */
export function checkPlan(plan: ViralEditPlan): string[] {
  const problems: string[] = [];
  const { shots, cuts } = plan;
  if (shots.length === 0) problems.push('no shots');
  if (cuts.length !== Math.max(0, shots.length - 1)) problems.push('cuts must sit between shots');
  shots.forEach((s, i) => {
    if (!Number.isInteger(s.durationInFrames) || s.durationInFrames < 1) problems.push(`shot ${i} duration`);
    if (s.srcStartSec < 0) problems.push(`shot ${i} starts before the clip`);
    if (s.playbackRate < 0.5 || s.playbackRate > 2) problems.push(`shot ${i} speed ${s.playbackRate}`);
    if (s.rampFrames < 0 || s.rampFrames >= s.durationInFrames) problems.push(`shot ${i} ramp length`);
    if (s.rampFrames > 0 && (s.rampRate < 0.5 || s.rampRate > 2.5)) problems.push(`shot ${i} ramp speed ${s.rampRate}`);
    for (const c of s.callouts) {
      if (c.inFrame < 0 || c.inFrame >= c.outFrame || c.outFrame >= s.durationInFrames) problems.push(`shot ${i} callout "${c.text}"`);
    }
    if (i > 0) {
      const prev = shots[i - 1];
      const cut = cuts[i - 1];
      if (s.startFrame !== prev.startFrame + prev.durationInFrames - cut.overlapFrames) {
        problems.push(`shot ${i} start frame`);
      }
      if (cut.overlapFrames >= Math.min(prev.durationInFrames, s.durationInFrames)) {
        problems.push(`cut ${i - 1} longer than its shots`);
      }
      if (s.inOverlapFrames !== cut.overlapFrames || prev.outOverlapFrames !== cut.overlapFrames) {
        problems.push(`cut ${i - 1} overlap bookkeeping`);
      }
    }
  });
  const last = shots[shots.length - 1];
  if (last && plan.totalFrames !== last.startFrame + last.durationInFrames) problems.push('total frames');
  if (plan.endCard.fromFrame + plan.endCard.durationInFrames !== plan.totalFrames) problems.push('end card');
  if (last && plan.endCard.fromFrame <= last.startFrame) problems.push('end card starts before the closer');
  if (plan.loopBridgeFrames > plan.endCard.durationInFrames) problems.push('loop bridge longer than end card');
  if (plan.hookExitFrame > plan.endCard.fromFrame) problems.push('hook leaves after the end card');
  for (const c of plan.sfx) {
    if (c.atFrame < 0 || c.atFrame >= plan.totalFrames) problems.push(`sfx at ${c.atFrame}`);
  }
  return problems;
}
