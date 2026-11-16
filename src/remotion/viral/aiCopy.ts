/**
 * Optional Gemini copy pass. Grabs one 360x640 center-cropped JPEG per shot at
 * the cleanest moment the local analyzer found (best.startSec + 0.5 s) and asks
 * /api/viral/copy for a hook, callouts and visual warnings. Only small stills
 * are sent (never the clips), so it stays far under Vercel's 4.5 MB body limit.
 * Any failure resolves to null and the edit keeps its local copy.
 */
import type { ViralAiHints, ViralListingInfo } from './types';

const FRAME_W = 360;
const FRAME_H = 640;
const FRAME_TIMEOUT_MS = 6000;

export async function grabFrameJpegBase64(src: string, atSec: number): Promise<string | null> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), FRAME_TIMEOUT_MS);
      video.addEventListener('loadeddata', () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
      video.addEventListener('error', () => {
        window.clearTimeout(timer);
        reject(new Error('video error'));
      }, { once: true });
      video.src = src;
    });
    const duration = Number.isFinite(video.duration) ? video.duration : atSec + 1;
    const t = Math.max(0, Math.min(atSec, Math.max(0, duration - 0.1)));
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('seek timeout')), FRAME_TIMEOUT_MS);
      video.addEventListener('seeked', () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
      video.currentTime = t;
    });
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Center-crop to 9:16
    const target = FRAME_W / FRAME_H;
    let sw = vw;
    let sh = vh;
    if (vw / vh > target) sw = vh * target;
    else sh = vw / target;
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, FRAME_W, FRAME_H);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    return dataUrl.split(',')[1] || null;
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export async function fetchViralAiHints(
  listing: ViralListingInfo,
  shots: { slotNumber: number; room: string; src: string; atSec: number }[],
  signal?: AbortSignal
): Promise<ViralAiHints | null> {
  try {
    const frames = [];
    for (const shot of shots) {
      if (signal?.aborted) return null;
      frames.push({
        slotNumber: shot.slotNumber,
        room: shot.room,
        jpegBase64: (await grabFrameJpegBase64(shot.src, shot.atSec)) ?? undefined,
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
