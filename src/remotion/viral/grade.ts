/**
 * Grades an edit plan on the 20-point audit rubric
 * (.claude/skills/fenly-viral-editor/references/audit.md): 10 rows, 0-2 each.
 * Every video Fenly makes must reach PASS_SCORE before it can be exported.
 *
 * The grade reads the plan (text, timing, speed, cuts) and the clip analysis
 * (brightness, openings, the hook frame) that the editor already measures.
 * It can't see pixels, so rows about the footage use the analysis numbers;
 * a row it can't measure scores 1 and says why.
 *
 * Pure and unit tested (grade.test.ts).
 */
import { changeFrames, MAX_FIT_RATE, MAX_TOUR_TOTAL_SEC, MIN_TOUR_CLIPS, MIN_TOUR_TOTAL_SEC, readSecFor } from './plan';
import { MAX_HOOK_CHARS } from './copy';
import { TYPE } from './theme';
import type { ClipAnalysis, ViralClipInput, ViralEditPlan, ViralShot } from './types';

export const PASS_SCORE = 18;
export const MAX_SCORE = 20;

export type GradeRowKey =
  | 'frame0'
  | 'hookCopy'
  | 'readability'
  | 'placement'
  | 'readingTime'
  | 'changeRate'
  | 'speed'
  | 'openings'
  | 'look'
  | 'ending';

export type GradeRow = {
  key: GradeRowKey;
  label: string;
  score: 0 | 1 | 2;
  /** Plain words: what was measured */
  note: string;
  /** What would raise it (empty when the row is 2/2) */
  fix: string;
  /** Slots whose footage holds the row back (a retake helps) */
  retakeSlots: number[];
};

export type PlanGrade = {
  total: number;
  max: typeof MAX_SCORE;
  passed: boolean;
  rows: GradeRow[];
  lengthSec: number;
  /**
   * The host's length rule (Nov 2026): with MIN_TOUR_CLIPS+ clips a tour runs
   * MIN_TOUR_TOTAL_SEC-MAX_TOUR_TOTAL_SEC. Not a rubric row, but `passed` needs it.
   */
  lengthOk: boolean;
  /** Why the length is off, in plain words (null when it's fine) */
  lengthNote: string | null;
  /** The rooms with the least usable footage: filming them longer lengthens the tour */
  lengthRetakeSlots: number[];
};

/** Reading-time rule from the audit (lives in plan.ts, which also times the re-hook with it). */
export { readSecFor };

/** Smallest text sizes on a 1080 px frame that still read on a phone (after plan.textScale: the host chose 0.8, Nov 2026). */
export const MIN_READABLE_PX = { hook: 60, tag: 44, support: 34 } as const;
/** Two text entrances closer than this split attention */
export const ENTRANCE_GAP_SEC = 0.3;
/** Rooms whose corrected brightness differs by more than this look like different homes */
export const LOOK_SPREAD = { good: 0.14, ok: 0.22 } as const;
/** Corrected mean brightness (0..1) below which a room reads as dark, above which windows blow out */
export const LOOK_RANGE = { min: 0.33, max: 0.85 } as const;
/** A hook clip whose hook score is within this of the best clip counts as the best room */
export const HOOK_SCORE_SLACK = 0.05;

type TextSpan = { what: string; text: string; from: number; to: number };

/** Every text block with the frames it is fully on screen (approximate for animated entrances). */
export function textSpans(plan: ViralEditPlan): TextSpan[] {
  const spans: TextSpan[] = [{ what: 'Headline', text: plan.hook.text, from: 0, to: plan.hookExitFrame }];
  for (const s of plan.shots) {
    const end = s.role === 'closer' ? plan.endCard.fromFrame : s.startFrame + s.durationInFrames - s.outOverlapFrames - 1;
    if (s.tag && s.role !== 'hook') {
      spans.push({ what: `${s.room} callout`, text: s.tag, from: s.startFrame + s.tagInFrame, to: end });
    }
    for (const c of s.callouts) {
      spans.push({ what: `${s.room} callout`, text: c.text, from: s.startFrame + c.inFrame, to: s.startFrame + c.outFrame });
    }
  }
  if (plan.rehook) {
    spans.push({ what: 'Re-hook', text: plan.rehook.text, from: plan.rehook.fromFrame, to: plan.rehook.fromFrame + plan.rehook.durationInFrames });
  }
  const e = plan.endCard;
  spans.push({ what: 'End card', text: [e.lead, e.big, e.tail].filter(Boolean).join(' '), from: e.fromFrame, to: e.fromFrame + e.durationInFrames });
  return spans;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const sec = (plan: ViralEditPlan, frames: number) => Math.round((frames / plan.fps) * 10) / 10;
const row = (key: GradeRowKey, label: string, score: 0 | 1 | 2, note: string, fix = '', retakeSlots: number[] = []): GradeRow => ({
  key,
  label,
  score,
  note,
  fix: score === 2 ? '' : fix,
  retakeSlots: score === 2 ? [] : retakeSlots,
});

/** Is the shot's first frame inside the clip's clean footage (not a wall, door edge or person)? */
function weakOpening(shot: ViralShot, clip: ViralClipInput | undefined, frameNotes?: { t: number; blocked?: boolean; person?: boolean }[]): boolean | null {
  const a = clip?.analysis;
  if (!a) return null;
  if (a.clean && shot.srcStartSec < a.clean.startSec - 0.15) return true;
  const near = (frameNotes ?? []).find((n) => Math.abs(n.t - shot.srcStartSec) <= 0.6);
  if (near && (near.blocked || near.person)) return true;
  return a.warnings.some((w) => w.kind === 'blank' && w.severity === 'retake');
}

const retakeKinds = (a: ClipAnalysis | null | undefined, kinds: string[]) =>
  (a?.warnings ?? []).some((w) => w.severity === 'retake' && kinds.includes(w.kind));

/**
 * Scores the plan. `clips` are the inputs it was built from (with their
 * analysis); `frameNotes` are Gemini's per-frame notes when the AI pass ran.
 */
export function gradePlan(
  plan: ViralEditPlan,
  clips: ViralClipInput[],
  frameNotes?: Record<number, { t: number; blocked?: boolean; person?: boolean }[]>,
  /**
   * The clip checks have all run. A clip still without analysis then could not be read on this
   * device: it is graded as "can't check" (retake offered) instead of "wait", and the other
   * rooms are graded without it, so one unreadable clip never blocks export for good.
   */
  checksDone = false
): PlanGrade {
  const fps = plan.fps;
  const clipOf = (slot: number) => clips.find((c) => c.slotNumber === slot);
  const rows: GradeRow[] = [];
  const rooms = plan.shots.filter((s) => !s.part);
  const unchecked = rooms.filter((s) => !clipOf(s.slotNumber)?.analysis);
  const checkedRooms = rooms.filter((s) => clipOf(s.slotNumber)?.analysis);
  // Still waiting for checks (or nothing could be read at all): the footage rows hold at 1
  const measured = unchecked.length === 0 || (checksDone && checkedRooms.length > 0);
  const uncheckedNote = unchecked.length && checksDone ? ` ${unchecked.map((s) => s.room).join(', ')} couldn’t be checked on this device.` : '';

  // 1. Frame 0: the best room, bright and clear, headline on screen from frame 0
  {
    const hook = plan.shots[0];
    const a = hook ? clipOf(hook.slotNumber)?.analysis : null;
    if (!hook || !a) {
      rows.push(
        checksDone && hook
          ? row('frame0', 'Frame 0', 1, `${hook.room} couldn’t be checked on this device.`, `Open on another room, or film ${hook.room} again.`, [hook.slotNumber])
          : row('frame0', 'Frame 0', 1, 'The opening clip hasn’t been checked yet.', 'Wait for the clip check to finish.')
      );
    } else {
      const bestScore = Math.max(...clips.map((c) => c.analysis?.hookScore ?? -Infinity));
      const isBest = a.hookScore >= bestScore - HOOK_SCORE_SLACK;
      const luma = clamp01(a.best.meanLuma * 2 ** hook.exposure);
      const weak = weakOpening(hook, clipOf(hook.slotNumber), frameNotes?.[hook.slotNumber]);
      if (retakeKinds(a, ['dark', 'blank', 'shaky']) || luma < LOOK_RANGE.min - 0.08) {
        rows.push(row('frame0', 'Frame 0', 0, `The opener (${hook.room}) is dark, shaky or mostly wall.`, `Retake ${hook.room}, or open on another room.`, [hook.slotNumber]));
      } else if (!isBest || weak || luma < LOOK_RANGE.min) {
        rows.push(
          row(
            'frame0',
            'Frame 0',
            1,
            !isBest ? `Another room looks better than ${hook.room} as the opener.` : weak ? `${hook.room} opens on a wall or door edge.` : `${hook.room} is a bit dark for the opener.`,
            !isBest ? 'Open on the best-looking room.' : `Retake ${hook.room} starting from the doorway, facing in.`,
            isBest ? [hook.slotNumber] : []
          )
        );
      } else {
        rows.push(row('frame0', 'Frame 0', 2, `${hook.room} opens the video: bright, clear, best room.`));
      }
    }
  }

  // 2. Hook copy: exact rent and place, ≤ 64 characters
  {
    const text = plan.hook.text;
    const digits = plan.priceLabel.replace(/[^\d]/g, '');
    const hasPrice = (digits.length > 0 && text.replace(/[^\d]/g, '').includes(digits)) || plan.hook.segments.some((s) => s.em === 'price');
    // Guess-the-rent keeps the price for the end card on purpose
    const priceOk = hasPrice || (plan.hidePriceUntilEnd && `${plan.endCard.big} ${plan.endCard.lead}`.replace(/[^\d]/g, '').includes(digits));
    const hasPlace =
      plan.hook.segments.some((s) => s.em === 'place') || (plan.placeLabel.length > 0 && text.toLowerCase().includes(plan.placeLabel.toLowerCase()));
    const short = text.length <= MAX_HOOK_CHARS;
    const hits = [priceOk, hasPlace].filter(Boolean).length;
    const score = (hits === 2 && short ? 2 : hits >= 1 ? 1 : 0) as 0 | 1 | 2;
    rows.push(
      row(
        'hookCopy',
        'Hook copy',
        score,
        `"${text}"${!priceOk ? ' has no rent' : ''}${!hasPlace ? `${!priceOk ? ' and' : ''} no neighborhood` : ''}${!short ? ' is too long' : ''}.`,
        'Name the exact rent and the neighborhood, e.g. "What $1,450/mo gets you in Mission District".'
      )
    );
  }

  // 3. Readability: bold outlined text at phone-readable sizes
  {
    const scale = plan.textScale ?? 1;
    const hookPx = Math.round(plan.hookFontSize * scale);
    const tagPx = Math.round(TYPE.tag * scale);
    const supportPx = Math.round(TYPE.support * scale);
    const small = [
      hookPx < MIN_READABLE_PX.hook ? `headline ${hookPx}px` : '',
      tagPx < MIN_READABLE_PX.tag ? `callouts ${tagPx}px` : '',
      supportPx < MIN_READABLE_PX.support ? `details ${supportPx}px` : '',
    ].filter(Boolean);
    rows.push(
      row(
        'readability',
        'Readability',
        small.length === 0 ? 2 : 1,
        small.length === 0 ? `Bold outlined text: headline ${hookPx}px, callouts ${tagPx}px.` : `Small: ${small.join(', ')}.`,
        small.some((s) => s.startsWith('headline')) ? 'Shorten the headline so it can be set bigger.' : 'Use fewer, bigger words.'
      )
    );
  }

  // 4. Placement: inside the safe box (the composition keeps it there) and one entrance at a time.
  // The re-hook sits in the upper band (overlays.tsx), so only the headline can stack with it.
  {
    const spans = textSpans(plan);
    // A room's own callouts cascading in together (the opener's fact list) read as one block
    const entrances = [...spans].sort((a, b) => a.from - b.from);
    let clashes = 0;
    for (let i = 1; i < entrances.length; i++) {
      const [a, b] = [entrances[i - 1], entrances[i]];
      const sameBlock = a.what === b.what && a.what.endsWith('callout');
      if (!sameBlock && b.from > 0 && b.from - a.from < ENTRANCE_GAP_SEC * fps) clashes++;
    }
    const rehook = spans.find((s) => s.what === 'Re-hook');
    const stacked = rehook
      ? spans.filter((s) => s.what === 'Headline' && s.from < rehook.to && s.to > rehook.from).length
      : 0;
    const problems = clashes + stacked;
    rows.push(
      row(
        'placement',
        'Placement',
        problems === 0 ? 2 : problems === 1 ? 1 : 0,
        problems === 0
          ? 'Text stays in the safe area, one thing appears at a time.'
          : `${clashes ? `${clashes} time(s) two texts pop in together` : ''}${clashes && stacked ? '; ' : ''}${stacked ? 'the re-hook sits on top of the headline' : ''}.`,
        'Fewer callouts per room, so each one gets its own moment.'
      )
    );
  }

  // 5. Reading time
  {
    const spans = textSpans(plan);
    const shortfalls = spans
      .map((s) => ({ s, need: readSecFor(s.text), have: (s.to - s.from) / fps }))
      .filter((x) => x.need > 0 && x.have + 1 / fps < x.need);
    const worst = shortfalls.reduce((m, x) => Math.min(m, x.have / x.need), 1);
    const score = (shortfalls.length === 0 ? 2 : worst >= 0.85 ? 1 : 0) as 0 | 1 | 2;
    const first = shortfalls[0];
    rows.push(
      row(
        'readingTime',
        'Reading time',
        score,
        first
          ? `${first.s.what} "${first.s.text}" is on for ${first.have.toFixed(1)} s; it needs ${first.need.toFixed(1)} s${shortfalls.length > 1 ? ` (+${shortfalls.length - 1} more)` : ''}.`
          : 'Every text stays on long enough to read.',
        'Shorter callouts (2-3 words), or a longer clip for that room.'
      )
    );
  }

  // 6. Change rate: something new every 2-3 s, uneven. The end card is left out: the audit wants
  // it still ("nothing else animating") while the price question is read.
  {
    const end = plan.endCard.fromFrame;
    const marks = [...changeFrames(plan).filter((f) => f < end), end];
    const gaps = marks.slice(1).map((f, i) => f - marks[i]).filter((g) => g > 0);
    const longest = gaps.length ? Math.max(...gaps) / fps : end / fps;
    const even = gaps.length > 2 && Math.max(...gaps) - Math.min(...gaps) <= 2;
    // 0.1 s of slack: a beat of 91 frames (3.03 s) is still "every 3 s"
    const score = (longest <= 3.1 ? (even ? 1 : 2) : longest <= 4.1 ? 1 : 0) as 0 | 1 | 2;
    rows.push(
      row(
        'changeRate',
        'Change rate',
        score,
        `Longest stretch with nothing new: ${longest.toFixed(1)} s${even ? ' (beats are too even)' : ''}.`,
        'Add a callout or a second shot to the slow room.'
      )
    );
  }

  // 7. Speed: natural walk, 1.0-1.15x, no ramps, nothing under 1.0x. Up to MAX_FIT_RATE (1.35x, still a
  // confident walk) is allowed when a tour past 50 s plays its rooms faster to fit (host's call, Nov 2026).
  {
    const rates = plan.shots.map((s) => s.playbackRate);
    const slow = plan.shots.filter((s) => s.playbackRate < 1 - 1e-6);
    const fast = plan.shots.filter((s) => s.playbackRate > 1.6);
    const ramps = plan.shots.filter((s) => s.rampFrames > 0);
    const outside = plan.shots.filter((s) => s.playbackRate > MAX_FIT_RATE + 1e-6);
    const fitted = plan.shots.some((s) => s.playbackRate > 1.15 + 1e-6);
    const score = (slow.length || fast.length ? 0 : outside.length || ramps.length ? 1 : 2) as 0 | 1 | 2;
    rows.push(
      row(
        'speed',
        'Speed',
        score,
        `Rooms play at ${Math.min(...rates).toFixed(2)}-${Math.max(...rates).toFixed(2)}x${fitted && !outside.length ? ' (faster to fit 50 s)' : ''}${ramps.length ? ', with speed ramps' : ''}.`,
        slow.length ? 'Never slow phone footage below 1.0x: it stutters.' : 'Keep every room between 1.0x and 1.35x.',
        [...slow, ...fast].map((s) => s.slotNumber)
      )
    );
  }

  // 8. Room openings: each room starts on a clear, wide view
  {
    if (!measured) {
      rows.push(row('openings', 'Room openings', 1, 'Not every clip has been checked yet.', 'Wait for the clip check to finish.'));
    } else {
      const weak = checkedRooms.filter((s) => weakOpening(s, clipOf(s.slotNumber), frameNotes?.[s.slotNumber]));
      rows.push(
        row(
          'openings',
          'Room openings',
          (weak.length === 0 ? 2 : weak.length === 1 ? 1 : 0) as 0 | 1 | 2,
          (weak.length === 0 ? 'Every room opens on a clear view.' : `${weak.map((s) => s.room).join(', ')} open${weak.length === 1 ? 's' : ''} on a wall, door edge or person.`) + (weak.length ? uncheckedNote : ''),
          'Retake those rooms starting in the doorway, facing in.',
          weak.map((s) => s.slotNumber)
        )
      );
    }
  }

  // 9. Look: bright, true, consistent across rooms
  {
    if (!measured) {
      rows.push(row('look', 'Look', 1, 'Not every clip has been checked yet.', 'Wait for the clip check to finish.'));
    } else {
      const lumas = checkedRooms.map((s) => ({ s, luma: clamp01((clipOf(s.slotNumber)!.analysis!.best.meanLuma) * 2 ** s.exposure) }));
      const values = lumas.map((x) => x.luma);
      const spread = Math.max(...values) - Math.min(...values);
      const dark = lumas.filter((x) => x.luma < LOOK_RANGE.min || retakeKinds(clipOf(x.s.slotNumber)?.analysis, ['dark']));
      const blown = lumas.filter((x) => x.luma > LOOK_RANGE.max);
      let score: 0 | 1 | 2 = spread <= LOOK_SPREAD.good ? 2 : spread <= LOOK_SPREAD.ok ? 1 : 0;
      if (dark.length || blown.length) score = Math.min(score, dark.length > 1 ? 0 : 1) as 0 | 1 | 2;
      const outliers = [...dark, ...blown];
      if (score < 2 && outliers.length === 0) {
        // The room furthest from the others
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        outliers.push(lumas.reduce((m, x) => (Math.abs(x.luma - mean) > Math.abs(m.luma - mean) ? x : m)));
      }
      rows.push(
        row(
          'look',
          'Look',
          score,
          score === 2
            ? 'Rooms are bright and look like the same home.'
            : `${dark.length ? `${dark.map((x) => x.s.room).join(', ')} too dark. ` : ''}${blown.length ? `${blown.map((x) => x.s.room).join(', ')} too bright. ` : ''}Brightness varies ${Math.round(spread * 100)}% between rooms.`,
          'Film every room with the lights on, at the same time of day.',
          outliers.map((x) => x.s.slotNumber)
        )
      );
    }
  }

  // 10. Ending: a real price question, and the last frame loops to frame 0
  {
    const e = plan.endCard;
    const question = /\?/.test(`${e.lead} ${e.big} ${e.tail}`);
    const loops = plan.loopBridgeFrames > 0;
    rows.push(
      row(
        'ending',
        'Ending',
        (question && loops ? 2 : question || loops ? 1 : 0) as 0 | 1 | 2,
        `${question ? 'Ends on a price question' : 'No question at the end'}; ${loops ? 'loops back to the start' : 'no loop'}.`,
        'End on "Would you pay $X/mo for this?" and loop back to frame 0.'
      )
    );
  }

  const total = rows.reduce((a, r) => a + r.score, 0);
  const lengthSec = sec(plan, plan.totalFrames);
  // Length rule: 30-50 s once there are 3+ clips (the teaser is short on purpose)
  const roomCount = new Set(plan.shots.map((s) => s.slotNumber)).size;
  const ruled = plan.length === 'full' && roomCount >= MIN_TOUR_CLIPS;
  const tooShort = ruled && lengthSec < MIN_TOUR_TOTAL_SEC;
  const tooLong = ruled && lengthSec > MAX_TOUR_TOTAL_SEC + 0.05;
  const usable = (slot: number) => {
    const c = clipOf(slot);
    const clean = c?.analysis?.clean;
    return clean ? clean.endSec - clean.startSec : c?.durationSec ?? 0;
  };
  const lengthRetakeSlots = tooShort
    ? [...new Set(plan.shots.map((s) => s.slotNumber))].sort((a, b) => usable(a) - usable(b)).slice(0, 2)
    : [];
  const lengthNote = tooShort
    ? `${lengthSec} s is too short: with ${roomCount} rooms a tour needs ${MIN_TOUR_TOTAL_SEC}-${MAX_TOUR_TOTAL_SEC} s. Film the shortest rooms again for the full 15 s, walking slowly, or add another room.`
    : tooLong
    ? `${lengthSec} s is over the ${MAX_TOUR_TOTAL_SEC} s limit.`
    : null;
  const lengthOk = !tooShort && !tooLong;
  return { total, max: MAX_SCORE, passed: total >= PASS_SCORE && lengthOk, rows, lengthSec, lengthOk, lengthNote, lengthRetakeSlots };
}

/**
 * Tries a few setting changes the editor can make on its own (another opening
 * room, the standard headline, the host's callout edits undone, a calmer pace)
 * and returns the one that grades best, or null when none beats the current
 * edit. `build` turns a settings patch into a plan (null when it can't).
 * Earlier candidates win ties, so the smallest change is preferred.
 */
export function bestGradeFix<P extends object>(
  current: PlanGrade,
  candidates: P[],
  build: (patch: P) => { plan: ViralEditPlan; grade: PlanGrade } | null
): { patch: P; grade: PlanGrade } | null {
  let best: { patch: P; grade: PlanGrade } | null = null;
  for (const patch of candidates) {
    const result = build(patch);
    if (!result) continue;
    if (result.grade.total > (best?.grade.total ?? current.total)) best = { patch, grade: result.grade };
  }
  return best;
}

/** The setting changes bestGradeFix tries, smallest first. */
export function gradeFixCandidates(slots: number[]): {
  hookSlot?: number | null;
  hookDraft?: null;
  tagEdits?: Record<number, string>;
  detailEdits?: Record<number, string>;
  pace?: 'relaxed';
}[] {
  return [
    { hookDraft: null },
    { tagEdits: {}, detailEdits: {} },
    { hookSlot: null },
    ...slots.map((s) => ({ hookSlot: s })),
    ...slots.map((s) => ({ hookSlot: s, hookDraft: null })),
    { pace: 'relaxed' as const },
    { hookDraft: null, tagEdits: {}, detailEdits: {}, hookSlot: null, pace: 'relaxed' as const },
  ];
}
