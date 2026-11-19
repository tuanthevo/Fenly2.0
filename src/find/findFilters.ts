/**
 * Find feed: the launch area, filters (area, max rent, move-in by) and the
 * adapter that turns a database listing into the 1.0 feed's RoomListing so the
 * existing VideoPlayer / overlays render it unchanged.
 *
 * Filters are logistics only (where, how much, when). factualApplicant.test.ts
 * checks FIND_FILTER_KEYS for protected traits.
 */
import type { RoomListing } from '../types';

export const LAUNCH_AREAS = ['Mission', 'Noe Valley', 'Bernal Heights'] as const;
export type LaunchArea = (typeof LAUNCH_AREAS)[number];

/** Next-door neighborhoods, for "similar rooms nearby". */
export const NEARBY_AREAS: Record<string, string[]> = {
  Mission: ['Noe Valley', 'Bernal Heights', 'Castro', 'Potrero Hill'],
  'Noe Valley': ['Mission', 'Castro', 'Glen Park', 'Bernal Heights'],
  'Bernal Heights': ['Mission', 'Noe Valley', 'Glen Park', 'Excelsior'],
};

export type FindFilters = {
  area: LaunchArea | null;
  maxRentCents: number | null;
  /** YYYY-MM-DD: rooms free on or before this date */
  moveInBy: string | null;
};

export const FIND_FILTER_KEYS: (keyof FindFilters)[] = ['area', 'maxRentCents', 'moveInBy'];
export const EMPTY_FIND_FILTERS: FindFilters = { area: null, maxRentCents: null, moveInBy: null };

/** "Mission District" and "mission" both count as Mission. */
export function launchAreaOf(neighborhood: string | null | undefined): LaunchArea | null {
  if (!neighborhood) return null;
  const n = neighborhood.trim().toLowerCase();
  return LAUNCH_AREAS.find((a) => n === a.toLowerCase() || n.startsWith(`${a.toLowerCase()} `)) ?? null;
}

/** Validates query-string filters; bad values are ignored rather than rejected. */
export function parseFindQuery(query: Record<string, unknown>): FindFilters {
  const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '');
  const area = LAUNCH_AREAS.find((a) => a.toLowerCase() === str(query.area).trim().toLowerCase()) ?? null;
  const rentDollars = Number(str(query.maxRent));
  const maxRentCents = Number.isFinite(rentDollars) && rentDollars >= 100 && rentDollars <= 20000 ? Math.round(rentDollars) * 100 : null;
  const by = str(query.moveInBy);
  const moveInBy = /^\d{4}-\d{2}-\d{2}$/.test(by) && !Number.isNaN(Date.parse(by)) ? by : null;
  return { area, maxRentCents, moveInBy };
}

export function findQueryString(filters: FindFilters): string {
  const params = new URLSearchParams();
  if (filters.area) params.set('area', filters.area);
  if (filters.maxRentCents != null) params.set('maxRent', String(Math.round(filters.maxRentCents / 100)));
  if (filters.moveInBy) params.set('moveInBy', filters.moveInBy);
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

export type FilterableRoom = { neighborhood: string | null; rentCents: number | null; availableFrom: string | null };

export function matchesFindFilters(room: FilterableRoom, filters: FindFilters): boolean {
  if (filters.area && launchAreaOf(room.neighborhood) !== filters.area) return false;
  if (filters.maxRentCents != null && (room.rentCents == null || room.rentCents > filters.maxRentCents)) return false;
  if (filters.moveInBy && room.availableFrom && room.availableFrom > filters.moveInBy) return false;
  return true;
}

export function activeFilterCount(filters: FindFilters): number {
  return FIND_FILTER_KEYS.filter((k) => filters[k] != null).length;
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
  amenities: string[];
  houseRules: string | null;
  status: 'published' | 'filled';
  videoUrl: string | null;
  thumbUrl: string | null;
  publishedAt: string | null;
  host: { id: string; firstName: string | null; photoUrl: string | null; phoneVerified: boolean; idVerified: boolean };
  housemates: { firstName: string | null; phoneVerified: boolean; idVerified: boolean }[];
};

const LEASE_TERM_MAP: Record<string, RoomListing['leaseTerm']> = {
  'month-to-month': 'Month-to-month',
  '3 months': '3 Months',
  '6 months': '6 Months',
  '12 months': '12+ Months',
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
    squareFeet: 0,
    amenities: l.amenities ?? [],
    videoUrl: l.videoUrl ?? '',
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
