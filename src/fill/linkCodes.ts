/**
 * Short, unguessable codes for tracked listing links: fenly.app/r/k3Fx9aQ2.
 * One code per listing per channel (listing_links), so a visit tells us where
 * the viewer came from.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const LINK_CODE_LENGTH = 8;
const CODE = /^[0-9A-Za-z]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * 8 base62 characters (~47 bits). Bytes >= 248 are skipped so every character is
 * equally likely (248 = 4 * 62). `source` is injectable for tests.
 */
export function generateLinkCode(source: (n: number) => Uint8Array = randomBytes): string {
  let code = '';
  while (code.length < LINK_CODE_LENGTH) {
    for (const byte of source(LINK_CODE_LENGTH * 2)) {
      if (byte >= 248) continue;
      code += ALPHABET[byte % 62];
      if (code.length === LINK_CODE_LENGTH) break;
    }
  }
  return code;
}

export function isLinkCode(value: unknown): value is string {
  return typeof value === 'string' && CODE.test(value);
}

export function isListingId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** https://fenly.app/r/<code>; the origin's trailing slashes are dropped. */
export function shareUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/r/${code}`;
}
