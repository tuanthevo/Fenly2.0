/**
 * Fenn's score: the ten rows of the audit rubric
 * (.claude/skills/fenly-viral-editor/references/audit.md), two points each,
 * worked out from an edit plan and the clip analysis. Pure, unit tested.
 *
 * It measures what a plan can show (copy, timing, speed, steadiness, exposure).
 * It cannot see the picture, so a real render is still audited by eye before a
 * rule changes; this number is Fenn's own check on each edit.
 */
import { FAST_MOTION, SHAKE_RETAKE } from './clipSignals';
import { buildViralEditPlan, changeFrames, NUMBER_READ_SEC, QUIET_MAX_SEC } from './plan';
import type { BuildViralPlanInput, BuildViralPlanOptions, ViralClipInput, ViralEditPlan } from './types';

export const FENN_PASS = 18;
/** A shot above this still looks handheld next to the steady ones (the host's closet clip measured 0.32) */
export const SHAKE_WEAK = 0.25;

export type FennRowId =
  | 'frame0'
  | 'hookCopy'
  | 'readability'
  | 'placement'
  | 'readingTime'
  | 'changeRate'
  | 'shots'
  | 'steadiness'
  | 'look'
  | 'ending';

export type FennRow = { id: FennRowId; label: string; points: 0 | 1 | 2; reason?: string };
export type FennFix = { slotNumber?: number; tip: string };
export type FennScore = { score: number; rows: FennRow[]; fix: FennFix | null };

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
/** The reading-time rule every on-screen text follows */
export function readSec(text: string): number {
  const w = words(text);
  return Math.max(0.8, 1.2 + 0.22 * w.length) + NUMBER_READ_SEC * w.filter((t) => /\d/.test(t)).length;
}
/** A label of 2-3 words is read at a glance: it passes at 80% of the full rule */
const READ_SLACK = 0.8;

const retakeTip = (room: string) => `Retake "${room}": feet planted, both hands on the phone, one slow move.`;

export function scoreEdit(plan: ViralEditPlan, clips: ViralClipInput[]): FennScore {
  const fps = plan.fps;
  const clipOf = (slot: number) => clips.find((c) => c.slotNumber === slot);
  const rows: FennRow[] = [];
  const fixes: Partial<Record<FennRowId, FennFix>> = {};
  const row = (id: FennRowId, label: string, points: 0 | 1 | 2, reason?: string, fix?: FennFix) => {
    rows.push(points === 2 ? { id, label, points } : { id, label, points, reason });
    if (points < 2 && fix) fixes[id] = fix;
  };
  const shots = plan.shots;
  /** Frames a shot is the picture on screen (the closer up to the end card) */
  const onScreenSec = (i: number) =>
    ((i < shots.length - 1 ? shots[i + 1].startFrame : plan.endCard.fromFrame) - shots[i].startFrame) / fps;

  // 1. Frame 0: the cover
  const opener = shots[0] ? clipOf(shots[0].slotNumber) : undefined;
  const a0 = opener?.analysis;
  const openerBad = a0?.warnings.some((w) => w.severity === 'retake' && (w.kind === 'dark' || w.kind === 'blank'));
  if (!a0) row('frame0', 'Opening frame', 1, 'The opening clip has not been checked yet.');
  else if (a0.quality >= 0.6 && !openerBad) row('frame0', 'Opening frame', 2);
  else
    row(
      'frame0',
      'Opening frame',
      a0.quality >= 0.35 && !openerBad ? 1 : 0,
      'The opening shot is dark or shows too little of the room.',
      { slotNumber: opener!.slotNumber, tip: `Retake "${opener!.room}" with every light on, facing into the room.` }
    );

  // 2. Hook copy: the rent and the place
  const hook = plan.hook.text;
  const hasPrice = plan.hidePriceUntilEnd || /\$\s?\d/.test(hook);
  const hasPlace = Boolean(plan.placeLabel) && hook.toLowerCase().includes(plan.placeLabel.toLowerCase());
  const short = hook.length <= 64;
  const hookPoints = hasPrice && hasPlace && short ? 2 : hasPrice || hasPlace ? 1 : 0;
  row(
    'hookCopy',
    'Headline',
    hookPoints,
    !short ? 'The headline is over 64 characters.' : `The headline is missing the ${hasPrice ? 'place' : 'rent'}.`,
    { tip: !short ? 'Shorten the headline to one line of rent and place.' : `Add the ${hasPrice ? 'neighborhood' : 'monthly rent'} to the headline.` }
  );

  // 3. Readability: text size (weight, outline and pills are fixed by the design)
  const scale = plan.textScale ?? 1;
  row('readability', 'Text size', scale >= 0.75 ? 2 : scale >= 0.6 ? 1 : 0, 'On-screen text is smaller than the video standard.');

  // 4. Placement: one text element arrives at a time
  const rehook = plan.rehook;
  const crowded = rehook
    ? shots.some((s) =>
        [s.tag ? s.tagInFrame : -1, ...s.callouts.map((c) => c.inFrame)]
          .filter((f) => f >= 0)
          .some((f) => Math.abs(s.startFrame + f - rehook.fromFrame) < Math.round(0.25 * fps))
      )
    : false;
  row('placement', 'One thing at a time', crowded ? 1 : 2, 'A label and "wait for the best part" arrive together.');

  // 5. Reading time
  let tight = 0;
  // The headline gates everything after it: one that cannot be read costs both points
  if (plan.hookExitFrame / fps < readSec(hook) * READ_SLACK) tight += 2;
  shots.forEach((s, i) => {
    const visibleEnd = Math.round(onScreenSec(i) * fps);
    if (s.role !== 'hook' && s.tag && (visibleEnd - s.tagInFrame) / fps < readSec(s.tag) * READ_SLACK) tight++;
    for (const c of s.callouts) if ((c.outFrame - c.inFrame) / fps < readSec(c.text) * READ_SLACK) tight++;
  });
  if (plan.endCard.durationInFrames / fps < 2.5) tight++;
  row('readingTime', 'Time to read', tight === 0 ? 2 : tight === 1 ? 1 : 0, `${tight} text${tight === 1 ? '' : 's'} leave before they can be read.`);

  // 6. Change rate
  const changes = changeFrames(plan);
  let gap = 0;
  for (let i = 1; i < changes.length; i++) gap = Math.max(gap, (changes[i] - changes[i - 1]) / fps);
  row('changeRate', 'Something new every 3 s', gap <= QUIET_MAX_SEC + 0.1 ? 2 : gap <= 4 ? 1 : 0, `${gap.toFixed(1)} s pass with nothing new on screen.`);

  // 7. Shots: real-time speed, and in the Fenn edit 3-5 s each
  const rateOk = shots.every((s) => s.playbackRate >= 1 - 1e-6 && s.playbackRate <= 1.15 + 1e-6 && s.rampFrames === 0);
  const offLength =
    plan.length === 'fenn' ? shots.map((s, i) => ({ s, sec: onScreenSec(i) })).filter(({ sec }) => sec < 3 - 0.05 || sec > 5 + 0.05) : [];
  const shortest = offLength.sort((x, y) => x.sec - y.sec)[0];
  row(
    'shots',
    'Slow shots of 3-5 s',
    !rateOk ? 0 : offLength.length === 0 ? 2 : offLength.length === 1 ? 1 : 0,
    !rateOk ? 'A shot is sped up or slowed down.' : `${offLength.length} shot${offLength.length === 1 ? ' is' : 's are'} outside 3-5 seconds.`,
    shortest && shortest.sec < 3
      ? { slotNumber: shortest.s.slotNumber, tip: `"${shortest.s.room}" has under 3 seconds of clear footage. Retake it and hold the full recording.` }
      : undefined
  );

  // 8. Steadiness and clear openings
  const seen = new Set<number>();
  const measured = shots
    .filter((s) => !seen.has(s.slotNumber) && seen.add(s.slotNumber))
    .map((s) => ({ s, clip: clipOf(s.slotNumber) }))
    .filter(({ clip }) => clip?.analysis)
    .map(({ s, clip }) => {
      const a = clip!.analysis!;
      const flagged = a.warnings.some((w) => w.severity === 'retake' && (w.kind === 'shaky' || w.kind === 'blank'));
      const shake = a.steady?.shake ?? 0;
      const fast = (a.steady?.meanMotion ?? 0) > FAST_MOTION;
      return { s, shake, bad: flagged || shake > SHAKE_RETAKE || fast, weak: shake > SHAKE_WEAK };
    });
  const bad = measured.filter((m) => m.bad);
  const weak = measured.filter((m) => m.weak || m.bad);
  const worst = [...weak].sort((x, y) => y.shake - x.shake)[0];
  row(
    'steadiness',
    'Steady camera',
    weak.length === 0 ? 2 : weak.length === 1 && bad.length === 0 ? 1 : 0,
    `${weak.length} shot${weak.length === 1 ? ' is' : 's are'} shaky or too fast.`,
    worst ? { slotNumber: worst.s.slotNumber, tip: retakeTip(worst.s.room) } : undefined
  );

  // 9. Look: no clip too dark to fix, and the rooms look like one home
  const dark = clips.filter(
    (c) => shots.some((s) => s.slotNumber === c.slotNumber) && c.analysis?.warnings.some((w) => w.kind === 'dark' && w.severity === 'retake')
  );
  const exposures = shots.map((s) => s.exposure);
  const spread = exposures.length ? Math.max(...exposures) - Math.min(...exposures) : 0;
  const lookLost = dark.length + (spread > 0.6 ? 1 : 0);
  row(
    'look',
    'Bright, even light',
    lookLost === 0 ? 2 : lookLost === 1 ? 1 : 0,
    dark.length ? `${dark.length} shot${dark.length === 1 ? ' is' : 's are'} too dark.` : 'Some rooms are much darker than others.',
    dark[0] ? { slotNumber: dark[0].slotNumber, tip: `Retake "${dark[0].room}" with every light on and the blinds open.` } : undefined
  );

  // 10. Ending: a real question, and a loop back to frame 0
  const card = plan.endCard;
  const question = [card.lead, card.big, card.tail].some((t) => t.includes('?'));
  const loop = plan.loopBridgeFrames > 0;
  row('ending', 'Question and loop', question && loop ? 2 : question || loop ? 1 : 0, question ? 'The video does not loop.' : 'The video does not end on a question.');

  const score = rows.reduce((a, r) => a + r.points, 0);
  // The fix that matters most: the footage first (only a retake fixes it), then the copy
  const order: FennRowId[] = ['frame0', 'steadiness', 'look', 'shots', 'hookCopy'];
  const lowest = order
    .filter((id) => fixes[id])
    .sort((x, y) => rows.find((r) => r.id === x)!.points - rows.find((r) => r.id === y)!.points)[0];
  return { score, rows, fix: score >= FENN_PASS || !lowest ? null : fixes[lowest]! };
}

/**
 * Builds the edit, scores it, and tries every other clip as the opener when the host
 * has not picked one; the highest score wins (the plain edit on a tie).
 */
export function bestFennEdit(input: BuildViralPlanInput, options: BuildViralPlanOptions = {}): { plan: ViralEditPlan; score: FennScore } {
  const plan = buildViralEditPlan(input, options);
  let best = { plan, score: scoreEdit(plan, input.clips) };
  if (options.hookSlotNumber != null || best.score.score >= 20) return best;
  const opener = plan.shots[0]?.slotNumber;
  const others = input.clips
    .filter((c) => c.slotNumber !== opener && c.analysis)
    .sort((x, y) => (y.analysis!.hookScore ?? 0) - (x.analysis!.hookScore ?? 0));
  for (const clip of others) {
    const candidate = buildViralEditPlan(input, { ...options, hookSlotNumber: clip.slotNumber });
    const score = scoreEdit(candidate, input.clips);
    if (score.score > best.score.score) best = { plan: candidate, score };
  }
  return best;
}
