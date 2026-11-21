/**
 * Optional Gemini copy pass. Grabs one 360x640 center-cropped JPEG per shot at
 * the cleanest moment the local analyzer found (best.startSec + 0.5 s), plus a
 * smaller scan frame about every 1.2 s of usable footage, and asks
 * /api/viral/copy for a hook, callouts, what's in view across each clip and
 * where a person is in shot. Only small stills are sent (never the clips), so
 * it stays far under Vercel's 4.5 MB body limit. Any failure resolves to null
 * and the edit keeps its local copy.
 */
import type { ClipAnalysis, ViralAiHints, ViralListingInfo } from './types';

const FRAME_W = 360;
const FRAME_H = 640;
const SCAN_W = 216;
const SCAN_H = 384;
const FRAME_TIMEOUT_MS = 6000;
/** Scan spacing and cap: 5 clips x 10 frames x ~12 KB stays well under the body limit */
export const SCAN_STEP_SEC = 1.2;
export const SCAN_MAX_FRAMES = 10;

/** Times (source seconds) to scan across the footage the editor may use. */
export function scanTimes(analysis: Pick<ClipAnalysis, 'durationSec' | 'clean' | 'best'> | null | undefined, durationSec: number): number[] {
  const from = Math.max(0, analysis?.clean?.startSec ?? 0);
  const to = Math.min(durationSec, Math.max(analysis?.clean?.endSec ?? durationSec, analysis?.best.endSec ?? 0));
  if (!(to > from)) return [];
  const count = Math.min(SCAN_MAX_FRAMES, Math.max(1, Math.round((to - from) / SCAN_STEP_SEC)));
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, k) => Math.round((from + step * (k + 0.5)) * 100) / 100);
}

function waitFor(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', start: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${event} timeout`)), FRAME_TIMEOUT_MS);
    video.addEventListener(event, () => { window.clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener('error', () => { window.clearTimeout(timer); reject(new Error('video error')); }, { once: true });
    start();
  });
}

/** Center-cropped 9:16 JPEGs (base64, no prefix) at each time; null where a frame failed. */
export async function grabFramesJpegBase64(src: string, times: number[], width = FRAME_W, height = FRAME_H): Promise<(string | null)[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  const out: (string | null)[] = times.map(() => null);
  try {
    await waitFor(video, 'loadeddata', () => { video.src = src; });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return out;
    for (let k = 0; k < times.length; k++) {
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : times[k] + 1;
        const t = Math.max(0, Math.min(times[k], Math.max(0, duration - 0.1)));
        await waitFor(video, 'seeked', () => { video.currentTime = t; });
        // Chrome can hand back the previous frame right after 'seeked'
        await new Promise((r) => window.setTimeout(r, 60));
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) continue;
        const target = width / height;
        let sw = vw;
        let sh = vh;
        if (vw / vh > target) sw = vh * target;
        else sh = vw / target;
        ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, width, height);
        out[k] = canvas.toDataURL('image/jpeg', 0.7).split(',')[1] || null;
      } catch {
        // keep going: one bad seek shouldn't lose the rest
      }
    }
    return out;
  } catch {
    return out;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export async function grabFrameJpegBase64(src: string, atSec: number): Promise<string | null> {
  return (await grabFramesJpegBase64(src, [atSec]))[0];
}

export async function fetchViralAiHints(
  listing: ViralListingInfo,
  shots: { slotNumber: number; room: string; src: string; atSec: number; scanSec?: number[] }[],
  signal?: AbortSignal
): Promise<ViralAiHints | null> {
  try {
    const frames = [];
    for (const shot of shots) {
      if (signal?.aborted) return null;
      const [best] = await grabFramesJpegBase64(shot.src, [shot.atSec]);
      const scanSec = (shot.scanSec ?? []).slice(0, SCAN_MAX_FRAMES);
      const scans = scanSec.length > 0 ? await grabFramesJpegBase64(shot.src, scanSec, SCAN_W, SCAN_H) : [];
      frames.push({
        slotNumber: shot.slotNumber,
        room: shot.room,
        jpegBase64: best ?? undefined,
        scan: scanSec.flatMap((t, k) => (scans[k] ? [{ t, jpegBase64: scans[k]! }] : [])),
      });
    }
    if (signal?.aborted) return null;
    const response = await fetch('/api/viral/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing, shots: frames }),
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { hints?: ViralAiHints };
    const hints = data?.hints;
    return hints && Object.keys(hints).length > 0 ? hints : null;
  } catch {
    return null;
  }
}
