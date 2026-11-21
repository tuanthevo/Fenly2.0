/**
 * Fenly's launch area: the core Bay Area (San Francisco, the East Bay, the
 * Peninsula and the South Bay). Cities and, for the biggest ones, neighborhoods,
 * each with an approximate center. Centers drive the location pin, the Find
 * radius filter and "similar rooms nearby". Listings only ever store a city and
 * an optional neighborhood, never an address or coordinates.
 *
 * Pure (no DOM, no network) so the server and the browser share it.
 */
import { SF_NEIGHBORHOODS } from '../fill/neighborhoods.js';

export const BAY_AREA_REGIONS = ['San Francisco', 'East Bay', 'Peninsula', 'South Bay'] as const;
export type BayAreaRegion = (typeof BAY_AREA_REGIONS)[number];

/** County name (as Google Maps writes it, minus " County") -> region. Only these counties are in the launch area. */
export const BAY_AREA_COUNTIES: Record<string, BayAreaRegion> = {
  'San Francisco': 'San Francisco',
  Alameda: 'East Bay',
  'Contra Costa': 'East Bay',
  'San Mateo': 'Peninsula',
  'Santa Clara': 'South Bay',
};

export type Spot = { name: string; lat: number; lng: number };
export type BayAreaCity = Spot & { region: BayAreaRegion; neighborhoods?: Spot[] };

const OAKLAND: Spot[] = [
  { name: 'Downtown Oakland', lat: 37.803, lng: -122.272 },
  { name: 'Uptown', lat: 37.81, lng: -122.269 },
  { name: 'Lake Merritt', lat: 37.8016, lng: -122.2582 },
  { name: 'Grand Lake', lat: 37.812, lng: -122.247 },
  { name: 'Temescal', lat: 37.835, lng: -122.263 },
  { name: 'Rockridge', lat: 37.844, lng: -122.251 },
  { name: 'Piedmont Avenue', lat: 37.824, lng: -122.255 },
  { name: 'Jack London Square', lat: 37.795, lng: -122.278 },
  { name: 'West Oakland', lat: 37.813, lng: -122.295 },
  { name: 'Fruitvale', lat: 37.775, lng: -122.224 },
  { name: 'Laurel', lat: 37.793, lng: -122.201 },
  { name: 'Montclair', lat: 37.827, lng: -122.211 },
];

const BERKELEY: Spot[] = [
  { name: 'Downtown Berkeley', lat: 37.87, lng: -122.268 },
  { name: 'Southside', lat: 37.866, lng: -122.256 },
  { name: 'Northside', lat: 37.877, lng: -122.26 },
  { name: 'North Berkeley', lat: 37.88, lng: -122.27 },
  { name: 'Elmwood', lat: 37.858, lng: -122.253 },
  { name: 'Claremont', lat: 37.856, lng: -122.24 },
  { name: 'West Berkeley', lat: 37.865, lng: -122.297 },
];

const SAN_JOSE: Spot[] = [
  { name: 'Downtown San Jose', lat: 37.3337, lng: -121.8907 },
  { name: 'Japantown', lat: 37.349, lng: -121.895 },
  { name: 'Willow Glen', lat: 37.303, lng: -121.899 },
  { name: 'Rose Garden', lat: 37.333, lng: -121.925 },
  { name: 'North San Jose', lat: 37.39, lng: -121.93 },
  { name: 'Berryessa', lat: 37.387, lng: -121.859 },
  { name: 'Evergreen', lat: 37.315, lng: -121.781 },
  { name: 'Almaden Valley', lat: 37.22, lng: -121.865 },
  { name: 'Cambrian', lat: 37.26, lng: -121.93 },
  { name: 'West San Jose', lat: 37.31, lng: -121.98 },
];

const city = (name: string, lat: number, lng: number, region: BayAreaRegion, neighborhoods?: Spot[]): BayAreaCity => ({
  name,
  lat,
  lng,
  region,
  ...(neighborhoods ? { neighborhoods } : null),
});

/** Cities by region, the big ones first. Centers are approximate. */
export const BAY_AREA_CITIES: BayAreaCity[] = [
  city('San Francisco', 37.7749, -122.4194, 'San Francisco', SF_NEIGHBORHOODS),
  // East Bay: Alameda County
  city('Oakland', 37.8044, -122.2712, 'East Bay', OAKLAND),
  city('Berkeley', 37.8716, -122.2727, 'East Bay', BERKELEY),
  city('Alameda', 37.7652, -122.2416, 'East Bay'),
  city('Albany', 37.8869, -122.2978, 'East Bay'),
  city('Emeryville', 37.8313, -122.2852, 'East Bay'),
  city('San Leandro', 37.7249, -122.1561, 'East Bay'),
  city('Castro Valley', 37.6941, -122.0864, 'East Bay'),
  city('Hayward', 37.6688, -122.0808, 'East Bay'),
  city('Union City', 37.5934, -122.0439, 'East Bay'),
  city('Fremont', 37.5485, -121.9886, 'East Bay'),
  city('Newark', 37.5297, -122.0402, 'East Bay'),
  city('Dublin', 37.7022, -121.9358, 'East Bay'),
  city('Pleasanton', 37.6624, -121.8747, 'East Bay'),
  city('Livermore', 37.6819, -121.768, 'East Bay'),
  // East Bay: Contra Costa County
  city('Richmond', 37.9358, -122.3477, 'East Bay'),
  city('El Cerrito', 37.9161, -122.3108, 'East Bay'),
  city('Orinda', 37.8771, -122.1797, 'East Bay'),
  city('Lafayette', 37.8858, -122.118, 'East Bay'),
  city('Walnut Creek', 37.9101, -122.0652, 'East Bay'),
  city('Pleasant Hill', 37.948, -122.0608, 'East Bay'),
  city('Concord', 37.978, -122.0311, 'East Bay'),
  city('Martinez', 38.0194, -122.1341, 'East Bay'),
  city('Danville', 37.8216, -121.9999, 'East Bay'),
  city('San Ramon', 37.7799, -121.978, 'East Bay'),
  city('Pittsburg', 38.028, -121.8847, 'East Bay'),
  city('Antioch', 38.0049, -121.8058, 'East Bay'),
  // Peninsula: San Mateo County
  city('Daly City', 37.6879, -122.4702, 'Peninsula'),
  city('South San Francisco', 37.6547, -122.4077, 'Peninsula'),
  city('Pacifica', 37.6138, -122.4869, 'Peninsula'),
  city('San Bruno', 37.6305, -122.4111, 'Peninsula'),
  city('Millbrae', 37.5985, -122.3872, 'Peninsula'),
  city('Burlingame', 37.5841, -122.3661, 'Peninsula'),
  city('San Mateo', 37.563, -122.3255, 'Peninsula'),
  city('Foster City', 37.5585, -122.2711, 'Peninsula'),
  city('Belmont', 37.5202, -122.2758, 'Peninsula'),
  city('San Carlos', 37.5072, -122.2605, 'Peninsula'),
  city('Redwood City', 37.4852, -122.2364, 'Peninsula'),
  city('Menlo Park', 37.453, -122.1817, 'Peninsula'),
  city('East Palo Alto', 37.4688, -122.1411, 'Peninsula'),
  city('Half Moon Bay', 37.4636, -122.4286, 'Peninsula'),
  // South Bay: Santa Clara County
  city('San Jose', 37.3382, -121.8863, 'South Bay', SAN_JOSE),
  city('Palo Alto', 37.4419, -122.143, 'South Bay'),
  city('Mountain View', 37.3861, -122.0839, 'South Bay'),
  city('Los Altos', 37.3852, -122.1141, 'South Bay'),
  city('Sunnyvale', 37.3688, -122.0363, 'South Bay'),
  city('Santa Clara', 37.3541, -121.9552, 'South Bay'),
  city('Cupertino', 37.323, -122.0322, 'South Bay'),
  city('Milpitas', 37.4323, -121.8996, 'South Bay'),
  city('Campbell', 37.2872, -121.95, 'South Bay'),
  city('Saratoga', 37.2638, -122.023, 'South Bay'),
  city('Los Gatos', 37.2358, -121.9624, 'South Bay'),
  city('Morgan Hill', 37.1305, -121.6544, 'South Bay'),
  city('Gilroy', 37.0058, -121.5683, 'South Bay'),
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The city by name ("oakland", "SF" and "San Francisco, CA" all work), or null outside the launch area. */
export function bayAreaCity(name: string | null | undefined): BayAreaCity | null {
  if (!name) return null;
  let n = norm(name).replace(/,?\s*(ca|california)$/, '');
  if (n === 'sf') n = 'san francisco';
  return BAY_AREA_CITIES.find((c) => norm(c.name) === n) ?? null;
}

/** A neighborhood in a city; "Mission District" counts as Mission. */
export function neighborhoodIn(c: BayAreaCity, name: string | null | undefined): Spot | null {
  if (!name || !c.neighborhoods) return null;
  const n = norm(name);
  // Exact, or with a generic ending. "Mission Bay" and "Mission Terrace" are other places, not Mission
  const base = n.replace(/\s+(district|neighborhood|area)$/, '');
  return c.neighborhoods.find((h) => norm(h.name) === n || norm(h.name) === base) ?? null;
}

/** Where a listing is, for distances: its neighborhood's center, else its city's. Null when unknown. */
export function areaCenter(cityName: string | null | undefined, neighborhood: string | null | undefined): Spot | null {
  const c = bayAreaCity(cityName);
  if (!c) return null;
  return neighborhoodIn(c, neighborhood) ?? c;
}

/** Straight-line distance in miles. */
export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type AreaPick = { city: string; neighborhood: string | null };

/**
 * The listed city (and neighborhood, where we list them) closest to a point,
 * or null when the point is not near any launch-area city (over ~5 miles out).
 */
export function nearestArea(lat: number, lng: number, maxCityMiles = 5): AreaPick | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = { lat, lng };
  let best: { c: BayAreaCity; d: number } | null = null;
  for (const c of BAY_AREA_CITIES) {
    const d = Math.min(distanceMiles(p, c), ...(c.neighborhoods ?? []).map((h) => distanceMiles(p, h)));
    if (!best || d < best.d) best = { c, d };
  }
  if (!best || best.d > maxCityMiles) return null;
  const hood = (best.c.neighborhoods ?? [])
    .map((h) => ({ h, d: distanceMiles(p, h) }))
    .sort((a, b) => a.d - b.d)[0];
  return { city: best.c.name, neighborhood: hood && hood.d <= 1.6 ? hood.h.name : null };
}

/**
 * A city or neighborhood typed by name ("Oakland", "temescal", "Mission"), for
 * when the Maps lookup is unavailable. A neighborhood name wins over a city of
 * the same name only when no city matches.
 */
export function placeByName(text: string): (AreaPick & Spot) | null {
  const c = bayAreaCity(text);
  if (c) return { city: c.name, neighborhood: null, name: c.name, lat: c.lat, lng: c.lng };
  for (const cc of BAY_AREA_CITIES) {
    const h = neighborhoodIn(cc, text);
    if (h && norm(h.name) === norm(text.replace(/\s+district$/i, ''))) return { city: cc.name, neighborhood: h.name, ...h };
  }
  return null;
}

/** "Temescal, Oakland" / "Fremont": how a place reads in a sentence. */
export function areaLabel(pick: AreaPick): string {
  return pick.neighborhood ? `${pick.neighborhood}, ${pick.city}` : pick.city;
}

/** Search radius choices for Find, in miles. */
export const RADIUS_MILES = [1, 3, 5, 10, 25] as const;
export const DEFAULT_RADIUS_MILES = 5;

/** The whole launch area roughly fits this box; used to sanity-check coordinates from requests. */
export const BAY_AREA_BOUNDS = { south: 36.85, north: 38.3, west: -122.65, east: -121.3 } as const;
export function inBayAreaBounds(lat: number, lng: number): boolean {
  const b = BAY_AREA_BOUNDS;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}
