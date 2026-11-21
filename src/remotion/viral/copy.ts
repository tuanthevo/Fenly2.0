/**
 * On-screen copy for the viral tour: hooks, room callouts, end card and the
 * social caption. Pure functions, no DOM, so they are unit tested.
 *
 * Rules baked in here (see docs/viral-playbook.md for sources):
 * - The hook names the real price and place in the first frame
 *   ("What $1,450/mo gets you in Mission District" is the format renter
 *   videos go viral with).
 * - Callouts are 2-3 words so they can be read in about a second, with the
 *   sound off.
 * - No emoji in burned-in text (they render differently per device); emoji
 *   are fine in the caption.
 * - The end card asks a genuine question instead of "comment / share / tag",
 *   because Instagram says it won't recommend posts that explicitly ask for
 *   engagement.
 * - AI-written copy never describes who should live there (fair-housing
 *   advertising rules), see violatesFairHousing().
 */
import type { HookCopy, HookSegment, ViralListingInfo, ViralStyleId } from './types';

export const STYLE_INFO: Record<ViralStyleId, { label: string; blurb: string }> = {
  'price-hook': {
    label: 'Price hook',
    blurb: '“What $X gets you in…” opens on the price and the neighborhood.',
  },
  'guess-rent': {
    label: 'Guess the rent',
    blurb: 'Hides the price until the end, so people watch to the reveal and comment a guess.',
  },
  pov: {
    label: 'POV',
    blurb: 'Puts the viewer in the room: “You just found a $X room in…”.',
  },
};

const ROOM_NOUN: Record<string, string> = {
  'Private Room': 'room',
  'Master Suite': 'suite',
  'Studio Sublet': 'studio',
  'Shared Room': 'shared room',
  'Entire Place': 'place',
};

export function roomNoun(roomType?: string): string {
  return ROOM_NOUN[roomType ?? ''] ?? 'room';
}

export function formatRent(rent: number): string {
  const value = Number.isFinite(rent) && rent > 0 ? Math.round(rent) : 0;
  return `$${value.toLocaleString('en-US')}`;
}

export function priceLabel(rent: number): string {
  return `${formatRent(rent)}/mo`;
}

export function placeLabel(listing: ViralListingInfo): string {
  return (listing.neighborhood || listing.city || '').trim();
}

export function specsLine(listing: ViralListingInfo): string {
  const parts = [`${listing.beds} bd`, `${listing.baths} ba`];
  if (listing.squareFeet && listing.squareFeet > 0) {
    parts.push(`${Math.round(listing.squareFeet).toLocaleString('en-US')} sq ft`);
  }
  return parts.join(' · ');
}

const upper = (s: string) => s.toUpperCase();

function joinSegments(segments: HookSegment[]): string {
  return segments.map((s) => s.text).join('');
}

/** Default headline for each style, with the price and place highlighted. */
export function defaultHook(style: ViralStyleId, listing: ViralListingInfo): HookCopy {
  const price = priceLabel(listing.monthlyRent);
  const place = placeLabel(listing);
  const city = (listing.city || '').trim();
  const kicker = city ? `ROOM TOUR · ${upper(city)}` : 'ROOM TOUR';
  let segments: HookSegment[];
  switch (style) {
    case 'guess-rent':
      segments = [{ text: 'Guess the rent in ' }, { text: place, em: 'place' }];
      return { kicker, segments, text: joinSegments(segments) };
    case 'pov':
      segments = [
        { text: 'You just found a ' },
        { text: price, em: 'price' },
        { text: ` ${roomNoun(listing.roomType)} in ` },
        { text: place, em: 'place' },
      ];
      return { kicker: 'POV', segments, text: joinSegments(segments) };
    case 'price-hook':
    default:
      segments = [
        { text: 'What ' },
        { text: price, em: 'price' },
        { text: ' gets you in ' },
        { text: place, em: 'place' },
      ];
      return { kicker, segments, text: joinSegments(segments) };
  }
}

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const PRICE_RE = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?\/\s?(?:mo|month))?/i;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Turns free text (host-typed or AI) into a headline, highlighting the price
 * and the neighborhood when they appear.
 */
export function hookFromText(
  text: string,
  listing: ViralListingInfo,
  kicker?: string
): HookCopy {
  const clean = stripEmoji(text);
  const place = placeLabel(listing);
  const marks: { start: number; end: number; em: 'price' | 'place' }[] = [];
  const price = PRICE_RE.exec(clean);
  if (price) marks.push({ start: price.index, end: price.index + price[0].length, em: 'price' });
  if (place) {
    const at = clean.toLowerCase().indexOf(place.toLowerCase());
    if (at >= 0 && !marks.some((m) => at < m.end && at + place.length > m.start)) {
      marks.push({ start: at, end: at + place.length, em: 'place' });
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const segments: HookSegment[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start > cursor) segments.push({ text: clean.slice(cursor, m.start) });
    segments.push({ text: clean.slice(m.start, m.end), em: m.em });
    cursor = m.end;
  }
  if (cursor < clean.length) segments.push({ text: clean.slice(cursor) });
  const city = (listing.city || '').trim();
  return {
    kicker: kicker ?? (city ? `ROOM TOUR · ${upper(city)}` : 'ROOM TOUR'),
    segments,
    text: clean,
  };
}

export const MAX_HOOK_CHARS = 64;

/** Cleans a headline; returns null when it is empty or too long to read in ~2 s. */
export function sanitizeHookText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = stripEmoji(raw).replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!clean || clean.length > MAX_HOOK_CHARS) return null;
  return clean;
}

/** Bigger type for shorter hooks; the box is 900 px wide and 2-3 lines tall. */
export function hookFontSizeFor(text: string): number {
  const n = text.length;
  if (n <= 24) return 108;
  if (n <= 34) return 96;
  if (n <= 44) return 86;
  if (n <= 54) return 76;
  return 68;
}

export const MAX_TAG_CHARS = 22;

/** 2-3 word callout, no emoji, at most 22 characters. Returns '' when unusable. */
export function cleanTag(raw: string | null | undefined): string {
  if (!raw) return '';
  const words = stripEmoji(raw)
    .replace(/[^\p{L}\p{N}&/'+\- ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  let out = '';
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > MAX_TAG_CHARS) break;
    out = next;
  }
  return out;
}

const PERKS: [amenity: string, label: string][] = [
  ['In-Unit W/D', 'In-unit laundry'],
  ['Balcony', 'Private balcony'],
  ['Parking', 'Parking included'],
  ['Utilities Included', 'Utilities included'],
  ['Gym', 'Gym access'],
  ['Furnished', 'Fully furnished'],
  ['AC', 'Central AC'],
  ['Pet Friendly', 'Pet friendly'],
  ['High-Speed WiFi', 'Fast WiFi'],
  ['Transit Nearby', 'Near transit'],
];

/** Listing facts that can ride on a shot as a sage "fact" callout, in priority order. */
const AMENITY_FACTS: [amenity: string, label: string][] = [
  ['Utilities Included', 'Utilities included'],
  ['Furnished', 'Comes furnished'],
  ['High-Speed WiFi', 'Fast WiFi'],
  ['Transit Nearby', 'Near transit'],
  ['Pet Friendly', 'Pet friendly'],
  ['AC', 'Central AC'],
  ['Parking', 'Parking included'],
  ['In-Unit W/D', 'In-unit laundry'],
  ['Private Bath', 'Private bath'],
  ['Balcony', 'Private balcony'],
  ['Gym', 'Gym access'],
];

const countLabel = (value: number | string, noun: string): string => {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || String(value).trim() === '') return String(value ?? '').trim();
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
};

/** "1 bed · 1 bath" (or "Studio · 1 bath"). */
export function bedBathLabel(listing: ViralListingInfo): string {
  return [countLabel(listing.beds, 'bed'), countLabel(listing.baths, 'bath')].filter(Boolean).join(' · ');
}

/**
 * The answer to the hook, shown on the opener after the headline leaves (full
 * tour): beds and baths, size, and the best amenity no other callout uses.
 */
export function heroFacts(listing: ViralListingInfo, used: string[] = []): string[] {
  const taken = new Set(used.map((u) => u.toLowerCase()));
  const facts = [bedBathLabel(listing)];
  if (listing.squareFeet && listing.squareFeet > 0) {
    facts.push(`${Math.round(listing.squareFeet).toLocaleString('en-US')} sq ft`);
  }
  const extra = listingFacts(listing, [...taken]).at(0);
  if (extra) facts.push(extra);
  return facts.filter(Boolean).slice(0, 3);
}

/** "6 Months" -> "6-month lease", "Month-to-month" stays as is. */
export function leaseFact(listing: ViralListingInfo): string {
  const term = (listing.leaseTerm || '').trim();
  const m = /^(\d+\+?)\s*months?$/i.exec(term);
  if (m) return m[1].endsWith('+') ? `${m[1]} month lease` : `${m[1]}-month lease`;
  return /month.to.month/i.test(term) ? 'Month-to-month' : '';
}

/** Amenity facts, then the lease, minus anything another callout already says. */
export function listingFacts(listing: ViralListingInfo, used: string[] = []): string[] {
  const taken = new Set(used.map((u) => u.toLowerCase()));
  const lease = leaseFact(listing);
  return [...amenityFacts(listing, used), ...(lease && !taken.has(lease.toLowerCase()) ? [lease] : [])];
}

/** Amenity facts not already said by another callout, best first. */
export function amenityFacts(listing: ViralListingInfo, used: string[] = []): string[] {
  const taken = new Set(used.map((u) => u.toLowerCase()));
  return AMENITY_FACTS.filter(([amenity, label]) => listing.amenities.includes(amenity) && !taken.has(label.toLowerCase())).map(
    ([, label]) => label
  );
}

/** The standout perk for the closing shot, from the listing's amenities. */
export function pickPerk(amenities: string[]): string {
  for (const [amenity, label] of PERKS) {
    if (amenities.includes(amenity)) return label;
  }
  return 'The best part';
}

/** Default callout per guided shot slot (1 bedroom, 2 kitchen, 3 bath, 4 closet, 5 perk). */
export function defaultTags(listing: ViralListingInfo): Record<number, string> {
  const bedroom: Record<string, string> = {
    'Master Suite': 'Primary suite',
    'Studio Sublet': 'The studio',
    'Entire Place': 'Main bedroom',
    'Shared Room': 'Shared room',
  };
  return {
    1: bedroom[listing.roomType ?? ''] ?? 'Your room',
    2: 'Full kitchen',
    3: listing.amenities.includes('Private Bath') ? 'Private bath' : 'The bathroom',
    4: 'Closet space',
    5: pickPerk(listing.amenities),
  };
}

/**
 * Fair-housing guard for generated copy: ads must not say who should (or
 * should not) live somewhere. Applied to AI text; host-typed text only gets a
 * soft warning in the editor.
 */
const FAIR_HOUSING_PATTERNS: RegExp[] = [
  /\b(perfect|ideal|great|best|suited|made)\s+for\s+(an?\s+)?((quiet|working|busy|mature|responsible|clean|grad|graduate)\s+)?(young|single|singles|couple|couples|students?|professionals?|famil(y|ies)|kids|children|men|women|guys|girls|bachelors?|retirees?|seniors?|christians?|muslims?|jewish)\b/i,
  // Source of income (protected in California and San Francisco)
  /\b(no|not accepting|don't accept|do not accept)\s+(section\s*8|vouchers?|housing\s+assistance)\b/i,
  /\b(section\s*8|vouchers?)\s+(not\s+(accepted|allowed|welcome))\b/i,
  // National origin, disability, age
  /\b(english|spanish|chinese|native)\s+speakers?\s+only\b/i,
  /\b(able[- ]bodied|no\s+wheelchairs?)\b/i,
  /\bmature\s+(adults?|persons?|people|tenants?)\b/i,
  /\b(no|without)\s+(kids|children|families|babies)\b/i,
  /\b(adults?|singles?|couples?|men|women|males?|females?|christians?|muslims?)\s+only\b/i,
  /\b(only|just)\s+(adults?|singles?|couples?|men|women|males?|females?)\b/i,
];

export function violatesFairHousing(text: string): boolean {
  return FAIR_HOUSING_PATTERNS.some((re) => re.test(text));
}

/** The phrases that trip the fair-housing guard, as written, so the host can see what to change. */
export function fairHousingIssues(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const re of FAIR_HOUSING_PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const match of text.matchAll(global)) {
      const phrase = match[0].trim();
      if (!found.some((f) => f.toLowerCase() === phrase.toLowerCase())) found.push(phrase);
    }
  }
  return found;
}

export type EndCardCopy = { lead: string; big: string; tail: string; sub: string; brand: string };

export function endCardCopy(style: ViralStyleId, listing: ViralListingInfo): EndCardCopy {
  const place = placeLabel(listing);
  const sub = [place, specsLine(listing)].filter(Boolean).join(' · ');
  const brand = 'Tour it on Fenly';
  switch (style) {
    case 'guess-rent':
      return { lead: 'The rent is', big: priceLabel(listing.monthlyRent), tail: 'Did you guess it?', sub, brand };
    case 'pov':
      return { lead: 'Would you move in for', big: formatRent(listing.monthlyRent), tail: 'a month?', sub, brand };
    case 'price-hook':
    default:
      return { lead: 'Would you pay', big: priceLabel(listing.monthlyRent), tail: 'for this?', sub, brand };
  }
}

export function rehookText(style: ViralStyleId, closerIsPerk: boolean): string {
  if (style === 'guess-rent') return 'Price reveal at the end';
  return closerIsPerk ? 'Wait for the best part' : 'Wait for the last room';
}

const tagify = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

export function hashtagsFor(listing: ViralListingInfo): string[] {
  const roomTag: Record<string, string> = {
    'Entire Place': '#ApartmentForRent',
    'Studio Sublet': '#StudioApartment',
    'Master Suite': '#RoomForRent',
    'Private Room': '#RoomForRent',
    'Shared Room': '#RoomForRent',
  };
  const place = tagify(listing.neighborhood || '');
  const city = tagify(listing.city || '');
  const candidates = [
    place ? `#${place}` : '',
    city ? `#${city}Apartments` : '',
    roomTag[listing.roomType ?? ''] ?? '#RoomForRent',
    '#ApartmentTour',
    '#FennRentals',
    city ? `#${city}Rentals` : '#Rentals',
    '#HouseHunting',
  ].filter(Boolean);
  return Array.from(new Set(candidates)).slice(0, 5);
}

/**
 * 3 lines + 5 hashtags, as requested for TikTok, Reels, Shorts and Snapchat:
 * line 1 a price question people argue about, line 2 the specs, line 3 a soft
 * "know someone?" nudge (a question, not a "share this" command).
 */
export function buildSocialCaption(
  style: ViralStyleId,
  listing: ViralListingInfo,
  highlights: string[]
): string {
  const price = priceLabel(listing.monthlyRent);
  const place = placeLabel(listing);
  const noun = roomNoun(listing.roomType);
  const line1 =
    style === 'guess-rent'
      ? `Guess the rent for this ${noun} in ${place} 👀 Answer at the end.`
      : style === 'pov'
      ? `Is ${price} a steal or too much for ${place}?`
      : `Would you pay ${price} for this ${noun} in ${place}?`;
  const extras = highlights.filter(Boolean).slice(0, 2);
  const line2 = `📍 ${[place, listing.city].filter(Boolean).join(', ')} · ${[specsLine(listing), ...extras].join(' · ')}`;
  const line3 = `Know someone moving to ${listing.city || place}? Tour it on Fenly.`;
  return [line1, line2, line3, hashtagsFor(listing).join(' ')].join('\n');
}
