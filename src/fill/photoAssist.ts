/**
 * What the AI may suggest for a photo listing, and the filter every suggestion
 * passes before the host sees it (pure; used by server/photoRoutes.ts).
 *
 * The AI only reads the host's photos: it orders them, writes two short
 * callouts per photo, suggests facts it can see, and flags photos that may show
 * a face, mail or other personal details. It never edits or generates a picture.
 * Nothing here is published until the host has checked it.
 */
import { cleanTag, fairHousingIssues, stripEmoji, violatesFairHousing } from '../remotion/viral/copy.js';

export const PHOTO_PRIVACY_FLAGS = ['face', 'mail', 'personal'] as const;
export type PhotoPrivacyFlag = (typeof PHOTO_PRIVACY_FLAGS)[number];

export const PRIVACY_FLAG_TEXT: Record<PhotoPrivacyFlag, string> = {
  face: "This photo may show a person's face.",
  mail: 'This photo may show mail or a document with a name or address.',
  personal: 'This photo may show personal details, like a screen or a family photo.',
};

export type PhotoAssist = {
  /** Every photo id once, in tour order */
  order: string[];
  /** id -> "Room label" or "Room label, second callout" */
  captions: Record<string, string>;
  flags: Record<string, PhotoPrivacyFlag[]>;
  facts: { squareFeet: number | null; furnished: boolean | null; notes: string[] };
};

/** A short callout from the model's text. The whole text is checked first: shortening it could cut the unsafe words off. */
const callout = (raw: unknown): string => {
  if (typeof raw !== 'string' || violatesFairHousing(raw)) return '';
  const tag = cleanTag(raw);
  return violatesFairHousing(tag) ? '' : tag;
};

export function sanitizePhotoAssist(raw: unknown, ids: readonly string[]): PhotoAssist {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const known = new Set(ids);

  const asked = Array.isArray(input.order) ? input.order.filter((id): id is string => typeof id === 'string' && known.has(id)) : [];
  const order = [...new Set([...asked, ...ids])];

  const captions: Record<string, string> = {};
  const flags: Record<string, PhotoPrivacyFlag[]> = {};
  for (const item of Array.isArray(input.photos) ? input.photos : []) {
    const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    if (typeof p.id !== 'string' || !known.has(p.id)) continue;
    const tag = callout(p.tag);
    const detail = callout(p.detail);
    const caption = [tag, detail.toLowerCase() === tag.toLowerCase() ? '' : detail].filter(Boolean).join(', ');
    if (caption) captions[p.id] = caption;
    const found = PHOTO_PRIVACY_FLAGS.filter((f) => Array.isArray(p.flags) && p.flags.includes(f));
    if (found.length) flags[p.id] = found;
  }

  const f = (input.facts && typeof input.facts === 'object' ? input.facts : {}) as Record<string, unknown>;
  const size = typeof f.squareFeet === 'number' && f.squareFeet >= 50 && f.squareFeet <= 1000 ? Math.round(f.squareFeet / 10) * 10 : null;
  const notes = (Array.isArray(f.notes) ? f.notes : [])
    .filter((n): n is string => typeof n === 'string')
    .map((n) => stripEmoji(n).slice(0, 60))
    .filter((n) => n.length >= 3 && n.length < 60 && !violatesFairHousing(n))
    .slice(0, 4);
  return {
    order,
    captions,
    flags,
    facts: { squareFeet: size, furnished: typeof f.furnished === 'boolean' ? f.furnished : null, notes },
  };
}

/** Fair-housing phrases in the captions a host typed or approved. */
export function captionIssues(captions: readonly (string | null | undefined)[]): string[] {
  return [...new Set(captions.flatMap((c) => fairHousingIssues(c)))];
}
