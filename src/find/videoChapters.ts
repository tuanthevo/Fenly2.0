/**
 * Room chapters of a tour video: where each shot starts, in seconds. Saved with
 * every export (from the edit plan) so the Find feed can jump room to room on a
 * left/right swipe. The video's own story bar has one segment per shot, so a
 * jump lands exactly on a segment boundary.
 */
import type { ViralEditPlan } from '../remotion/viral/types';

const MAX_CHAPTERS = 20;
const MAX_VIDEO_SEC = 180;

/** Shot start times of an edit plan, in seconds (the first is always 0). */
export function chaptersFromPlan(plan: Pick<ViralEditPlan, 'fps' | 'shots'>): number[] {
  return cleanChapters(plan.shots.map((s) => s.startFrame / plan.fps));
}

/** Untrusted chapter data (from the database) -> sorted, de-duplicated seconds, or [] when unusable. */
export function cleanChapters(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const secs = raw
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_VIDEO_SEC)
    .map((v) => Math.round(v * 100) / 100);
  const unique = [...new Set(secs)].sort((a, b) => a - b).slice(0, MAX_CHAPTERS);
  return unique.length >= 2 ? unique : [];
}

/** Within this much of a room's start, "back" goes to the room before it (like a music player's previous button). */
export const RESTART_GRACE_SEC = 1.5;

/**
 * Where a left/right swipe goes. 'next' = the next room's start, or null on the
 * last room. 'prev' = the start of this room, or of the previous room when it
 * just started.
 */
export function chapterJump(chapters: number[], currentSec: number, dir: 'next' | 'prev'): number | null {
  if (chapters.length < 2 || !Number.isFinite(currentSec)) return null;
  const t = currentSec + 0.05; // a frame of slack: just after a jump counts as inside that room
  if (dir === 'next') return chapters.find((c) => c > t) ?? null;
  const index = chapters.reduce((found, c, i) => (c <= t ? i : found), 0);
  const into = currentSec - chapters[index];
  return into > RESTART_GRACE_SEC ? chapters[index] : chapters[Math.max(0, index - 1)];
}
