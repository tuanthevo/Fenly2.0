/**
 * Turns the host's guided clips into a short-form edit plan.
 *
 * FULL TOUR (default, balanced pace, 5 guided 7 s shots, about 34 s; long clips
 * add a second moment per room, up to 45 s. Rooms play at a calm speed matched
 * to the camera's movement, 0.85-1.15x, with no speed ramps.)
 *   0.0 s   HOOK     best frame of the best shot, price + neighborhood headline.
 *                    On screen for its reading time (2.5-3.2 s), 1.0x speed.
 *   ~2.7 s  ANSWER   same shot keeps rolling; "1 bed · 1 bath", "220 sq ft" and
 *                    an amenity pop in (about 3 s).
 *   ~5.7 s  ROOMS    ~7 s per room (two ~5.5 s moments for a long clip, joined
 *                    by a zoom cut); whips between rooms; a calm speed matched
 *                    to how fast the camera moves (0.85-1.15x), no ramps; the
 *                    room callout at 0.3 s and a second detail at ~2.3 s. A
 *                    "wait for…" re-hook lands near the middle of the video.
 *   PERK             light-leak cut, 0.85x slow motion, the perk revealed big.
 *   END              price question over the last shot (about 3.2 s), then the
 *                    first frame fades back in so the video loops.
 *
 * TEASER (~13-15 s): same structure without the answer beat or second callouts,
 * ~2.2 s rooms at 1.0-1.25x.
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
  PERK_FALLBACK_LABEL,
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
import { normalizeLook } from './look';
import type {
  BuildViralPlanInput,
  BuildViralPlanOptions,
  ClipAnalysis,
  ClipRange,
  ClipWarning,
  FrameNote,
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
    approxLabel: '30-45s',
    hook: { baseSec: 1.2, perWordSec: 0.22, minSec: 2.5, maxSec: 3.2 },
    heroFactsSec: 3,
    // Targets for a 30-45 s tour; each room still shrinks to its clean footage rather than crawl or show a wall
    tourSec: 7,
    minTourSec: 2.6,
    closerSec: 5,
    endCardSec: 3.5,
    // Calm: real time, or up to 1.15x for a very slow camera; no ramps (host feedback, Nov 2026).
    // Never below 1.0x: slowed phone footage repeats frames and stutters, so a short clip gets a shorter room instead.
    tourRate: { targetMotion: 0.05, fallback: 1, min: 1, max: 1.15 },
    // Real time: slow motion on phone footage repeats frames and looks choppy (host, Nov 2026)
    closerRate: 1,
    ramp: null,
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
    tourRate: { targetMotion: 0.07, fallback: 1.1, min: 1, max: 1.25 },
    closerRate: 1,
    ramp: null,
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
/** Never below real time anywhere: slowed 30 fps phone footage repeats frames and stutters (host feedback, Nov 2026). */
export const SPEED = { hero: 1, minHero: 1, minTour: 1, minCloser: 1, max: 1.6 } as const;

/** Room changes alternate whips; the zoom is kept for two moments of the same room. */
export const CUT_CYCLE: ViralCutKind[] = ['whip-left', 'whip-right'];
export const CLOSER_OVERLAY_FRAMES = 12;

/** Guided slots that usually make the best opener: bedroom, perk, kitchen. */
export const SLOT_HOOK_PRIOR: Record<number, number> = { 1: 0.1, 2: 0.06, 3: 0, 4: -0.05, 5: 0.08 };

/**
 * The hook may start this much before its best frame to make room for the facts beat. Keep it
 * small: frame 0 is the cover, and 2.5 s earlier the host's kitchen clip showed a cluttered
 * corner instead of the kitchen. When the beat does not fit, the facts still reach the end card.
 */
export const MAX_HOOK_SHIFT_SEC = 1.5;
/** ...and may slide this much later when that leaves its clip room for a second moment */
export const MAX_HOOK_LATER_SEC = 3;
/** A facts beat shorter than this is dropped (the facts still appear on the end card). */
const MIN_FACTS_SEC = 1.2;
const MIN_HOOK_SEC = 1.8;
const MIN_CLOSER_SEC = 1.5;
const HERO_KEEP_RATE = 1;
const CLOSER_KEEP_RATE = 1;
/** A room may play up to 15% slower than its matched speed to fill its section */
const ROOM_KEEP_FACTOR = 0.85;
const SOURCE_TAIL_SEC = 0.05;

/**
 * Long clips (full tour only) give a room a second moment from later in the
 * same clip, joined by a zoom cut, instead of throwing that footage away:
 * a tour room splits in two, the opener's room gets a tour moment after the
 * headline, and a closer that isn't the perk gets a moment before its reveal.
 */
export const MOMENT_SEC = 5.5;
/** Clean footage a room needs before it is split into two moments */
export const SPLIT_MIN_CLEAN_SEC = 10;
/** Clean footage left beside the opener's headline that's worth a moment of its own */
export const EXTRA_MIN_CLEAN_SEC = 4;
/** Footage skipped between two moments of one clip, so the cut reads as a cut */
const MOMENT_GAP_SEC = 0.5;
/** Extra moments are dropped, last first, until the tour fits this */
export const MAX_TOUR_TOTAL_SEC = 45;
/** On-screen text size for video tours (photo tours use PHOTO_TEXT_SCALE) */
export const VIDEO_TEXT_SCALE = 0.8;
const MIN_START_SEC = 0.25;
/**
 * Longest stretch with nothing new on screen (no cut, label, callout or punch-in).
 * Past ~3 s the retention curve drops; a gentle punch-in fills it without more text.
 */
export const QUIET_MAX_SEC = 3.2;
/** How far a punch-in zooms, and how long it takes */
export const PUNCH_SCALE = 1.06;
export const PUNCH_FRAMES = 10;
/** Shots already zoomed this far to crop a wall get no punch-in (more looks soft) */
const PUNCH_MAX_REFRAME = 1.15;
const MAX_PUNCHES = 2;
/**
 * Without clip analysis, the opener starts this far into a long clip: phone clips
 * open on the record tap (floor, feet). Capped so short guided clips still fit.
 */
const NO_ANALYSIS_START_SHARE = 0.25;
const NO_ANALYSIS_START_MAX_SEC = 2;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const PRICE_IN_TEXT = /\$\s?\d/;
/** The proven price-hook shape: "What $X/mo gets you in {place}" */
const PRICE_HOOK_SHAPE = /^what\s+\$\s?[\d,]+(\/mo)?\s+gets\s+you\s+in\s+\S/i;

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

/** Extra reading time for each number in a headline ("$1,450/mo", "220 sq ft"): numbers are read slower than words. */
export const NUMBER_READ_SEC = 0.3;

/**
 * The audit's reading-time rule for any on-screen text:
 * max(0.8 s, 1.2 s + 0.22 s × words) + 0.3 s per number. Separators like "·" don't count.
 */
export function readSecFor(text: string): number {
  const tokens = text.trim().split(/\s+/).filter((t) => /[\p{L}\d]/u.test(t));
  if (tokens.length === 0) return 0;
  const numbers = tokens.filter((t) => /\d/.test(t)).length;
  return Math.max(0.8, 1.2 + 0.22 * tokens.length) + NUMBER_READ_SEC * numbers;
}

/**
 * Headline reading time: a beat to land, about 4.5 words per second, plus a
 * little more for each number, within the preset's range.
 */
export function hookReadSec(text: string, length: ViralLength, pace: ViralPace): number {
  const h = LENGTH_PRESETS[length].hook;
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const numbers = tokens.filter((t) => /\d/.test(t)).length;
  const raw = h.baseSec + h.perWordSec * tokens.length + NUMBER_READ_SEC * numbers;
  return clamp(raw * PACE_PRESETS[pace].hookScale, h.minSec, h.maxSec * PACE_PRESETS[pace].hookScale);
}

/** Smallest side band worth cropping, and the most we zoom to crop it (more looks soft on phone footage). */
export const REFRAME_MIN_BAND = 0.08;
export const REFRAME_MAX_SCALE = 1.25;

/**
 * Turns a side band from the clip analysis (a pillar or door edge that stays
 * in view) into a zoom anchored on the other side, so the band is cropped off.
 */
export function reframeFor(reframe: ClipAnalysis['reframe']): ViralShot['reframe'] {
  if (!reframe || !(reframe.band >= REFRAME_MIN_BAND)) return { scale: 1, originX: 50 };
  const scale = Math.min(REFRAME_MAX_SCALE, 1 / (1 - Math.min(reframe.band, 0.5)));
  return { scale: Math.round(scale * 1000) / 1000, originX: reframe.side === 'right' ? 0 : 100 };
}

type SourceInfo = { duration: number; preferred: number; clean: ClipRange; motion: number | null; hard: boolean };

function sourceInfo(clip: ViralClipInput, aiWindow?: { startSec: number; endSec?: number }): SourceInfo {
  const duration = clip.durationSec > 0 ? clip.durationSec : clip.analysis?.durationSec ?? 4.5;
  const end = Math.max(0, duration - SOURCE_TAIL_SEC);
  const fallbackStart =
    duration >= 3 ? clamp(duration * NO_ANALYSIS_START_SHARE, 0.6, NO_ANALYSIS_START_MAX_SEC) : Math.min(0.2, end);
  const analysisClean = clip.analysis?.clean;
  const hard = Boolean(analysisClean?.hard);
  const lo = hard ? analysisClean!.startSec : 0;
  const hi = hard ? Math.min(end, analysisClean!.endSec) : end;
  const preferred = clamp(aiWindow?.startSec ?? clip.analysis?.best.startSec ?? fallbackStart, lo, hi);
  let clean: ClipRange;
  if (aiWindow) {
    clean = { startSec: preferred, endSec: clamp(aiWindow.endSec ?? end, preferred, hi) };
  } else if (hard) {
    clean = { startSec: lo, endSec: hi };
  } else if (analysisClean) {
    clean = {
      startSec: clamp(Math.min(analysisClean.startSec, preferred), 0, end),
      endSec: clamp(Math.max(analysisClean.endSec, clip.analysis!.best.endSec), preferred, end),
    };
  } else {
    clean = { startSec: Math.min(MIN_START_SEC, preferred), endSec: end };
  }
  const motion = analysisClean?.meanMotion ?? clip.analysis?.best.meanMotion ?? null;
  return { duration, preferred, clean, motion: motion && motion > 0 ? motion : null, hard };
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
  // 4. Footage outside the clean range (never when a person is in it)
  const from = src.hard ? earliest : Math.min(MIN_START_SEC, earliest);
  const until = src.hard ? src.clean.endSec : end;
  const wholeLen = until - from;
  const wholeRate = src.hard ? null : rateFor(wholeLen, null, keep);
  if (wholeRate != null) return done(place(need(wholeRate, null), end, from), wholeRate, null);
  // 5. Slow down to the floor; whatever is still missing holds the last frame
  const floorRate = Math.min(req.rate, Math.max(req.minRate, (wholeLen * fps) / frames));
  return done(Math.max(src.hard ? from : 0, Math.min(earliest, until - need(floorRate, null))), floorRate, null);
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
    // One recognizable format across every listing: the AI may only reword the place
    if (aiText && PRICE_IN_TEXT.test(aiText) && PRICE_HOOK_SHAPE.test(aiText) && !violatesFairHousing(aiText)) {
      return hookFromText(aiText, input.listing, fallback.kicker);
    }
  }
  return fallback;
}

function aiTag(text: string | undefined): string {
  if (!text || violatesFairHousing(text)) return '';
  return cleanTag(text);
}

/**
 * A label names a scanned frame at most this far (source seconds) from the moment
 * it's read, about one scan step: further away, the thing isn't in view yet.
 */
export const LABEL_MAX_GAP_SEC = 1.3;

/** A shot never opens within this window around a blocked scan frame: [t - after, t + before] */
export const BLOCKED_BEFORE_SEC = 1;
export const BLOCKED_AFTER_SEC = 0.8;

/**
 * Moves a shot's start off a blocked view (doorway, door edge, something in the
 * foreground) when its footage can slide inside the clean range: later first,
 * else earlier. `needSec` is the source footage the shot plays.
 */
export function clearStartSec(startSec: number, needSec: number, clean: ClipRange, notes: FrameNote[] | null): number {
  const blocks = (notes ?? []).filter((n) => n.blocked).map((n) => n.t);
  if (blocks.length === 0) return startSec;
  const hit = (t: number) => blocks.find((b) => b >= t - BLOCKED_AFTER_SEC && b <= t + BLOCKED_BEFORE_SEC);
  // Inside the clean range, and never running further past its end than the shot already did
  const fits = (t: number) => t >= clean.startSec - 1e-6 && t + needSec <= Math.max(clean.endSec, startSec + needSec) + 1e-6;
  if (hit(startSec) === undefined) return startSec;
  // Later: step past each blocked frame in turn
  let t = startSec;
  for (let k = 0; k < blocks.length && hit(t) !== undefined; k++) t = hit(t)! + BLOCKED_AFTER_SEC + 0.05;
  if (hit(t) === undefined && fits(t)) return t;
  // Earlier: open before the first blocked frame
  t = startSec;
  for (let k = 0; k < blocks.length && hit(t) !== undefined; k++) t = hit(t)! - BLOCKED_BEFORE_SEC - 0.05;
  if (hit(t) === undefined && fits(t)) return t;
  return startSec;
}

/**
 * Drops the blocked views a clip opens on (still in the doorway, a door edge in
 * frame): its usable footage starts just past the last of them, so the room is
 * shorter rather than opening on a doorway. Kept when under 2 s would be left.
 */
export function withClearOpening(clip: ViralClipInput, notes: FrameNote[] | null): ViralClipInput {
  const a = clip.analysis;
  if (!a || !notes?.some((n) => n.blocked)) return clip;
  const duration = clip.durationSec > 0 ? clip.durationSec : a.durationSec;
  const clean = a.clean ?? { startSec: 0, endSec: duration };
  const end = Math.max(clean.endSec, a.best.endSec);
  let start = clean.startSec;
  for (const n of [...notes].sort((x, y) => x.t - y.t)) {
    if (n.t < start - BLOCKED_AFTER_SEC) continue;
    if (n.t > start + BLOCKED_BEFORE_SEC) break;
    if (n.blocked) start = n.t + BLOCKED_AFTER_SEC + 0.05;
  }
  // Only the doorway the clip opens on: a longer blocked stretch (a chair in front of the
  // kitchen) is still usable mid-shot, and each shot's own start steps off it (clearStartSec)
  start = Math.min(start, clean.startSec + OPENING_TRIM_MAX_SEC);
  if (start <= clean.startSec || end - start < MIN_PERSON_FREE_SEC) return clip;
  const len = a.best.endSec - a.best.startSec;
  const bestStart = clamp(a.best.startSec, start, Math.max(start, end - len));
  return {
    ...clip,
    analysis: { ...a, best: { ...a.best, startSec: bestStart, endSec: bestStart + len }, clean: { ...clean, startSec: start } },
  };
}

/** The most a clip's opening loses to blocked frames (about one scan step past the doorway) */
export const OPENING_TRIM_MAX_SEC = 2.5;

/** The re-hook goes on a room on screen at least this long (label first, then the re-hook) */
export const REHOOK_MIN_ROOM_SEC = 3;
/** Footage this far either side of a scanned frame with a person in it is skipped (about half a scan step) */
export const PERSON_PAD_SEC = 0.7;
/** A clip with less person-free footage than this is left out of the tour */
export const MIN_PERSON_FREE_SEC = 2;

/**
 * Narrows a clip's usable footage to its longest stretch with no person in it
 * (from the frame notes), marked hard so nothing outside it plays. Returns null
 * when too little is left to show the room.
 */
export function withoutPeople(clip: ViralClipInput, notes: FrameNote[] | null): ViralClipInput | null {
  const people = (notes ?? []).filter((n) => n.person).map((n) => n.t);
  if (people.length === 0 || !clip.analysis) return clip;
  const a = clip.analysis;
  const duration = clip.durationSec > 0 ? clip.durationSec : a.durationSec;
  const lo = a.clean?.startSec ?? 0;
  const hi = Math.min(duration - SOURCE_TAIL_SEC, a.clean ? Math.max(a.clean.endSec, a.best.endSec) : duration);
  const blocked = people.map((t): [number, number] => [t - PERSON_PAD_SEC, t + PERSON_PAD_SEC]).sort((x, y) => x[0] - y[0]);
  let best: [number, number] | null = null;
  let from = lo;
  for (const [b0, b1] of [...blocked, [hi, hi] as [number, number]]) {
    const to = Math.min(b0, hi);
    if (to - from > (best ? best[1] - best[0] : 0)) best = [from, to];
    from = Math.max(from, b1);
  }
  if (!best || best[1] - best[0] < MIN_PERSON_FREE_SEC) return null;
  const [s, e] = best;
  const len = a.best.endSec - a.best.startSec;
  const bestStart = clamp(a.best.startSec, s, Math.max(s, e - len));
  return {
    ...clip,
    analysis: {
      ...a,
      best: { ...a.best, startSec: bestStart, endSec: Math.min(e, bestStart + len) },
      clean: { startSec: s, endSec: e, meanMotion: a.clean?.meanMotion, hard: true },
    },
  };
}

/** Frame notes for a slot (what Gemini saw across the clip), or null when it wasn't scanned. */
function frameNotes(options: BuildViralPlanOptions, slotNumber: number): FrameNote[] | null {
  const notes = options.ai?.frames?.[slotNumber];
  return notes && notes.length > 0 ? notes : null;
}

/**
 * The label of the scanned frame nearest `atSec` inside [fromSec, toSec] (source
 * seconds), so a callout only names something that's in view on its footage.
 * Labels in `skip` (already said on this shot) are passed over.
 */
export function labelInView(
  notes: FrameNote[],
  fromSec: number,
  toSec: number,
  atSec: number,
  skip: string[] = [],
  maxGapSec = LABEL_MAX_GAP_SEC
): string {
  const said = new Set(skip.map((s) => s.toLowerCase()));
  let best = '';
  let bestDist = Infinity;
  for (const n of notes) {
    if (n.t < fromSec || n.t > toSec || n.person || Math.abs(n.t - atSec) > maxGapSec) continue;
    const label = aiTag(n.label);
    if (!label || said.has(label.toLowerCase())) continue;
    const d = Math.abs(n.t - atSec);
    if (d < bestDist) {
      best = label;
      bestDist = d;
    }
  }
  return best;
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

type Window = { startSec: number; endSec: number };
type Segment = { clip: ViralClipInput; role: ViralShotRole; part: 1 | 2; window?: Window };

/** One segment per clip, plus a second moment for clips with long clean footage (see MOMENT_SEC). */
function planSegments(
  ordered: ViralClipInput[],
  length: ViralLength,
  hookUseSec: number,
  options: BuildViralPlanOptions,
  maxExtras: number
): { segs: Segment[]; extras: number } {
  const n = ordered.length;
  const segs: Segment[] = [];
  let extras = 0;
  const allow = () => length === 'full' && n > 1 && extras < maxExtras;
  const halves = (src: SourceInfo): [Window, Window] => {
    const { startSec: s, endSec: e } = src.clean;
    const mid = (s + e) / 2;
    const aStart = src.preferred >= s && src.preferred <= mid - 3 ? src.preferred : s;
    return [
      { startSec: aStart, endSec: mid - MOMENT_GAP_SEC / 2 },
      { startSec: mid + MOMENT_GAP_SEC / 2, endSec: e },
    ];
  };
  ordered.forEach((clip, i) => {
    const role: ViralShotRole = i === 0 ? 'hook' : i === n - 1 ? 'closer' : 'tour';
    const src = sourceInfo(clip, options.ai?.windows?.[clip.slotNumber]);
    const { startSec: s, endSec: e } = src.clean;
    if (role === 'hook') {
      const earliest = Math.max(s, src.preferred - MAX_HOOK_SHIFT_SEC);
      let hs = src.preferred + hookUseSec <= e ? src.preferred : Math.max(earliest, e - hookUseSec);
      // A long clip whose best frame splits it badly: the opener slides a little later so the
      // footage before it is long enough for a tour moment of its own
      const sideMax = (h: number) => Math.max(e - (h + hookUseSec + MOMENT_GAP_SEC), h - MOMENT_GAP_SEC - s);
      const later = s + EXTRA_MIN_CLEAN_SEC + MOMENT_GAP_SEC;
      if (allow() && sideMax(hs) < EXTRA_MIN_CLEAN_SEC && later > hs && later - hs <= MAX_HOOK_LATER_SEC && later + hookUseSec <= e) hs = later;
      const he = Math.min(e, hs + hookUseSec);
      const after = { startSec: he + MOMENT_GAP_SEC, endSec: e };
      const before = { startSec: s, endSec: hs - MOMENT_GAP_SEC };
      const side = after.endSec - after.startSec >= before.endSec - before.startSec ? after : before;
      if (allow() && side.endSec - side.startSec >= EXTRA_MIN_CLEAN_SEC) {
        extras++;
        segs.push({ clip, role, part: 1, window: { startSec: hs, endSec: he } });
        segs.push({ clip, role: 'tour', part: 2, window: side });
      } else {
        segs.push({ clip, role, part: 1 });
      }
      return;
    }
    const splittable = role === 'tour' || (role === 'closer' && clip.slotNumber !== 5);
    if (splittable && allow() && e - s >= SPLIT_MIN_CLEAN_SEC) {
      extras++;
      const [a, b] = halves(src);
      segs.push({ clip, role: 'tour', part: 1, window: a });
      segs.push({ clip, role, part: 2, window: b });
      return;
    }
    segs.push({ clip, role, part: 1 });
  });
  return { segs, extras };
}

/** The room's second callout (the one hosts edit as "detail"), wherever the plan placed it. */
export function roomDetail(plan: Pick<ViralEditPlan, 'shots'>, slotNumber: number): string {
  const shots = plan.shots.filter((s) => s.slotNumber === slotNumber && s.role !== 'hook');
  const seen = shots.flatMap((s) => s.callouts).find((c) => c.kind === 'room');
  if (seen) return seen.text;
  const untagged = shots.find((s) => s.role === 'tour' && !s.tag && s.callouts.length > 0);
  return (untagged?.callouts[0] ?? shots.flatMap((s) => s.callouts).find((c) => c.row === 1))?.text ?? '';
}

/** The shots the editor lists: the opener, then one row per room (the moment that carries the room's label). */
export function editableShots(plan: Pick<ViralEditPlan, 'shots'>): ViralShot[] {
  return plan.shots.filter((s, i) => {
    if (s.role === 'hook') return true;
    const same = plan.shots.filter((p) => p.slotNumber === s.slotNumber && p.role !== 'hook');
    const pick = same.find((p) => p.tag) ?? same[0];
    return pick === s && plan.shots.indexOf(pick) === i;
  });
}

export function buildViralEditPlan(input: BuildViralPlanInput, options: BuildViralPlanOptions = {}): ViralEditPlan {
  let plan = buildPlanWith(input, options, Infinity);
  // Too long: drop extra moments, last first
  for (let extras = plan.shots.filter((s) => s.part === 2).length - 1; extras >= 0 && plan.totalFrames / plan.fps > MAX_TOUR_TOTAL_SEC; extras--) {
    plan = buildPlanWith(input, options, extras);
  }
  return plan;
}

function buildPlanWith(input: BuildViralPlanInput, options: BuildViralPlanOptions, maxExtras: number): ViralEditPlan {
  const given = input.clips.filter((c) => Boolean(c.src));
  if (given.length === 0) throw new Error('buildViralEditPlan needs at least one clip');
  // Skip footage with a person in it; a clip that's people throughout is left out (if others remain)
  const kept = given
    .map((c) => withoutPeople(c, frameNotes(options, c.slotNumber)))
    .filter((c): c is ViralClipInput => c !== null)
    .map((c) => withClearOpening(c, frameNotes(options, c.slotNumber)));
  const clips = kept.length > 0 ? kept : given;

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

  const hook = resolveHook(style, input, options);
  const hookTarget = hookReadSec(hook.text, length, pace);
  const orderedClips = orderShots(clips, pickHookSlot(clips, options));
  // Footage the opener uses (headline + facts beat + the cut out of it), so a second moment never repeats it
  const hookUseSec = hookTarget + lp.heroFactsSec * preset.scale + 0.5;
  const { segs } = planSegments(orderedClips, length, hookUseSec, options, maxExtras);
  const ordered = segs.map((sg) => sg.clip);
  const n = segs.length;
  const roles: ViralShotRole[] = segs.map((sg) => sg.role);
  const windowOf = (i: number) => segs[i].window ?? options.ai?.windows?.[segs[i].clip.slotNumber];
  const sources = segs.map((_, i) => sourceInfo(ordered[i], windowOf(i)));
  const isSplit = (i: number) => segs.some((sg, k) => k !== i && sg.clip === segs[i].clip && sg.role !== 'hook') && roles[i] !== 'hook';

  // Cuts: whip / zoom transitions between rooms, a zoom between two moments of one room, a light-leak (or flash) hit into the closer
  const cutKinds: ViralCutKind[] = [];
  let roomCuts = 0;
  for (let i = 0; i < n - 1; i++) {
    cutKinds.push(
      i === n - 2
        ? enableEffects
          ? 'light-leak'
          : 'flash'
        : segs[i + 1].clip === segs[i].clip
        ? 'zoom-through'
        : CUT_CYCLE[roomCuts++ % CUT_CYCLE.length]
    );
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
  // Each shot also plays under the transition out of it, and frames round up: leave that footage spare
  const spareSec = (i: number) => (i < n - 1 ? overlapOf(cutKinds[i]) : 0) / fps + 1 / fps;
  const heroMax = cleanSeconds(sources[0], 'hook') / HERO_KEEP_RATE - spareSec(0);
  /** The most a clip can fill at the slowest allowed speed: section minimums never exceed it */
  const hardMax = (i: number, minRate: number) =>
    (sources[i].hard
      ? sources[i].clean.endSec - sources[i].clean.startSec
      : sources[i].duration - SOURCE_TAIL_SEC - Math.min(MIN_START_SEC, sources[i].clean.startSec)) /
      minRate -
    spareSec(i);
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
    return clamp(fit, floor, (isSplit(i) ? MOMENT_SEC : lp.tourSec) * preset.scale);
  });
  const { primary, endCard: endCardFrames } = snapToBeats(seconds, lp.endCardSec * preset.scale, fps, bpm);

  // Where each shot plays inside its clip
  const outOverlapOf = (i: number) => (i < n - 1 ? overlapOf(cutKinds[i]) : 0);
  const durationOf = (i: number) => primary[i] + (i === n - 1 ? endCardFrames : outOverlapOf(i));
  const fits = segs.map((_, i) =>
    fitSource(
      ordered[i],
      {
        role: roles[i],
        durationInFrames: durationOf(i),
        // The closer's end card plays on past the clean footage, unless a person is waiting there
        cleanFrames: i === n - 1 && !sources[i].hard ? primary[i] : durationOf(i),
        fps,
        rate: rates[i],
        keepRate: keepRates[i],
        minRate: roles[i] === 'hook' ? SPEED.minHero : roles[i] === 'closer' ? SPEED.minCloser : SPEED.minTour,
        ramp: rampFor(i),
      },
      windowOf(i)
    )
  );
  // Open every shot on a clear view (scan frames flag doorways and things in the foreground)
  fits.forEach((fit, i) => {
    const notes = frameNotes(options, ordered[i].slotNumber);
    // A room's second moment continues it after a zoom cut: only first moments need a clear opening
    if (!notes || segs[i].part === 2) return;
    const needSec = (durationOf(i) / fps) * fit.playbackRate;
    // The opener may move back into earlier clean footage unless its room's other moment plays there
    let bounds = sources[i].clean;
    if (roles[i] === 'hook') {
      const whole = sourceInfo(ordered[i], options.ai?.windows?.[ordered[i].slotNumber]).clean;
      const before = segs.filter((sg, k) => k !== i && sg.clip === segs[i].clip && sg.window && sg.window.endSec <= bounds.startSec + 1e-6);
      const from = before.length > 0 ? Math.max(...before.map((sg) => sg.window!.endSec)) + MOMENT_GAP_SEC : whole.startSec;
      bounds = { ...bounds, startSec: Math.min(bounds.startSec, Math.max(from, bounds.startSec - MAX_HOOK_SHIFT_SEC)) };
    }
    const start = clearStartSec(fit.srcStartSec, Math.min(needSec, (primary[i] / fps) * fit.playbackRate), bounds, notes);
    fit.srcStartSec = Math.floor(start * fps + 0.01) / fps;
  });
  /** Source second shown at a local frame of shot i (ramps are off, so the rate is constant) */
  const srcAt = (i: number, localFrame: number) => fits[i].srcStartSec + (localFrame / fps) * fits[i].playbackRate;
  /** Source seconds shot i shows before it starts to leave */
  const visibleSpan = (i: number): [number, number] => [fits[i].srcStartSec, srcAt(i, primary[i])];
  /** A label is read about a second after it pops in: name what's in view then */
  const READ_AT_SEC = 1;

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
  const unlabeled = (i: number) =>
    roles[i] === 'tour' &&
    ((i > 0 && segs[i - 1].clip === segs[i].clip && roles[i - 1] === 'tour') || (i < n - 1 && segs[i + 1].clip === segs[i].clip && roles[i + 1] === 'closer'));
  // A light leak or flash into the closer sits on top of the footage (and its text) for half its length
  // after the cut: the reveal waits until it has passed, or the flash washes out the payoff
  const tagInFrameOf = (i: number) =>
    i > 0 && isOverlay(cutKinds[i - 1]) ? Math.ceil(CLOSER_OVERLAY_FRAMES / 2) + 3 : inOverlapOf(i) + 3;
  const tourTags = ordered.map((clip, i) => {
    if (roles[i] !== 'tour' || unlabeled(i)) return '';
    const host = cleanTag(options.tagOverrides?.[clip.slotNumber]);
    if (host) return host;
    // Scanned clip: name what's in view on this footage (nothing rather than something that isn't)
    const notes = frameNotes(options, clip.slotNumber);
    if (notes) {
      const [from, to] = visibleSpan(i);
      return labelInView(notes, from, to, srcAt(i, tagInFrameOf(i) + READ_AT_SEC * fps));
    }
    return aiTag(options.ai?.tags?.[clip.slotNumber]) || tags[clip.slotNumber] || cleanTag(clip.room);
  });
  const saidAlready = [closerTag, ...tourTags].filter(Boolean);
  const facts = factsSec > 0 ? heroFacts(listing, saidAlready) : [];
  const factQueue = lp.details ? listingFacts(listing, [...saidAlready, ...facts]) : [];

  /** Host or AI detail for a room (things you can see), or null */
  const detailFor = (clip: ViralClipInput, i: number): { text: string; kind: 'room' } | null => {
    const hostDetail = options.detailOverrides?.[clip.slotNumber];
    if (hostDetail !== undefined) return cleanTag(hostDetail) ? { text: cleanTag(hostDetail), kind: 'room' } : null;
    const aiDetail = aiTag(options.ai?.details?.[clip.slotNumber]);
    const roomTag = tourTags[i] || tourTags.find((t, k) => t && segs[k].clip === clip) || '';
    return aiDetail && aiDetail.toLowerCase() !== roomTag.toLowerCase() ? { text: aiDetail, kind: 'room' } : null;
  };
  // A tour room split in two (labeled moment, then unlabeled one): which moment holds the analysis' best frame
  const detailMomentOf = new Map<ViralClipInput, number>();
  segs.forEach((sg, b) => {
    if (b === 0 || roles[b] !== 'tour' || !unlabeled(b) || segs[b - 1].clip !== sg.clip || roles[b - 1] !== 'tour') return;
    const best = sourceInfo(sg.clip, options.ai?.windows?.[sg.clip.slotNumber]).preferred;
    detailMomentOf.set(sg.clip, sg.window && best < sg.window.startSec ? b - 1 : b);
  });

  const shots: ViralShot[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const clip = ordered[i];
    const role = roles[i];
    const inOverlap = inOverlapOf(i);
    const outOverlap = i < n - 1 ? overlapOf(cutKinds[i]) : 0;
    const isLast = i === n - 1;
    const durationInFrames = durationOf(i);
    const fit = fits[i];

    let tag = '';
    let kicker = '';
    if (role === 'closer') {
      tag = closerTag;
      kicker = clip.slotNumber === 5 ? 'THE BEST PART' : 'LAST STOP';
    } else if (role === 'tour') {
      tag = tourTags[i];
    }
    const tagInFrame = tagInFrameOf(i);
    const visibleEnd = durationInFrames - outOverlap - 1;

    const callouts: ViralCallout[] = [];
    if (role === 'hook' && facts.length > 0) {
      const from = Math.round(hookSec * fps) + 4;
      const rows = facts.length === 3 ? [-1, 0, 1] : facts.length === 2 ? [0, 1] : [0];
      facts.forEach((text, k) => callouts.push({ text, kind: 'fact', inFrame: from + 6 * k, outFrame: visibleEnd, row: rows[k] }));
    }
    // The room's second callout. A room split in two shows its detail (named from the one frame
    // Gemini saw) on the moment that holds that frame; the other moment gets a listing fact.
    if (role === 'tour' && lp.details) {
      const detailHere = !detailMomentOf.has(clip) || detailMomentOf.get(clip) === i;
      const hostDetail = options.detailOverrides?.[clip.slotNumber];
      const hostCleared = detailHere && hostDetail !== undefined && !cleanTag(hostDetail);
      const fact = () => (factQueue.length > 0 ? { text: factQueue.shift()!, kind: 'fact' as const } : null);
      // An unlabeled moment shows its callout right after the cut, in the label's place
      const inFrame = unlabeled(i) ? tagInFrame + Math.round(0.3 * fps) : tagInFrame + Math.max(Math.round(1.6 * fps), Math.round(0.42 * primary[i]));
      const notes = frameNotes(options, clip.slotNumber);
      const hostHere = detailHere && hostDetail !== undefined;
      let detail: { text: string; kind: 'room' | 'fact' } | null;
      if (hostCleared) detail = null;
      else if (notes && !hostHere) {
        // Scanned clip: each moment names what's in view on its own footage
        const [from, to] = visibleSpan(i);
        const roomTag = tourTags.find((t, k) => t && segs[k].clip === clip) || '';
        const seen = labelInView(notes, from, to, srcAt(i, inFrame + READ_AT_SEC * fps), [roomTag]);
        detail = seen ? { text: seen, kind: 'room' } : fact();
      } else detail = detailHere ? detailFor(clip, i) ?? fact() : fact();
      if (detail && inFrame < visibleEnd - Math.round(1.2 * fps)) {
        callouts.push({ ...detail, inFrame, outFrame: visibleEnd, row: unlabeled(i) ? 0 : 1 });
      }
    }

    shots.push({
      id: segs[i].part === 2 ? `shot-${clip.slotNumber}-2` : `shot-${clip.slotNumber}`,
      ...(segs[i].part === 2 ? { part: 2 as const } : null),
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
      reframe: reframeFor(clip.analysis?.reframe),
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
  const tourAll = shots.map((s, i) => (s.role === 'tour' ? i : -1)).filter((i) => i >= 0);
  // A short room can't hold its label and the re-hook without crowding: prefer rooms with time for both
  const roomy = (i: number) => length !== 'full' || primary[i] >= REHOOK_MIN_ROOM_SEC * fps;
  const tourLabeled = tourAll.filter((i) => shots[i].tag);
  const pick = [tourLabeled.filter(roomy), tourAll.filter(roomy), tourLabeled, tourAll].find((l) => l.length > 0) ?? [];
  const tourIdx = pick;
  if (n >= 4 && tourIdx.length > 0) {
    const text = rehookText(style, last.slotNumber === 5);
    // On screen long enough to read (grade.ts reading-time row), and gone before the room's next callout
    const need = Math.round(readSecFor(text) * fps);
    const fromFor = (k: number) =>
      // 0.3 s after the room tag: the shortest gap between two text entrances (grade.ts ENTRANCE_GAP_SEC)
      shots[k].startFrame + (length === 'full' ? shots[k].tagInFrame + Math.round(0.3 * fps) : shots[k].inOverlapFrames + 6);
    const roomFor = (k: number) => {
      const local = fromFor(k) - shots[k].startFrame;
      const nextCallout = shots[k].callouts.map((c) => c.inFrame).filter((f) => f > local);
      return Math.min(primary[k] - local - 8, ...nextCallout.map((f) => f - local - 2));
    };
    const target = (length === 'full' ? 0.45 : 0.5) * totalFrames;
    const nearest = (list: number[]) =>
      list.reduce((a, b) => (Math.abs(shots[b].startFrame - target) < Math.abs(shots[a].startFrame - target) ? b : a));
    const fits = tourIdx.filter((i) => roomFor(i) >= need);
    const k = length === 'full' ? nearest(fits.length ? fits : tourIdx) : fits.length ? nearest(fits) : Math.floor(n / 2);
    rehook = {
      text,
      fromFrame: fromFor(k),
      durationInFrames: Math.min(need, Math.max(12, roomFor(k))),
    };
  }

  addPunchIns(shots, cuts, rehook, endCardFrom, fps);

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
    (t) => t && t !== 'The best part' && t !== PERK_FALLBACK_LABEL
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
    textScale: VIDEO_TEXT_SCALE,
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
    look: normalizeLook(options.look),
    caption,
    warnings,
  };
}

type ChangeSource = Pick<ViralEditPlan, 'shots' | 'cuts' | 'rehook' | 'priceChipFromFrame' | 'hookExitFrame' | 'endCard'>;

/** Absolute frames where something new appears: cuts, labels, callouts, punch-ins, the re-hook, the price chip, the end card. */
export function changeFrames(plan: ChangeSource): number[] {
  const frames = new Set<number>([0, plan.hookExitFrame, plan.priceChipFromFrame, plan.endCard.fromFrame]);
  for (const cut of plan.cuts) frames.add(cut.atFrame);
  for (const s of plan.shots) {
    if (s.tag && s.role !== 'hook') frames.add(s.startFrame + s.tagInFrame);
    for (const c of s.callouts) frames.add(s.startFrame + c.inFrame);
    for (const p of s.punchInFrames ?? []) frames.add(s.startFrame + p);
  }
  if (plan.rehook) frames.add(plan.rehook.fromFrame);
  return [...frames].sort((a, b) => a - b);
}

/**
 * Fills quiet stretches (over QUIET_MAX_SEC with nothing new) with a gentle punch-in,
 * at the middle of the stretch. Never on the opener, whose headline is the thing to read,
 * and never on photo shots (they have their own camera move) or shots already zoomed to crop a wall.
 */
function addPunchIns(shots: ViralShot[], cuts: ViralCut[], rehook: ViralEditPlan['rehook'], endCardFrom: number, fps: number) {
  const quiet = Math.round(QUIET_MAX_SEC * fps);
  const base = { shots, cuts, rehook, priceChipFromFrame: 0, hookExitFrame: 0, endCard: { fromFrame: endCardFrom } } as ChangeSource;
  for (const shot of shots) {
    if (shot.role === 'hook' || shot.photo || shot.reframe.scale >= PUNCH_MAX_REFRAME) continue;
    const end = shot.role === 'closer' ? endCardFrom : shot.startFrame + shot.durationInFrames - shot.outOverlapFrames;
    const earliest = shot.startFrame + shot.tagInFrame + 1;
    for (let n = 0; n < MAX_PUNCHES; n++) {
      const marks = [...changeFrames(base).filter((f) => f >= shot.startFrame && f < end), end];
      let from = 0;
      let gap = 0;
      for (let k = 1; k < marks.length; k++) {
        if (marks[k] - marks[k - 1] > gap) {
          gap = marks[k] - marks[k - 1];
          from = marks[k - 1];
        }
      }
      if (gap <= quiet) break;
      const at = Math.max(earliest, from + Math.round(gap / 2)) - shot.startFrame;
      if (at >= end - shot.startFrame - PUNCH_FRAMES) break;
      shot.punchInFrames = [...(shot.punchInFrames ?? []), at].sort((a, b) => a - b);
    }
  }
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
    for (const p of s.punchInFrames ?? []) {
      if (p <= 0 || p + PUNCH_FRAMES >= s.durationInFrames) problems.push(`shot ${i} punch-in at ${p}`);
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
