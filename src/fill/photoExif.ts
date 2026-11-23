/**
 * JPEG metadata guard for photo listings (pure bytes; no DOM).
 *
 * Phone photos carry EXIF (GPS position, device, time), XMP and IPTC blocks.
 * The browser re-encodes every photo through a canvas, which already drops
 * them; stripJpegMetadata() runs afterwards as a second guard, and hasExif /
 * hasGps let tests and checks prove an uploaded file is clean.
 */

const SOI = 0xd8;
const SOS = 0xda;
/** APP1 (EXIF, XMP), APP13 (IPTC / Photoshop) and COM (comments) are dropped; everything else is picture data. */
const DROPPED = new Set([0xe1, 0xed, 0xfe]);
const NOT_JPEG = 'Not a valid JPEG file';

type Segment = { marker: number; start: number; end: number };

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === SOI;
}

/** The header segments before the scan data; `scanStart` is where the picture itself begins. */
function readSegments(bytes: Uint8Array): { segments: Segment[]; scanStart: number } {
  if (!isJpeg(bytes)) throw new Error(NOT_JPEG);
  const segments: Segment[] = [];
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error(NOT_JPEG);
    const marker = bytes[at + 1];
    if (marker === SOS) return { segments, scanStart: at };
    if (at + 4 > bytes.length) throw new Error(NOT_JPEG);
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error(NOT_JPEG);
    segments.push({ marker, start: at, end });
    at = end;
  }
  throw new Error(NOT_JPEG);
}

function startsWith(bytes: Uint8Array, at: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

function exifSegments(bytes: Uint8Array): Segment[] {
  return readSegments(bytes).segments.filter((s) => s.marker === 0xe1 && startsWith(bytes, s.start + 4, 'Exif\0\0'));
}

export function hasExif(bytes: Uint8Array): boolean {
  return exifSegments(bytes).length > 0;
}

/** True when an EXIF block's first directory points at a GPS directory (tag 0x8825). */
export function hasGps(bytes: Uint8Array): boolean {
  for (const s of exifSegments(bytes)) {
    const tiff = s.start + 10;
    const little = bytes[tiff] === 0x49;
    const u16 = (o: number) => (little ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
    const u32 = (o: number) => (little ? u16(o) | (u16(o + 2) << 16) : (u16(o) << 16) | u16(o + 2)) >>> 0;
    const ifd = tiff + u32(tiff + 4);
    if (ifd + 2 > s.end) continue;
    const entries = u16(ifd);
    for (let i = 0; i < entries; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > s.end) break;
      if (u16(entry) === 0x8825) return true;
    }
  }
  return false;
}

/** The same picture without EXIF, GPS, XMP, IPTC or comments. Throws on anything that is not a JPEG. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const { segments, scanStart } = readSegments(bytes);
  const kept = segments.filter((s) => !DROPPED.has(s.marker));
  const size = 2 + kept.reduce((n, s) => n + (s.end - s.start), 0) + (bytes.length - scanStart);
  const out = new Uint8Array(size);
  out.set(bytes.subarray(0, 2), 0);
  let at = 2;
  for (const s of kept) {
    out.set(bytes.subarray(s.start, s.end), at);
    at += s.end - s.start;
  }
  out.set(bytes.subarray(scanStart), at);
  return out;
}
