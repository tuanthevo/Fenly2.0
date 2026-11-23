/**
 * Northern California places: every ZIP code and city (norcalZips.ts), so a
 * typed ZIP or city name resolves without a network lookup. Fenly's launch
 * focus is still the core Bay Area (bayArea.ts: regions, neighborhoods, launch
 * metrics); this is the wider area where a room can be listed and searched
 * (host's call, Nov 2026).
 *
 * Pure (no DOM, no network) so the server and the browser share it.
 */
import { NORCAL_ZIP_ROWS } from './norcalZips.js';

export type NorcalZip = { zip: string; city: string; lat: number; lng: number };
export type NorcalCity = { name: string; lat: number; lng: number };

/** California north of this latitude is Northern California (the 48-county line). */
export const NORCAL_MIN_LAT = 35.79;
export const NORCAL_BOUNDS = { south: NORCAL_MIN_LAT, north: 42.05, west: -124.6, east: -114 } as const;

/** Coordinates from a request are only trusted inside this box. */
export function inNorcalBounds(lat: number, lng: number): boolean {
  const b = NORCAL_BOUNDS;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[.']/g, '').replace(/\bsaint\b/g, 'st').replace(/\bmount\b/g, 'mt').replace(/\s+/g, ' ');

let zips: Map<string, NorcalZip> | null = null;
let cities: Map<string, NorcalCity> | null = null;

function load(): void {
  if (zips && cities) return;
  zips = new Map();
  const sums = new Map<string, { name: string; lat: number; lng: number; n: number }>();
  for (const line of NORCAL_ZIP_ROWS.split('\n')) {
    const [zip, city, lat, lng] = line.split('|');
    if (!zip || !city) continue;
    const row = { zip, city, lat: Number(lat), lng: Number(lng) };
    zips.set(zip, row);
    const key = norm(city);
    const sum = sums.get(key) ?? { name: city, lat: 0, lng: 0, n: 0 };
    sum.lat += row.lat;
    sum.lng += row.lng;
    sum.n++;
    sums.set(key, sum);
  }
  // A city's center: the middle of its ZIP codes
  cities = new Map([...sums].map(([key, s]) => [key, { name: s.name, lat: Math.round((s.lat / s.n) * 1000) / 1000, lng: Math.round((s.lng / s.n) * 1000) / 1000 }]));
}

/** A Northern California ZIP code ("95125" or "95125-1234"), or null. */
export function norcalZip(zip: string | null | undefined): NorcalZip | null {
  const five = /^\s*(\d{5})(-\d{4})?\s*$/.exec(zip ?? '')?.[1];
  if (!five) return null;
  load();
  return zips!.get(five) ?? null;
}

/** A Northern California city by name ("Sacramento", "santa cruz, CA"), or null. */
export function norcalCity(name: string | null | undefined): NorcalCity | null {
  if (!name) return null;
  const n = norm(name.replace(/,?\s*(ca|california)\s*$/i, ''));
  if (!n) return null;
  load();
  return cities!.get(n) ?? null;
}

/** ZIP prefixes used in Northern California (936-961); others are elsewhere, no lookup needed. */
export function zipCouldBeNorcal(zip: string): boolean {
  const prefix = Number(zip.slice(0, 3));
  return prefix >= 936 && prefix <= 961;
}

/** The Northern California city closest to a point, or null when none is within `maxMiles`. */
export function nearestNorcalCity(lat: number, lng: number, maxMiles = 15): NorcalCity | null {
  if (!inNorcalBounds(lat, lng)) return null;
  load();
  const milesPerLng = 69.17 * Math.cos((lat * Math.PI) / 180);
  let best: { c: NorcalCity; d: number } | null = null;
  for (const c of cities!.values()) {
    const d = Math.hypot((c.lat - lat) * 69.05, (c.lng - lng) * milesPerLng);
    if (!best || d < best.d) best = { c, d };
  }
  return best && best.d <= maxMiles ? best.c : null;
}

export function norcalCounts(): { zips: number; cities: number } {
  load();
  return { zips: zips!.size, cities: cities!.size };
}
