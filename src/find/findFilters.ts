/**
 * Find feed: filters (a place and a radius, max rent, move-in by) and the
 * adapter that turns a database listing into the 1.0 feed's RoomListing so the
 * existing VideoPlayer / overlays render it unchanged.
 *
 * Filters are logistics only (where, how much, when). factualApplicant.test.ts
 * checks FIND_FILTER_KEYS for protected traits.
 */
import type { RoomListing } from '../types.js';
import { DEFAULT_RADIUS_MILES, RADIUS_MILES, areaCenter, distanceMiles } from '../geo/bayArea.js';
import { inNorcalBounds } from '../geo/norcal.js';

/** "Rooms within `miles` of `label`" (the point comes from the Maps lookup or our place list). */
export type FindNear = { label: string; lat: number; lng: number; miles: number };

export type FindFilters = {
  near: FindNear | null;
  /** Rent range the renter typed; either end may be open */
  minRentCents: number | null;
  maxRentCents: number | null;
  /** YYYY-MM-DD: rooms free on or before this date */
  moveInBy: string | null;
  /** Room features the renter needs (from MUST_HAVE_OPTIONS); a room must list every one */
  mustHave?: string[];
  /** Feed order: newest listing first (the default) or lowest rent first */
  sort?: FindSort;
};

export type FindSort = 'newest' | 'rent_low';
export const FIND_SORTS: { id: FindSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'rent_low', label: 'Lowest rent' },
];

/** Features of the room a renter can require. About the room only, never about people (fair housing). */
export const MUST_HAVE_OPTIONS = ['Private bath', 'Furnished', 'In-unit laundry', 'Parking', 'Pets OK'] as const;

export const FIND_FILTER_KEYS: (keyof FindFilters)[] = ['near', 'minRentCents', 'maxRentCents', 'moveInBy', 'mustHave', 'sort'];
export const EMPTY_FIND_FILTERS: FindFilters = { near: null, minRentCents: null, maxRentCents: null, moveInBy: null, mustHave: [], sort: 'newest' };

const MIN_RENT_DOLLARS = 100;
const MAX_RENT_DOLLARS = 20000;

/** A typed rent ("$1,450", "1450") -> cents; empty means no limit. */
export function rentInput(text: string): { cents: number | null; error?: string } {
  const digits = text.replace(/[^\d.]/g, '');
  if (!digits) return { cents: null };
  const dollars = Math.round(Number(digits));
  if (!Number.isFinite(dollars) || dollars < MIN_RENT_DOLLARS || dollars > MAX_RENT_DOLLARS) {
    return { cents: null, error: 'Enter a rent from $100 to $20,000.' };
  }
  return { cents: dollars * 100 };
}

/** The problem with a min/max pair, or null when it's fine (either end may be empty). */
export function rentRangeError(minCents: number | null, maxCents: number | null): string | null {
  return minCents != null && maxCents != null && minCents > maxCents ? 'Min rent is higher than max rent.' : null;
}

/** A place name safe to show and send: letters, digits, spaces and . , ' - only, at most 60 characters. */
export function cleanPlaceLabel(text: string): string {
  return text.replace(/[^\p{L}\p{N} .,'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Validates query-string filters; bad values are ignored rather than rejected. */
export function parseFindQuery(query: Record<string, unknown>): FindFilters {
  const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '');
  const lat = Number(str(query.lat));
  const lng = Number(str(query.lng));
  const milesIn = Number(str(query.miles));
  const label = cleanPlaceLabel(str(query.place));
  const near: FindNear | null =
    str(query.lat) && str(query.lng) && inNorcalBounds(lat, lng)
      ? {
          label: label || 'this area',
          lat: Math.round(lat * 1e4) / 1e4,
          lng: Math.round(lng * 1e4) / 1e4,
          miles: (RADIUS_MILES as readonly number[]).includes(milesIn) ? milesIn : DEFAULT_RADIUS_MILES,
        }
      : null;
  const rentCents = (v: unknown) => {
    const dollars = Number(str(v));
    return str(v) && Number.isFinite(dollars) && dollars >= MIN_RENT_DOLLARS && dollars <= MAX_RENT_DOLLARS ? Math.round(dollars) * 100 : null;
  };
  let minRentCents = rentCents(query.minRent);
  let maxRentCents = rentCents(query.maxRent);
  // Entered backwards: swap rather than show nothing
  if (minRentCents != null && maxRentCents != null && minRentCents > maxRentCents) [minRentCents, maxRentCents] = [maxRentCents, minRentCents];
  const by = str(query.moveInBy);
  const moveInBy = /^\d{4}-\d{2}-\d{2}$/.test(by) && !Number.isNaN(Date.parse(by)) ? by : null;
  const asked = str(query.has).split(',').map((s) => s.trim());
  const mustHave = MUST_HAVE_OPTIONS.filter((option) => asked.includes(option));
  const sort: FindSort = str(query.sort) === 'rent_low' ? 'rent_low' : 'newest';
  return { near, minRentCents, maxRentCents, moveInBy, mustHave, sort };
}

export function findQueryString(filters: FindFilters): string {
  const params = new URLSearchParams();
  if (filters.near) {
    params.set('place', filters.near.label);
    // 2 decimals (about half a mile): a typed address never reaches the server or its logs exactly
    params.set('lat', String(Math.round(filters.near.lat * 100) / 100));
    params.set('lng', String(Math.round(filters.near.lng * 100) / 100));
    params.set('miles', String(filters.near.miles));
  }
  if (filters.minRentCents != null) params.set('minRent', String(Math.round(filters.minRentCents / 100)));
  if (filters.maxRentCents != null) params.set('maxRent', String(Math.round(filters.maxRentCents / 100)));
  if (filters.moveInBy) params.set('moveInBy', filters.moveInBy);
  if (filters.mustHave?.length) params.set('has', filters.mustHave.join(','));
  if (filters.sort === 'rent_low') params.set('sort', 'rent_low');
  return params.toString();
}

/** Parses "Nov 1, 2026", "2026-11-01" or "Available Now" into YYYY-MM-DD (null if unknown). */
export function toIsoDate(text: string | null | undefined, today: string): string | null {
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/now|immediate/i.test(text)) return today;
  const t = Date.parse(`${text} UTC`);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export type FilterableRoom = { city: string | null; neighborhood: string | null; rentCents: number | null; availableFrom: string | null; amenities?: string[] | null };

/** Miles from the room's area (neighborhood or city center) to a point; null when we can't place the room. */
export function roomDistanceMiles(room: Pick<FilterableRoom, 'city' | 'neighborhood'>, point: { lat: number; lng: number }): number | null {
  const center = areaCenter(room.city, room.neighborhood);
  return center ? distanceMiles(center, point) : null;
}

export function matchesFindFilters(room: FilterableRoom, filters: FindFilters): boolean {
  if (filters.near) {
    const d = roomDistanceMiles(room, filters.near);
    if (d == null || d > filters.near.miles) return false;
  }
  if (filters.minRentCents != null && (room.rentCents == null || room.rentCents < filters.minRentCents)) return false;
  if (filters.maxRentCents != null && (room.rentCents == null || room.rentCents > filters.maxRentCents)) return false;
  if (filters.moveInBy && room.availableFrom && room.availableFrom > filters.moveInBy) return false;
  if (filters.mustHave?.some((feature) => !(room.amenities ?? []).includes(feature))) return false;
  return true;
}

/** Filters in use: the place, the rent range (once, min and/or max), the move-in date and the must-haves (once). */
export function activeFilterCount(filters: FindFilters): number {
  return [filters.near, filters.minRentCents ?? filters.maxRentCents, filters.moveInBy, filters.mustHave?.length ? true : null].filter((v) => v != null).length;
}

/** A published listing as GET /api/find returns it. */
export type FindListing = {
  id: string;
  title: string | null;
  description: string | null;
  neighborhood: string | null;
  city: string;
  rentCents: number | null;
  depositCents: number | null;
  availableFrom: string | null;
  leaseTerm: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet?: number | null;
  amenities: string[];
  houseRules: string | null;
  /** Room start times in the tour video (seconds); [] for videos made before they were saved */
  chapters?: number[];
  status: 'published' | 'filled';
  videoUrl: string | null;
  thumbUrl: string | null;
  publishedAt: string | null;
  host: { id: string; firstName: string | null; photoUrl: string | null; phoneVerified: boolean; idVerified: boolean };
  housemates: { firstName: string | null; phoneVerified: boolean; idVerified: boolean }[];
  /** 'photos' = a tour made from the host's photos; missing on rooms saved before photo listings */
  mediaType?: 'video' | 'photos';
  /** The host's photos in tour order (photo listings only) */
  photos?: { url: string; slot: string; caption: string | null; width: number | null; height: number | null }[];
};

/**
 * While the photo_listings flag is off, photo listings are an admin-only trial:
 * everyone else's Find feed is exactly the video-only feed.
 */
export function visibleMediaTypes<T extends { media_type?: string | null }>(rows: T[], canSeePhotoListings: boolean): T[] {
  return canSeePhotoListings ? rows : rows.filter((r) => r.media_type !== 'photos');
}

const LEASE_TERM_MAP: Record<string, RoomListing['leaseTerm']> = {
  'month-to-month': 'Month-to-month',
  '3 months': '3 Months',
  '6 months': '6 Months',
  '9 months': '9 Months',
  '12 months': '12+ Months',
  '12+ months': '12+ Months',
};

const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Database rooms are marked so the app knows to apply through Supabase. */
export const DB_ROOM_PREFIX = 'db:';
export const isDbRoomId = (id: string) => id.startsWith(DB_ROOM_PREFIX);
export const dbListingId = (roomId: string) => (isDbRoomId(roomId) ? roomId.slice(DB_ROOM_PREFIX.length) : null);

const PLACEHOLDER_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#EBF0EC"/><circle cx="20" cy="16" r="7" fill="#485B4A"/><rect x="8" y="26" width="24" height="12" rx="6" fill="#485B4A"/></svg>');

export function toRoomListing(l: FindListing, today: string): RoomListing {
  const area = l.neighborhood ?? l.city;
  const hostName = l.host.firstName?.trim() || 'Host';
  return {
    id: `${DB_ROOM_PREFIX}${l.id}`,
    title: l.title?.trim() || `Room in ${area}`,
    price: Math.round((l.rentCents ?? 0) / 100),
    deposit: Math.round((l.depositCents ?? 0) / 100),
    location: `${area}, ${l.city}`,
    neighborhood: area,
    city: l.city,
    roomType: 'Private Room',
    spaceCategory: 'room',
    leaseTerm: LEASE_TERM_MAP[(l.leaseTerm ?? '').toLowerCase()] ?? 'Month-to-month',
    availableDate: l.availableFrom ? (l.availableFrom <= today ? 'Available Now' : formatDay(l.availableFrom)) : 'Flexible',
    squareFeet: l.squareFeet ?? 0,
    amenities: l.amenities ?? [],
    videoUrl: l.videoUrl ?? '',
    videoChapters: l.chapters ?? [],
    mediaType: l.mediaType === 'photos' ? 'photos' : 'video',
    photos: l.photos ?? [],
    fallbackThumbnail: l.thumbUrl ?? '',
    tourFormat: 'viral_edit',
    audioTrack: { title: 'Original sound', artist: hostName },
    host: {
      id: l.host.id,
      name: hostName,
      avatar: l.host.photoUrl || PLACEHOLDER_AVATAR,
      verified: l.host.phoneVerified || l.host.idVerified,
      phoneVerified: l.host.phoneVerified,
      occupation: '',
      responseRate: '',
      rating: 0,
      bio: '',
      joinedDate: '',
    },
    roommates: l.housemates.map((m) => ({
      name: m.firstName?.trim() || 'Housemate',
      role: m.idVerified ? 'Housemate · ID verified' : m.phoneVerified ? 'Housemate · phone verified' : 'Housemate',
      avatar: PLACEHOLDER_AVATAR,
      vibe: '',
    })),
    houseRules: (l.houseRules ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean),
    likesCount: 0,
    savesCount: 0,
    commentsCount: 0,
    description: l.description ?? '',
  };
}
