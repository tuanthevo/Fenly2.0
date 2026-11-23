/**
 * Browser side of photo listings: turns a photo the host took or picked into
 * the file that is uploaded, plus the numbers the instant checks need.
 *
 * Every photo is redrawn on a canvas and saved as a new JPEG (at most 2400 px,
 * 80% quality). Redrawing drops all metadata (EXIF with GPS, XMP, IPTC), and
 * stripJpegMetadata() runs on the result as a second guard. Pixels are only
 * resized: nothing is added, removed or "enhanced".
 */
import { ANALYSIS_LONG_SIDE, dHash, laplacianVariance, meanBrightness, type GrayImage } from '../fill/photoChecks';
import { stripJpegMetadata } from '../fill/photoExif';

export const UPLOAD_LONG_SIDE = 2400;
export const UPLOAD_QUALITY = 0.8;
/** Small copy sent to the AI assist (and shown in lists): keeps 12 photos well under Vercel's 4.5 MB body cap */
export const AI_THUMB_LONG_SIDE = 768;

export type ProcessedPhoto = {
  /** The JPEG to upload: resized, re-encoded, no metadata */
  blob: Blob;
  /** Object URL of `blob`, for previews and the tour (the caller revokes it) */
  url: string;
  width: number;
  height: number;
  /** Size of the photo as taken (the "too small" check uses this) */
  originalWidth: number;
  originalHeight: number;
  brightness: number;
  sharpness: number;
  phash: string;
  /** Base64 JPEG, at most AI_THUMB_LONG_SIDE px */
  thumbBase64: string;
};

type Drawable = ImageBitmap | HTMLImageElement;

async function decode(file: Blob): Promise<{ image: Drawable; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image: a phone photo saved sideways with a rotation tag comes out upright
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img>, which decodes a few formats createImageBitmap refuses
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } catch {
    throw new Error("That file couldn't be opened as a photo. Try a JPEG or take the photo again.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(image: Drawable, srcW: number, srcH: number, longSide: number, crop?: { x: number; y: number; w: number; h: number }) {
  const area = crop ?? { x: 0, y: 0, w: srcW, h: srcH };
  const scale = Math.min(1, longSide / Math.max(area.w, area.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.w * scale));
  canvas.height = Math.max(1, Math.round(area.h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: longSide <= ANALYSIS_LONG_SIDE })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, area.x, area.y, area.w, area.h, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function cleanJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't save that photo. Try again."))), 'image/jpeg', quality)
  );
  const bytes = stripJpegMetadata(new Uint8Array(await blob.arrayBuffer()));
  return new Blob([bytes as BlobPart], { type: 'image/jpeg' });
}

function toGray(ctx: CanvasRenderingContext2D, width: number, height: number): GrayImage {
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
  return { data, width, height };
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const src = await decode(file);
  try {
    const full = draw(src.image, src.width, src.height, UPLOAD_LONG_SIDE);
    const blob = await cleanJpeg(full.canvas, UPLOAD_QUALITY);
    const small = draw(src.image, src.width, src.height, ANALYSIS_LONG_SIDE);
    const gray = toGray(small.ctx, small.canvas.width, small.canvas.height);
    const thumb = draw(src.image, src.width, src.height, AI_THUMB_LONG_SIDE);
    return {
      blob,
      url: URL.createObjectURL(blob),
      width: full.canvas.width,
      height: full.canvas.height,
      originalWidth: src.width,
      originalHeight: src.height,
      brightness: meanBrightness(gray),
      sharpness: laplacianVariance(gray),
      phash: dHash(gray),
      thumbBase64: base64Of(thumb.canvas.toDataURL('image/jpeg', 0.72)),
    };
  } finally {
    src.close();
  }
}

/** The numbers for a photo already in Storage (a resumed draft), without re-encoding it. */
export async function describeSavedPhoto(file: Blob): Promise<Pick<ProcessedPhoto, 'thumbBase64' | 'width' | 'height'>> {
  const src = await decode(file);
  try {
    const thumb = draw(src.image, src.width, src.height, AI_THUMB_LONG_SIDE);
    return { width: src.width, height: src.height, thumbBase64: base64Of(thumb.canvas.toDataURL('image/jpeg', 0.72)) };
  } finally {
    src.close();
  }
}

/**
 * The listing's cover (link previews, the Find card before the tour loads): the
 * middle of the photo cropped to 9:16, 720 px wide. Real pixels only.
 */
export async function coverFromPhoto(file: Blob): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const src = await decode(file);
  try {
    const w = Math.min(src.width, Math.round((src.height * 9) / 16));
    const h = Math.min(src.height, Math.round((w * 16) / 9));
    const { canvas } = draw(src.image, src.width, src.height, 1280, { x: Math.round((src.width - w) / 2), y: Math.round((src.height - h) / 2), w, h });
    return { blob: await cleanJpeg(canvas, 0.82), dataUrl: canvas.toDataURL('image/jpeg', 0.82), width: canvas.width, height: canvas.height };
  } finally {
    src.close();
  }
}
