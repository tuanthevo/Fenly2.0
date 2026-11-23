import test from 'node:test';
import assert from 'node:assert/strict';
import { hasExif, hasGps, isJpeg, stripJpegMetadata } from './photoExif';

const bytes = (...parts: (number[] | Uint8Array | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : [...p])));
const segment = (marker: number, payload: Uint8Array) => bytes([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff], payload);

/** A little-endian TIFF with one IFD0 entry: the GPS IFD pointer (0x8825), then a GPS IFD with a latitude ref. */
const tiffWithGps = bytes(
  'II', [0x2a, 0x00], [8, 0, 0, 0],
  [1, 0], [0x25, 0x88, 4, 0, 1, 0, 0, 0, 26, 0, 0, 0], [0, 0, 0, 0],
  [1, 0], [1, 0, 2, 0, 2, 0, 0, 0], 'N', [0, 0, 0], [0, 0, 0, 0]
);
const tiffNoGps = bytes('II', [0x2a, 0x00], [8, 0, 0, 0], [1, 0], [0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0], [0, 0, 0, 0]);

const SOI = [0xff, 0xd8];
const JFIF = segment(0xe0, bytes('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0]));
const EXIF_GPS = segment(0xe1, bytes('Exif\0\0', tiffWithGps));
const XMP = segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>37.77,-122.41</x:xmpmeta>'));
const IPTC = segment(0xed, bytes('Photoshop 3.0\0', [1, 2, 3]));
const COMMENT = segment(0xfe, bytes('shot at home'));
const DQT = segment(0xdb, bytes([0, 1, 2, 3]));
// Scan data holds a stuffed FF 00 and ends with EOI: everything from SOS on must survive untouched
const SCAN = bytes(segment(0xda, bytes([1, 2, 3])), [0x11, 0xff, 0x00, 0x22, 0xff, 0xd9]);
const photo = bytes(SOI, JFIF, EXIF_GPS, XMP, IPTC, COMMENT, DQT, SCAN);

test('detects EXIF and GPS in a phone JPEG', () => {
  assert.equal(isJpeg(photo), true);
  assert.equal(hasExif(photo), true);
  assert.equal(hasGps(photo), true);
  assert.equal(hasGps(bytes(SOI, segment(0xe1, bytes('Exif\0\0', tiffNoGps)), DQT, SCAN)), false);
});

test('stripJpegMetadata removes EXIF, GPS, XMP, IPTC and comments, and keeps the picture', () => {
  const clean = stripJpegMetadata(photo);
  assert.equal(hasExif(clean), false);
  assert.equal(hasGps(clean), false);
  assert.deepEqual(clean, bytes(SOI, JFIF, DQT, SCAN));
  const text = String.fromCharCode(...clean);
  for (const leak of ['Exif', 'xmpmeta', '37.77', 'Photoshop', 'shot at home']) assert.equal(text.includes(leak), false, leak);
});

test('a file with no metadata comes back byte for byte', () => {
  const plain = bytes(SOI, JFIF, DQT, SCAN);
  assert.deepEqual(stripJpegMetadata(plain), plain);
});

test('anything that is not a JPEG is refused, never passed through', () => {
  assert.equal(isJpeg(bytes('GIF89a')), false);
  assert.throws(() => stripJpegMetadata(bytes('GIF89a')), /JPEG/);
  assert.throws(() => stripJpegMetadata(bytes(SOI, [0xff, 0xe1, 0xff, 0xff, 1, 2])), /JPEG/); // segment runs past the end
});
