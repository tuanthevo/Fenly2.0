/**
 * Photo tours: turns a listing's still photos into a viral "walking into the
 * home" short, using the same composition, overlays and sound as video tours.
 *
 * Each photo becomes two shots of the same picture:
 *   WALK  the room's first shot, with its callout
 *   LOOK  a second shot of the same photo, with a second callout
 * Every shot moves the camera one way only: up, down, left or right
 * (PAN_DIRECTIONS, taking turns), never bobbing or zooming.
 * A whip cut joins WALK and LOOK (the head turn), and a zoom-through cut leads
 * to the next photo (walking through the next doorway). The last photo is the
 * reveal: a light-leak cut, then a slow push under "THE BEST PART".
 *
 * TIMING (4 photos, ~17 s)
 *   0.0 s  hook: first photo, headline on screen for its
 *          reading time (2.5-3.2 s)
 *   ~3 s   look around the first room while listing facts pop in (2.4 s)
 *   ~5 s   each next room: walk in with its callout (1.8 s), look around with a
 *          second callout (1.7 s); "wait for…" re-hook on the middle room
 *   ~12 s  the last room, revealed big (2.4 s)
 *   ~14 s  end card with the price question (2.8 s), then frame 0 fades back
 *          in so the video loops
 * Photos hold attention for less time than video, so each beat is short.
 *
 * Pure function, no DOM and no Remotion imports.
 */
import {
  buildSocialCaption,
  cleanTag,
  defaultHook,
  endCardCopy,
  hookFontSizeFor,
  listingFacts,
  placeLabel,
  priceLabel,
  rehookText,
  specsLine,
  violatesFairHousing,
} from './copy';
import { NATURAL_LOOK } from './look';
import { VIDEO } from './theme';
import type {
  PanDirection,
  PhotoMotion,
  ViralCallout,
  ViralCut,
  ViralCutKind,
  ViralEditPlan,
  ViralListingInfo,
  ViralSfxCue,
  ViralShot,
  ViralShotRole,
  ViralStyleId,
} from './types';

export type PhotoTourPhoto = {
  src: string;
  /** Room callout, e.g. "Bedroom" (2-3 words) */
  tag: string;
  /** Optional second callout for the look-around beat, e.g. "Walk-in closet" */
  detail?: string;
};

export type PhotoTourInput = {
  listing: ViralListingInfo;
  photos: PhotoTourPhoto[];
  /** Facts shown on the first room after the headline, e.g. ["Private room", "220 sq ft"] */
  facts?: string[];
};

export type PhotoTourOptions = {
  style?: ViralStyleId;
  fps?: number;
  enableEffects?: boolean;
  sfx?: boolean;
  /** Varies pan directions and drift so every listing's video moves differently */
  variant?: number;
};

/** Photo tours play in the feed card under the listing overlay, so their text runs at 64% (0.8 x 0.8). */
export const PHOTO_TEXT_SCALE = 0.64;

export const PHOTO_TIMING = {
  hook: { baseSec: 1.2, perWordSec: 0.22, minSec: 2.5, maxSec: 3.2 },
  heroLookSec: 2.4,
  walkSec: 1.8,
  lookSec: 1.7,
  closerSec: 2.4,
  endCardSec: 2.8,
  cutFrames: 7,
  overlayFrames: 12,
  bridgeFrames: 9,
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Headline reading time: a beat to land, then ~4.5 words per second. */
export function photoHookSec(text: string): number {
  const h = PHOTO_TIMING.hook;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(h.baseSec + h.perWordSec * words, h.minSec, h.maxSec);
}

/**
 * Splits a photo label like "Clip 2/4 • Bedroom & Closet Space" into a room
 * callout and an optional second callout ("Bedroom", "Closet space"). The whole
 * label is kept when it fits on one pill.
 */
export function tagsFromLabel(label: string): { tag: string; detail: string } {
  const main = label.replace(/^\s*(clip|photo|shot)\s*\d+\s*\/\s*\d+\s*[•·:-]\s*/i, '').trim();
  const whole = cleanTag(main);
  if (whole && whole.length === main.replace(/\s+/g, ' ').length) return { tag: whole, detail: '' };
  const parts = main.split(/\s*&\s*|\s*\+\s*|\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const detail = cleanTag(sentence(parts.slice(1).join(' ')));
    // A one-word leftover ("Pressure", "Cafes") reads badly on its own: a listing fact fills the beat instead
    return { tag: cleanTag(parts[0]), detail: detail.includes(' ') ? detail : '' };
  }
  return { tag: whole, detail: '' };
}

/** The last room's callout: the whole label if it fits, else its longest part (usually the perk). */
export function closerTagFromLabel(label: string): string {
  const main = label.replace(/^\s*(clip|photo|shot)\s*\d+\s*\/\s*\d+\s*[•·:-]\s*/i, '').trim();
  const whole = cleanTag(main);
  if (whole && whole.length === main.replace(/\s+/g, ' ').length) return whole;
  const parts = main.split(/\s*&\s*/).map((p) => cleanTag(p)).filter(Boolean);
  return parts.sort((a, b) => b.length - a.length)[0] || whole;
}

/** The four camera moves; each shot moves one way only (no bob, sway or zoom). */
export const PAN_DIRECTIONS: PanDirection[] = ['right', 'up', 'left', 'down'];

/** Pan speed: 0.5 = half the original full sweep (less ground covered in the same shot length). */
export const PAN_SPEED = 0.5;

/**
 * A straight pan across the photo. The photo is held slightly enlarged so
 * there is room to travel: sideways moves slide along the wide photo, up/down
 * moves use the enlarged margin.
 */
export function panMotion(direction: PanDirection, move: 'walk' | 'look'): PhotoMotion {
  const horizontal = direction === 'left' || direction === 'right';
  const scale = horizontal ? 1.12 : 1.2;
  // Full sweeps (x 18 to 82, y 0 to 100) shortened around the centre by PAN_SPEED
  const half = (range: number) => (range / 2) * PAN_SPEED;
  const x0 = 50 - half(64);
  const x1 = 50 + half(64);
  const [fromX, toX] = direction === 'right' ? [x0, x1] : direction === 'left' ? [x1, x0] : [50, 50];
  // y = 0 shows the top edge, 100 the bottom: going up ends near the top
  const y0 = 50 - half(100);
  const y1 = 50 + half(100);
  const [fromY, toY] = direction === 'up' ? [y1, y0] : direction === 'down' ? [y0, y1] : [50, 50];
  return { move, direction, fromScale: scale, toScale: scale, fromX, toX, fromY, toY, bob: 0, doorway: false };
}

type Beat = {
  photo: number;
  move: 'walk' | 'look';
  role: ViralShotRole;
  sec: number;
  tag: string;
  kicker: string;
  callouts: { text: string; kind: 'room' | 'fact' }[];
};

const safeTag = (text: string | undefined) => {
  const t = cleanTag(text);
  return t && !violatesFairHousing(t) ? t : '';
};

export function buildPhotoTourPlan(input: PhotoTourInput, options: PhotoTourOptions = {}): ViralEditPlan {
  const photos = input.photos.filter((p) => Boolean(p.src));
  if (photos.length === 0) throw new Error('buildPhotoTourPlan needs at least one photo');
  const fps = options.fps ?? VIDEO.fps;
  const style: ViralStyleId = options.style ?? 'price-hook';
  const variant = options.variant ?? 0;
  const enableEffects = options.enableEffects ?? true;
  const listing = input.listing;
  const n = photos.length;

  const hook = defaultHook(style, listing);
  const hookSec = photoHookSec(hook.text);
  const facts = (input.facts ?? []).map(safeTag).filter(Boolean).slice(0, 3);
  const closerTag = n >= 2 ? safeTag(photos[n - 1].tag) : safeTag(photos[0].tag);
  const roomTags = photos.map((p) => safeTag(p.tag));
  const factQueue = listingFacts(listing, [...facts, closerTag, ...roomTags]).filter((f) => !violatesFairHousing(f));

  // Beats: walk + look for every room but the last; the last room is the reveal
  const beats: Beat[] = [];
  photos.forEach((p, i) => {
    const isFirst = i === 0;
    const isLast = i === n - 1 && n >= 2;
    if (isLast) {
      beats.push({ photo: i, move: 'walk', role: 'closer', sec: PHOTO_TIMING.closerSec, tag: closerTag, kicker: 'THE BEST PART', callouts: [] });
      return;
    }
    beats.push({
      photo: i,
      move: 'walk',
      role: isFirst ? 'hook' : 'tour',
      sec: isFirst ? hookSec : PHOTO_TIMING.walkSec,
      tag: isFirst ? '' : roomTags[i],
      kicker: '',
      callouts: [],
    });
    const detail = safeTag(p.detail);
    const lookCallouts = isFirst
      ? facts.map((text) => ({ text, kind: 'fact' as const }))
      : detail && detail.toLowerCase() !== roomTags[i].toLowerCase()
      ? [{ text: detail, kind: 'room' as const }]
      : factQueue.length
      ? [{ text: factQueue.shift()!, kind: 'fact' as const }]
      : [];
    beats.push({
      photo: i,
      move: 'look',
      role: n === 1 ? 'closer' : 'tour',
      sec: isFirst ? PHOTO_TIMING.heroLookSec : PHOTO_TIMING.lookSec,
      tag: n === 1 ? closerTag : '',
      kicker: n === 1 ? 'THE BEST PART' : '',
      callouts: n === 1 ? [] : lookCallouts,
    });
  });

  // Cuts: whip = turning your head, zoom-through = walking through the next doorway
  const cutKinds: ViralCutKind[] = [];
  for (let i = 0; i < beats.length - 1; i++) {
    const next = beats[i + 1];
    if (next.role === 'closer' && next.photo !== beats[i].photo) cutKinds.push(enableEffects ? 'light-leak' : 'flash');
    else if (next.photo === beats[i].photo) cutKinds.push((beats[i].photo + variant) % 2 === 0 ? 'whip-left' : 'whip-right');
    else cutKinds.push('zoom-through');
  }
  const isOverlay = (k: ViralCutKind) => k === 'flash' || k === 'light-leak';
  const overlapOf = (k: ViralCutKind) => (isOverlay(k) ? 0 : PHOTO_TIMING.cutFrames);

  const endCardFrames = Math.round(PHOTO_TIMING.endCardSec * fps);
  const shots: ViralShot[] = [];
  let cursor = 0;
  beats.forEach((beat, i) => {
    const primary = Math.round(beat.sec * fps);
    const inOverlap = i > 0 ? overlapOf(cutKinds[i - 1]) : 0;
    const outOverlap = i < beats.length - 1 ? overlapOf(cutKinds[i]) : 0;
    const isLast = i === beats.length - 1;
    const durationInFrames = primary + (isLast ? endCardFrames : outOverlap);
    const visibleEnd = durationInFrames - outOverlap - 1;
    const tagInFrame = inOverlap + 3;
    const firstIn = beat.role === 'tour' && beat.move === 'look' && beat.photo === 0 ? inOverlap + 4 : inOverlap + Math.round(0.35 * fps);
    const callouts: ViralCallout[] = beat.callouts.map((c, k) => ({
      text: c.text,
      kind: c.kind,
      inFrame: Math.min(firstIn + 6 * k, visibleEnd - 12),
      outFrame: visibleEnd,
      row: beat.callouts.length === 3 ? k - 1 : beat.callouts.length === 2 ? k : 0,
    }));
    const p = photos[beat.photo];
    // Directions take turns, so neighbouring shots never repeat a move
    const motion = panMotion(PAN_DIRECTIONS[(variant + i) % PAN_DIRECTIONS.length], beat.move);
    shots.push({
      id: `photo-${beat.photo + 1}-${beat.move}`,
      slotNumber: beat.photo + 1,
      room: beat.tag || p.tag || `Photo ${beat.photo + 1}`,
      src: p.src,
      role: beat.role,
      srcStartSec: 0,
      playbackRate: 1,
      durationInFrames,
      startFrame: cursor,
      inOverlapFrames: inOverlap,
      outOverlapFrames: outOverlap,
      exposure: 0,
      tag: beat.tag,
      kicker: beat.kicker,
      tagInFrame,
      callouts,
      rampFrames: 0,
      rampRate: 1,
      isLandscape: false,
      reframe: { scale: 1, originX: 50 },
      photo: motion,
    });
    cursor += primary;
  });

  const cuts: ViralCut[] = cutKinds.map((kind, i) => ({
    kind,
    durationInFrames: isOverlay(kind) ? PHOTO_TIMING.overlayFrames : PHOTO_TIMING.cutFrames,
    overlapFrames: overlapOf(kind),
    atFrame: shots[i + 1].startFrame,
  }));

  const last = shots[shots.length - 1];
  const totalFrames = last.startFrame + last.durationInFrames;
  const endCardFrom = totalFrames - endCardFrames;
  const firstCut = cuts[0];
  const hookExitFrame = firstCut ? firstCut.atFrame : endCardFrom;
  const hookExitFrames = (firstCut?.overlapFrames || 8) + 4;

  // Re-hook on the walk into the middle room (4+ photos)
  let rehook: ViralEditPlan['rehook'] = null;
  if (n >= 4) {
    const mid = shots.find((s) => s.role === 'tour' && s.photo?.move === 'walk' && s.slotNumber === Math.ceil(n / 2));
    if (mid) {
      const from = mid.startFrame + mid.tagInFrame + 6;
      rehook = { text: rehookText(style, true), fromFrame: from, durationInFrames: Math.round(1.1 * fps) };
    }
  }

  const sfx: ViralSfxCue[] = [];
  if (options.sfx ?? true) {
    cuts.forEach((cut, i) => {
      sfx.push({ kind: 'whoosh', atFrame: cut.atFrame - (cut.overlapFrames > 0 ? 2 : 4), volume: cut.overlapFrames > 0 ? 0.45 : 0.35 });
      const next = shots[i + 1];
      if (next.role === 'tour' && next.tag) sfx.push({ kind: 'pop', atFrame: next.startFrame + next.tagInFrame, volume: 0.35 });
      if (next.role === 'closer') sfx.push({ kind: 'ding', atFrame: next.startFrame + next.tagInFrame, volume: 0.45 });
    });
    for (const s of shots) {
      s.callouts.forEach((c, k) => sfx.push({ kind: 'pop', atFrame: s.startFrame + c.inFrame, volume: k > 0 ? 0.22 : 0.3 }));
    }
    sfx.push(style === 'guess-rent' ? { kind: 'ding', atFrame: endCardFrom + 6, volume: 0.55 } : { kind: 'pop', atFrame: endCardFrom + 4, volume: 0.35 });
  }
  const cues = sfx
    .map((c) => ({ ...c, atFrame: clamp(Math.round(c.atFrame), 0, totalFrames - 1) }))
    .sort((a, b) => a.atFrame - b.atFrame);

  const highlights = [closerTag, ...roomTags.slice(1, -1)].filter(Boolean);

  return {
    version: 2,
    fps,
    width: VIDEO.width,
    height: VIDEO.height,
    style,
    pace: 'balanced',
    length: 'teaser',
    hook,
    hookFontSize: hookFontSizeFor(hook.text),
    textScale: PHOTO_TEXT_SCALE,
    hookExitFrame,
    hookExitFrames,
    priceLabel: priceLabel(listing.monthlyRent),
    placeLabel: placeLabel(listing),
    specsLabel: specsLine(listing),
    hidePriceUntilEnd: style === 'guess-rent',
    priceChipFromFrame: firstCut ? firstCut.atFrame + firstCut.overlapFrames + 2 : endCardFrom,
    rehook,
    endCard: { fromFrame: endCardFrom, durationInFrames: endCardFrames, ...endCardCopy(style, listing) },
    loopBridgeFrames: Math.max(4, Math.min(PHOTO_TIMING.bridgeFrames, endCardFrames - 8)),
    shots,
    cuts,
    sfx: cues,
    totalFrames,
    audio: { keepRoomSound: false, roomSoundVolume: 0, sfxEnabled: options.sfx ?? true, music: null },
    showWatermark: false,
    enableEffects,
    look: NATURAL_LOOK,
    caption: buildSocialCaption(style, listing, highlights),
    warnings: [],
  };
}
