/**
 * Turns the host's guided clips into a short-form edit plan.
 *
 * Structure (balanced pace, 5 shots, about 10 seconds):
 *   0.0 s  HOOK    best-looking shot, price + neighborhood headline on frame 0
 *   2.3 s  TOUR    3 rooms, about 1.35 s each at 1.35x, whip / zoom transitions,
 *                  a 2-3 word callout on each, a mid-video "wait for…" re-hook
 *   6.4 s  CLOSER  the standout perk ("THE BEST PART") on a light-leak cut
 *   8.3 s  END     price question over the last shot, then the first frame
 *                  fades back in so the video loops seamlessly
 *
 * Why: platforms push videos that people watch to the end and rewatch, and
 * decide in the first seconds; text carries the story because most people
 * scroll with the sound off. Sources are in docs/viral-playbook.md.
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
  hookFontSizeFor,
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
  ClipWarning,
  HookCopy,
  ViralClipInput,
  ViralCut,
  ViralCutKind,
  ViralEditPlan,
  ViralPace,
  ViralSfxCue,
  ViralShot,
  ViralShotRole,
  ViralStyleId,
} from './types';

export const PACE_PRESETS: Record<
  ViralPace,
  {
    label: string;
    hookSec: number;
    tourSec: number;
    closerSec: number;
    endCardSec: number;
    cutFrames: number;
    bridgeFrames: number;
  }
> = {
  snappy: { label: 'Snappy', hookSec: 1.9, tourSec: 1.1, closerSec: 1.6, endCardSec: 1.5, cutFrames: 6, bridgeFrames: 8 },
  balanced: { label: 'Balanced', hookSec: 2.3, tourSec: 1.35, closerSec: 1.9, endCardSec: 1.7, cutFrames: 7, bridgeFrames: 9 },
  relaxed: { label: 'Relaxed', hookSec: 2.7, tourSec: 1.8, closerSec: 2.3, endCardSec: 2.0, cutFrames: 8, bridgeFrames: 10 },
};

/** 1.0x for hero shots (hook, closer), 1.35x for the rooms in between. */
export const SPEED = { hero: 1, tour: 1.35, minHero: 0.8, minTour: 0.9, minCloser: 0.7, max: 1.6 } as const;

export const CUT_CYCLE: ViralCutKind[] = ['whip-left', 'zoom-through', 'whip-right'];
export const CLOSER_OVERLAY_FRAMES = 12;

/** Guided slots that usually make the best opener: bedroom, perk, kitchen. */
export const SLOT_HOOK_PRIOR: Record<number, number> = { 1: 0.1, 2: 0.06, 3: 0, 4: -0.05, 5: 0.08 };

const SOURCE_TAIL_SEC = 0.05;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
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

/**
 * How each role trades footage for speed when a clip is short. The analysis
 * found the cleanest start, so we first slow hero shots down a little, then
 * start a bit earlier, then slow down more; if a clip is still too short its
 * last frame holds (under the end card for the closer).
 */
export const FIT_POLICY: Record<ViralShotRole, { maxShiftSec: number; keepRate: number; minRate: number }> = {
  hook: { maxShiftSec: 0.6, keepRate: 0.85, minRate: SPEED.minHero },
  tour: { maxShiftSec: 0.8, keepRate: SPEED.tour, minRate: SPEED.minTour },
  closer: { maxShiftSec: 0.3, keepRate: 0.75, minRate: SPEED.minCloser },
};

/** Where to start playing inside the source clip, and how fast, so the shot stays on clean footage. */
export function fitSource(
  clip: ViralClipInput,
  role: ViralShotRole,
  durationInFrames: number,
  fps: number,
  aiWindow?: { startSec: number; endSec?: number; speed?: number }
): { srcStartSec: number; playbackRate: number } {
  const duration = clip.durationSec > 0 ? clip.durationSec : clip.analysis?.durationSec ?? 4.5;
  const policy = FIT_POLICY[role];
  let rate: number = role === 'tour' ? SPEED.tour : SPEED.hero;
  if (role === 'tour' && aiWindow?.speed) rate = clamp(aiWindow.speed, SPEED.minTour, SPEED.max);
  const outputSec = durationInFrames / fps;
  const preferred = clamp(
    aiWindow?.startSec ?? clip.analysis?.best.startSec ?? (duration >= 3 ? 0.6 : 0.2),
    0,
    Math.max(0, duration - SOURCE_TAIL_SEC)
  );
  let start = preferred;
  const available = () => Math.max(0, duration - start - SOURCE_TAIL_SEC);
  const fits = () => available() >= outputSec * rate - 1e-9;

  if (!fits()) {
    // 1. Slow hero shots down a little and keep the clean start
    rate = Math.max(Math.min(policy.keepRate, rate), available() / outputSec);
  }
  if (!fits()) {
    // 2. Start a little earlier
    start = Math.max(0, preferred - policy.maxShiftSec, duration - outputSec * rate - SOURCE_TAIL_SEC);
  }
  if (!fits()) {
    // 3. Slow down further; anything still missing holds the last frame
    rate = Math.max(policy.minRate, available() / outputSec);
  }
  start = Math.floor(start * fps) / fps;
  return { srcStartSec: start, playbackRate: Math.round(rate * 1000) / 1000 };
}

/** Frames between one shot's start and the next shot's start, by role. */
function primaryFrames(
  roles: ViralShotRole[],
  pace: ViralPace,
  fps: number,
  bpm: number | null
): { primary: number[]; endCard: number } {
  const p = PACE_PRESETS[pace];
  const seconds = roles.map((r) => (r === 'hook' ? p.hookSec : r === 'tour' ? p.tourSec : p.closerSec));
  if (!bpm) {
    return {
      primary: seconds.map((s) => Math.round(s * fps)),
      endCard: Math.round(p.endCardSec * fps),
    };
  }
  // Beat sync: every cut lands on a beat of the music
  const beat = (fps * 60) / bpm;
  const minBeats = (r: ViralShotRole) => (r === 'tour' ? 2 : 3);
  const beats = roles.map((r, i) => Math.max(minBeats(r), Math.round((seconds[i] * fps) / beat)));
  const endBeats = Math.max(3, Math.round((p.endCardSec * fps) / beat));
  const edges = [0];
  for (const b of [...beats, endBeats]) edges.push(edges[edges.length - 1] + b);
  const at = edges.map((e) => Math.round(e * beat));
  return {
    primary: roles.map((_, i) => at[i + 1] - at[i]),
    endCard: at[at.length - 1] - at[at.length - 2],
  };
}

function resolveHook(
  style: ViralStyleId,
  input: BuildViralPlanInput,
  options: BuildViralPlanOptions
): HookCopy {
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

export function buildViralEditPlan(
  input: BuildViralPlanInput,
  options: BuildViralPlanOptions = {}
): ViralEditPlan {
  const clips = input.clips.filter((c) => Boolean(c.src));
  if (clips.length === 0) throw new Error('buildViralEditPlan needs at least one clip');

  const fps = options.fps ?? VIDEO.fps;
  const style: ViralStyleId = options.style ?? 'price-hook';
  const pace: ViralPace = options.pace ?? 'balanced';
  const enableEffects = options.enableEffects ?? true;
  const preset = PACE_PRESETS[pace];
  const bpm =
    options.music?.src && options.music.bpm && options.music.bpm >= 60 && options.music.bpm <= 200
      ? options.music.bpm
      : null;

  const ordered = orderShots(clips, pickHookSlot(clips, options));
  const n = ordered.length;
  const roles: ViralShotRole[] = ordered.map((_, i) =>
    i === 0 ? 'hook' : i === n - 1 ? 'closer' : 'tour'
  );
  const { primary, endCard: endCardFrames } = primaryFrames(roles, pace, fps, bpm);

  // Cuts: whip / zoom transitions between rooms, a light-leak (or flash) hit into the closer
  const cutKinds: ViralCutKind[] = [];
  for (let i = 0; i < n - 1; i++) {
    cutKinds.push(i === n - 2 ? (enableEffects ? 'light-leak' : 'flash') : CUT_CYCLE[i % CUT_CYCLE.length]);
  }
  const overlapOf = (kind: ViralCutKind) =>
    kind === 'flash' || kind === 'light-leak' ? 0 : preset.cutFrames;

  const listing = input.listing;
  const tags = defaultTags(listing);
  const shots: ViralShot[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const clip = ordered[i];
    const role = roles[i];
    const inOverlap = i > 0 ? overlapOf(cutKinds[i - 1]) : 0;
    const outOverlap = i < n - 1 ? overlapOf(cutKinds[i]) : 0;
    const isLast = i === n - 1;
    const durationInFrames = primary[i] + (isLast ? endCardFrames : outOverlap);
    const { srcStartSec, playbackRate } = fitSource(
      clip,
      role,
      durationInFrames,
      fps,
      options.ai?.windows?.[clip.slotNumber]
    );

    let tag = '';
    let kicker = '';
    if (role === 'closer') {
      const perkSlot = clip.slotNumber === 5;
      tag =
        cleanTag(options.perkOverride ?? options.tagOverrides?.[clip.slotNumber]) ||
        aiTag(perkSlot ? options.ai?.perkLabel ?? options.ai?.tags?.[clip.slotNumber] : options.ai?.tags?.[clip.slotNumber]) ||
        tags[clip.slotNumber] ||
        cleanTag(clip.room);
      kicker = perkSlot ? 'THE BEST PART' : 'LAST STOP';
    } else if (role === 'tour') {
      tag =
        cleanTag(options.tagOverrides?.[clip.slotNumber]) ||
        aiTag(options.ai?.tags?.[clip.slotNumber]) ||
        tags[clip.slotNumber] ||
        cleanTag(clip.room);
    }

    shots.push({
      id: `shot-${clip.slotNumber}`,
      slotNumber: clip.slotNumber,
      room: clip.room,
      src: clip.src,
      role,
      srcStartSec,
      playbackRate,
      durationInFrames,
      startFrame: cursor,
      inOverlapFrames: inOverlap,
      outOverlapFrames: outOverlap,
      exposure: clamp(clip.analysis?.exposureBoost ?? 0, -0.25, 0.6),
      tag,
      kicker,
      tagInFrame: inOverlap + 3,
      isLandscape: Boolean(clip.isLandscape),
    });
    cursor += primary[i];
  }

  const cuts: ViralCut[] = cutKinds.map((kind, i) => ({
    kind,
    durationInFrames: kind === 'flash' || kind === 'light-leak' ? CLOSER_OVERLAY_FRAMES : preset.cutFrames,
    overlapFrames: overlapOf(kind),
    atFrame: shots[i + 1].startFrame,
  }));

  const last = shots[n - 1];
  const totalFrames = last.startFrame + last.durationInFrames;
  const endCardFrom = totalFrames - endCardFrames;
  const endCopy = endCardCopy(style, listing);

  const hook = resolveHook(style, input, options);
  const firstCut = cuts[0];
  const hookExitFrame = firstCut ? firstCut.atFrame : endCardFrom;
  const hookExitFrames = (firstCut?.overlapFrames || 8) + 4;

  let rehook: ViralEditPlan['rehook'] = null;
  if (n >= 4) {
    const k = Math.floor(n / 2);
    const shot = shots[k];
    const from = shot.startFrame + shot.inOverlapFrames + 6;
    rehook = {
      text: rehookText(style, last.slotNumber === 5),
      fromFrame: from,
      durationInFrames: Math.min(Math.round(1.2 * fps), Math.max(12, primary[k] - shot.inOverlapFrames - 8)),
    };
  }

  const sfx: ViralSfxCue[] = [];
  if (options.sfx ?? true) {
    cuts.forEach((cut, i) => {
      if (cut.overlapFrames > 0) {
        sfx.push({ kind: 'whoosh', atFrame: cut.atFrame - 2, volume: 0.5 });
      } else {
        sfx.push({ kind: 'whoosh', atFrame: cut.atFrame - 4, volume: 0.35 });
      }
      const next = shots[i + 1];
      if (next.role === 'tour' && next.tag) {
        sfx.push({ kind: 'pop', atFrame: next.startFrame + next.tagInFrame, volume: 0.35 });
      }
      if (next.role === 'closer') {
        sfx.push({ kind: 'ding', atFrame: next.startFrame + next.tagInFrame, volume: 0.45 });
      }
    });
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

  const highlights = [last.role === 'closer' ? last.tag : '', ...shots.filter((s) => s.role === 'tour').map((s) => s.tag)]
    .filter((t) => t && t !== 'The best part');
  const aiCaption = (options.ai?.socialCaption || '').trim();
  const caption =
    aiCaption && aiCaption.length <= 2200 && !violatesFairHousing(aiCaption)
      ? aiCaption
      : buildSocialCaption(style, listing, highlights);

  const music =
    options.music?.src
      ? {
          src: options.music.src,
          volume: clamp(options.music.volume ?? 0.55, 0, 1),
          startSec: Math.max(0, options.music.startSec ?? 0),
          bpm,
        }
      : null;

  return {
    version: 1,
    fps,
    width: VIDEO.width,
    height: VIDEO.height,
    style,
    pace,
    hook,
    hookFontSize: hookFontSizeFor(hook.text),
    hookExitFrame,
    hookExitFrames,
    priceLabel: priceLabel(listing.monthlyRent),
    placeLabel: placeLabel(listing),
    specsLabel: specsLine(listing),
    hidePriceUntilEnd: style === 'guess-rent',
    priceChipFromFrame: firstCut ? firstCut.atFrame + firstCut.overlapFrames + 2 : endCardFrom,
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
  for (const c of plan.sfx) {
    if (c.atFrame < 0 || c.atFrame >= plan.totalFrames) problems.push(`sfx at ${c.atFrame}`);
  }
  return problems;
}
