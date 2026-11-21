/**
 * Scan frames for the viral copy pass (/api/viral/copy): a small frame about
 * every 1.2 s of each clip, so Gemini can say what's in view across the clip
 * and where a person is in shot. The editor then labels only footage that
 * shows the thing and skips footage with people in it.
 */
import type { FrameNote } from "../src/remotion/viral/types.js";

export const MAX_SCAN_FRAMES = 14;
const MAX_SCAN_B64 = 120_000;
const B64 = /^[A-Za-z0-9+/=]+$/;

export type ScanFrame = { t: number; jpegBase64: string };

/** The scan frames a request sent for one shot: valid times, small JPEGs, at most MAX_SCAN_FRAMES. */
export function scanFramesFrom(raw: unknown): ScanFrame[] {
  if (!Array.isArray(raw)) return [];
  const out: ScanFrame[] = [];
  for (const f of raw) {
    const t = Number((f as any)?.t);
    const data = (f as any)?.jpegBase64;
    if (!Number.isFinite(t) || t < 0 || t > 120) continue;
    if (typeof data !== "string" || data.length === 0 || data.length > MAX_SCAN_B64 || !B64.test(data)) continue;
    out.push({ t: Math.round(t * 100) / 100, jpegBase64: data });
    if (out.length >= MAX_SCAN_FRAMES) break;
  }
  return out;
}

/**
 * Gemini's notes, kept only for frames that were sent (matched by slot and time).
 * `cleanLabel` validates a label (length, fair housing) and returns undefined to drop it.
 */
export function parseFrameNotes(
  raw: unknown,
  sent: Record<number, ScanFrame[]>,
  cleanLabel: (text: unknown) => string | undefined
): Record<number, FrameNote[]> {
  const out: Record<number, FrameNote[]> = {};
  for (const r of Array.isArray(raw) ? raw : []) {
    const slot = Number((r as any)?.slotNumber);
    const frames = sent[slot];
    if (!frames) continue;
    const t = Number((r as any)?.t);
    const match = frames.find((f) => Math.abs(f.t - t) < 0.06);
    if (!match) continue;
    const list = (out[slot] ??= []);
    if (list.some((n) => n.t === match.t)) continue;
    const note: FrameNote = { t: match.t };
    const label = cleanLabel((r as any)?.label);
    if (label) note.label = label;
    if ((r as any)?.person === true) note.person = true;
    if ((r as any)?.blocked === true) note.blocked = true;
    list.push(note);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.t - b.t);
  return out;
}
