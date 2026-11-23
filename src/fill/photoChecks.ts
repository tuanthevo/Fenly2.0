/**
 * Instant photo checks for photo listings (pure math on grayscale pixels; the
 * browser wrapper in src/lib/photoProcess.ts feeds it a small copy of the photo).
 * Every check is a warning with a Retake button; none blocks the host.
 */

export type GrayImage = { data: ArrayLike<number>; width: number; height: number };

/**
 * Limits. Brightness is the 0-255 mean; sharpness is the variance of the
 * Laplacian measured on a copy ANALYSIS_LONG_SIDE px long (the number depends
 * on that size, so keep the two together).
 */
export const ANALYSIS_LONG_SIDE = 512;
export const PHOTO_LIMITS = {
  minBrightness: 55,
  minSharpness: 45,
  minLongSide: 1280,
  /** dHash bits (of 64) that may differ and still count as the same picture */
  duplicateDistance: 6,
} as const;

export function meanBrightness(image: GrayImage): number {
  const n = image.width * image.height;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += image.data[i];
  return sum / n;
}

/** Variance of the 4-neighbour Laplacian: low when nothing in the picture has a crisp edge. */
export function laplacianVariance(image: GrayImage): number {
  const { data, width: w, height: h } = image;
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Difference hash: the picture shrunk to 9x8 blocks, one bit per block that is
 * brighter than its right-hand neighbour. 16 hex characters; survives resizing,
 * recompression and exposure changes.
 */
export function dHash(image: GrayImage): string {
  const { data, width: w, height: h } = image;
  const cols = 9;
  const rows = 8;
  const cell = new Array<number>(cols * rows).fill(0);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r * h) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * h) / rows));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * w) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * w) / cols));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < h; y++) for (let x = x0; x < x1 && x < w; x++, n++) sum += data[y * w + x];
      cell[r * cols + c] = n ? sum / n : 0;
    }
  }
  let hex = '';
  for (let r = 0; r < rows; r++) {
    let byte = 0;
    for (let c = 0; c < cols - 1; c++) byte = (byte << 1) | (cell[r * cols + c] > cell[r * cols + c + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let bits = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

export type PhotoWarningId = 'dark' | 'blurry' | 'small' | 'portrait' | 'duplicate';
export type PhotoWarning = { id: PhotoWarningId; text: string };

export const PHOTO_WARNING_TEXT: Record<PhotoWarningId, string> = {
  dark: 'Turn on more lights or open the blinds.',
  blurry: 'Hold still and tap to focus.',
  small: 'Use your camera instead of a screenshot.',
  portrait: 'Turn your phone sideways for a wider view.',
  duplicate: 'This looks like a photo you already added. Try a different angle.',
};

export type PhotoCheckInput = {
  brightness: number;
  sharpness: number;
  /** Size of the original photo, in pixels */
  width: number;
  height: number;
  /** One of the four required shots (portrait only warns on those) */
  required: boolean;
  phash: string;
  /** Hashes of the listing's other photos */
  otherHashes: readonly string[];
};

export function photoWarnings(input: PhotoCheckInput): PhotoWarning[] {
  const ids: PhotoWarningId[] = [];
  if (input.brightness < PHOTO_LIMITS.minBrightness) ids.push('dark');
  if (input.sharpness < PHOTO_LIMITS.minSharpness) ids.push('blurry');
  if (Math.max(input.width, input.height) < PHOTO_LIMITS.minLongSide) ids.push('small');
  if (input.required && input.height > input.width) ids.push('portrait');
  if (input.otherHashes.some((h) => hammingDistance(h, input.phash) <= PHOTO_LIMITS.duplicateDistance)) ids.push('duplicate');
  return ids.map((id) => ({ id, text: PHOTO_WARNING_TEXT[id] }));
}
