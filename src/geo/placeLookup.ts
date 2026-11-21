/**
 * Turns what someone typed (a city, a neighborhood, a ZIP or an address) into a
 * launch-area place. Pure rules; src/lib/geocode.ts does the Google Maps call
 * and hands its answer to placeFromGeocode().
 */
import { SF_ZIP_NEIGHBORHOOD, zipIn } from '../fill/zipNeighborhood';
import { BAY_AREA_COUNTIES, areaCenter, bayAreaCity, nearestArea, neighborhoodIn, placeByName } from './bayArea';

export type FoundPlace = {
  kind: 'found';
  city: string;
  /** One of our neighborhoods (SF, Oakland, Berkeley, San Jose), or null */
  neighborhood: string | null;
  /** How the place reads in a title: the neighborhood (ours or Google's), else the city */
  label: string;
  lat: number;
  lng: number;
};
export type PlaceResult = FoundPlace | { kind: 'outside' } | { kind: 'unknown' };

/** ZIP prefixes that can be in the launch area (940-951); anything else is turned away without a lookup. */
export function zipCouldBeBayArea(zip: string): boolean {
  const prefix = Number(zip.slice(0, 3));
  return prefix >= 940 && prefix <= 951;
}

/**
 * The answer we can give without the network: a city or neighborhood name, an
 * SF ZIP from our table, or a ZIP that is clearly elsewhere. `null` means "ask Maps".
 */
export function lookupLocally(text: string): PlaceResult | null {
  const typed = text.trim();
  if (!typed) return { kind: 'unknown' };
  const byName = placeByName(typed);
  if (byName) return { kind: 'found', city: byName.city, neighborhood: byName.neighborhood, label: byName.neighborhood ?? byName.city, lat: byName.lat, lng: byName.lng };
  const zip = zipIn(typed);
  if (zip && /^\d{5}$/.test(typed.replace(/-\d{4}$/, ''))) {
    if (!zipCouldBeBayArea(zip)) return { kind: 'outside' };
    const hood = SF_ZIP_NEIGHBORHOOD[zip];
    const center = hood ? areaCenter('San Francisco', hood) : null;
    if (hood && center) return { kind: 'found', city: 'San Francisco', neighborhood: hood, label: hood, lat: center.lat, lng: center.lng };
  }
  return null;
}

export type GeocodeAnswer = {
  lat: number;
  lng: number;
  /** administrative_area_level_2, e.g. "Alameda County" */
  county: string | null;
  /** locality, e.g. "Oakland" */
  locality: string | null;
  /** neighborhood or sublocality, e.g. "Temescal" */
  neighborhood: string | null;
};

/** A Maps answer -> a launch-area place, or outside when it's not in one of our counties. */
export function placeFromGeocode(g: GeocodeAnswer): PlaceResult {
  const county = (g.county ?? '').replace(/\s+County$/i, '').trim();
  if (!county || !(county in BAY_AREA_COUNTIES)) return { kind: 'outside' };
  const near = nearestArea(g.lat, g.lng, 8);
  const city = bayAreaCity(g.locality) ?? (near ? bayAreaCity(near.city) : null);
  if (!city) return { kind: 'unknown' };
  const named = neighborhoodIn(city, g.neighborhood);
  const neighborhood = named?.name ?? (near && near.city === city.name ? near.neighborhood : null);
  return {
    kind: 'found',
    city: city.name,
    neighborhood,
    label: neighborhood ?? (g.neighborhood && g.neighborhood.length <= 40 ? g.neighborhood : city.name),
    lat: g.lat,
    lng: g.lng,
  };
}
