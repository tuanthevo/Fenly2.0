/**
 * Exports the edit to an MP4 in the host's browser with @remotion/web-renderer
 * (client-side rendering, stable since Remotion 4.0.491). No render server is
 * needed, so it works the same locally and on Vercel.
 *
 * Needs WebCodecs (Chrome 94+, Firefox 130+, Safari 26+) and clips the browser
 * can decode. Check with checkBrowserCanExport() first.
 *
 * Licensing: Remotion is free for individuals and companies of up to 3 people
 * ("free-license"). Bigger teams need a company license; put its PUBLIC key
 * in VITE_REMOTION_PUBLIC_LICENSE_KEY (client-side renders use the public key).
 */
import type { ViralEditPlan } from './types';

const LICENSE_KEY =
  (import.meta.env.VITE_REMOTION_PUBLIC_LICENSE_KEY as string | undefined) || 'free-license';

export type ExportCheck = { ok: true } | { ok: false; message: string };

export async function checkBrowserCanExport(plan: ViralEditPlan): Promise<ExportCheck> {
  try {
    const { canRenderMediaOnWeb } = await import('@remotion/web-renderer');
    const result = await canRenderMediaOnWeb({
      width: plan.width,
      height: plan.height,
      container: 'mp4',
      videoCodec: 'h264',
    });
    if (result.canRender) return { ok: true };
    const reasons = result.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.message)
      .join(' ');
    return { ok: false, message: reasons || 'This browser can’t export video. Try Chrome or Safari 26+.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Export is not available here.' };
  }
}

export async function exportViralVideo(
  plan: ViralEditPlan,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<Blob> {
  const [{ renderMediaOnWeb }, { FenlyViralTour }] = await Promise.all([
    import('@remotion/web-renderer'),
    import('./FenlyViralTour'),
  ]);
  const { getBlob } = await renderMediaOnWeb({
    composition: {
      id: 'FenlyViralTour',
      component: FenlyViralTour,
      durationInFrames: plan.totalFrames,
      fps: plan.fps,
      width: plan.width,
      height: plan.height,
      defaultProps: { plan },
    },
    inputProps: { plan },
    container: 'mp4',
    videoCodec: 'h264',
    videoBitrate: 'high',
    onProgress: ({ progress }) => options.onProgress?.(progress),
    signal: options.signal,
    licenseKey: LICENSE_KEY,
    isProduction: import.meta.env.PROD,
  });
  return getBlob();
}

export function videoFileName(plan: ViralEditPlan): string {
  const place = plan.placeLabel.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `fenn-tour-${place || 'listing'}.mp4`;
}

/**
 * Opens the phone's share sheet with the MP4 (TikTok, Instagram, YouTube,
 * Snapchat… appear there) after copying the caption, or downloads it where
 * sharing files is not supported.
 */
export async function shareOrDownloadVideo(
  blob: Blob,
  fileName: string,
  caption: string
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  try {
    await navigator.clipboard?.writeText(caption);
  } catch {
    // Clipboard can be blocked; the caption box still has a copy button
  }
  const file = new File([blob], fileName, { type: 'video/mp4' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof navigator.share === 'function') {
    try {
      await navigator.share({ files: [file], title: 'Room tour' });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
