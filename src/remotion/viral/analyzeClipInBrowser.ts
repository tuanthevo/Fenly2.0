/**
 * Samples a clip in the browser (6 frames per second, center 9:16 crop at
 * 72x128) and scores it with clipSignals.ts. Runs on the host's phone or
 * laptop: nothing is uploaded. Returns null when the browser cannot decode
 * the clip, and the edit falls back to default trims.
 */
import {
  DEFAULT_SAMPLE_FPS,
  SAMPLE_H,
  SAMPLE_W,
  analyzeSamples,
  computeFrameSignals,
  type FrameState,
} from './clipSignals';
import type { ClipAnalysis, ClipSample } from './types';

/** Long camera-roll clips: the analysis (and the AI scan) covers up to 20 s, so their later footage can be used */
const MAX_SECONDS = 20;
const LOAD_TIMEOUT_MS = 8000;
const SEEK_TIMEOUT_MS = 2500;

function once(target: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${event} timed out`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('video error'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };
    target.addEventListener(event, onEvent);
    target.addEventListener('error', onError);
  });
}

/**
 * Waiting for the presented frame matters on iOS Safari, where requestVideoFrameCallback
 * fires after a seek. Chrome draws the new frame as soon as 'seeked' fires and never
 * calls back for a paused seek, so after two misses we stop waiting (each miss costs
 * 120 ms; it used to make analysis take ~30 s for five clips).
 */
type FrameWait = { enabled: boolean; misses: number };

async function seek(video: HTMLVideoElement, t: number, frameWait: FrameWait): Promise<void> {
  if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) return;
  const seeked = once(video, 'seeked', SEEK_TIMEOUT_MS);
  video.currentTime = t;
  await seeked;
  const withFrameCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  if (frameWait.enabled && typeof withFrameCallback.requestVideoFrameCallback === 'function') {
    const result = await Promise.race([
      new Promise<'frame'>((resolve) => withFrameCallback.requestVideoFrameCallback!(() => resolve('frame'))),
      new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), 120)),
    ]);
    if (result === 'frame') frameWait.misses = 0;
    else if (++frameWait.misses >= 2) frameWait.enabled = false;
  }
}

export async function analyzeClipInBrowser(
  src: string,
  options: { sampleFps?: number; signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}
): Promise<ClipAnalysis | null> {
  const fps = options.sampleFps ?? DEFAULT_SAMPLE_FPS;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (/^https?:/i.test(src)) video.crossOrigin = 'anonymous';
  // iOS only decodes frames for videos that are in the document
  video.style.cssText = 'position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);
  try {
    const loaded = once(video, 'loadeddata', LOAD_TIMEOUT_MS);
    video.src = src;
    video.load();
    await loaded;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!duration || !vw || !vh) return null;

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // Downscale in two smoothed steps (1080 px -> 288 -> 72). A single drawImage to 72 px barely
    // filters, so wall and stucco texture alias into fake detail and a pillar or door edge stops
    // looking featureless. Two steps match the area-averaged samples the thresholds were tuned on.
    const mid = document.createElement('canvas');
    mid.width = SAMPLE_W * 4;
    mid.height = SAMPLE_H * 4;
    const midCtx = mid.getContext('2d');
    if (!ctx || !midCtx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    midCtx.imageSmoothingEnabled = true;
    midCtx.imageSmoothingQuality = 'high';

    // Center 9:16 crop: the part of the frame the feed shows (landscape clips get cropped)
    const target = 9 / 16;
    const sw = vw / vh > target ? vh * target : vw;
    const sh = vw / vh > target ? vh : vw / target;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    const usable = Math.min(duration, MAX_SECONDS);
    const count = Math.max(1, Math.floor(usable * fps));
    const samples: ClipSample[] = [];
    let prev: FrameState | null = null;
    const frameWait: FrameWait = { enabled: true, misses: 0 };
    for (let i = 0; i < count; i++) {
      if (options.signal?.aborted) return null;
      const t = Math.min(i / fps, Math.max(0, duration - 0.05));
      await seek(video, t, frameWait);
      midCtx.drawImage(video, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
      ctx.drawImage(mid, 0, 0, mid.width, mid.height, 0, 0, SAMPLE_W, SAMPLE_H);
      const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
      const { signals, state } = computeFrameSignals(data, prev);
      prev = state;
      samples.push({ t: Math.round((i / fps) * 1000) / 1000, ...signals });
      options.onProgress?.((i + 1) / count);
    }
    return analyzeSamples(samples, duration, { sampleFps: fps });
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}
