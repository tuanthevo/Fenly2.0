/**
 * Turns what someone typed (a city, a neighborhood, a ZIP or an address) into a
 * launch-area place. Pure rules; src/lib/geocode.ts does the Google Maps call
 * and hands its answer to placeFromGeocode().
 */
import { SF_ZIP_NEIGHBORHOOD, zipIn } from '../fill/zipNeighborhood';
import { BAY_AREA_COUNTIES, areaCenter, bayAreaCity, nearestArea, neighborhoodIn, placeByName } from './bayArea';
import { inNorcalBounds, nearestNorcalCity, norcalCity, norcalZip, zipCouldBeNorcal } from './norcal';

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

/** Kept for callers that ask about the core Bay Area only (ZIP prefixes 940-951). */
export function zipCouldBeBayArea(zip: string): boolean {
  const prefix = Number(zip.slice(0, 3));
  return prefix >= 940 && prefix <= 951;
}

const found = (city: string, neighborhood: string | null, lat: number, lng: number, label?: string): FoundPlace => ({
  kind: 'found',
  city,
  neighborhood,
  label: label ?? neighborhood ?? city,
  lat,
  lng,
});

/** Our neighborhood nearest a point, when the point's city is one we list neighborhoods for. */
function neighborhoodAt(cityName: string, lat: number, lng: number): string | null {
  const near = nearestArea(lat, lng, 8);
  return near && near.city === cityName ? near.neighborhood : null;
}

/**
 * The answer we can give without the network: a city or neighborhood name, or
 * any Northern California ZIP code (norcal.ts), or a ZIP that is clearly
 * elsewhere. `null` means "ask Maps" (an address, or a ZIP not in our table).
 */
export function lookupLocally(text: string): PlaceResult | null {
  const typed = text.trim();
  if (!typed) return { kind: 'unknown' };
  const byName = placeByName(typed);
  if (byName) return found(byName.city, byName.neighborhood, byName.lat, byName.lng);
  const zip = zipIn(typed);
  if (zip && /^\d{5}$/.test(typed.replace(/-\d{4}$/, ''))) {
    // San Francisco ZIPs name their neighborhood
    const hood = SF_ZIP_NEIGHBORHOOD[zip];
    const center = hood ? areaCenter('San Francisco', hood) : null;
    if (hood && center) return found('San Francisco', hood, center.lat, center.lng);
    const row = norcalZip(zip);
    if (row) {
      // Launch-area cities keep their own spelling and, where we list them, the nearest neighborhood
      const city = bayAreaCity(row.city)?.name ?? row.city;
      return found(city, neighborhoodAt(city, row.lat, row.lng), row.lat, row.lng);
    }
    return zipCouldBeNorcal(zip) ? null : { kind: 'outside' };
  }
  const other = norcalCity(typed);
  if (other) return found(other.name, null, other.lat, other.lng);
  return null;
}

export type GeocodeAnswer = {
  lat: number;
  lng: number;
  /** administrative_area_level_2, e.g. "Alameda County" */
  county: string | null;
  /** administrative_area_level_1, e.g. "California" (missing in older callers: then only launch-area counties pass) */
  state?: string | null;
  /** locality, e.g. "Oakland" */
  locality: string | null;
  /** neighborhood or sublocality, e.g. "Temescal" */
  neighborhood: string | null;
};

/** A Maps answer -> a place in Northern California, or outside when it's elsewhere. */
export function placeFromGeocode(g: GeocodeAnswer): PlaceResult {
  const county = (g.county ?? '').replace(/\s+County$/i, '').trim();
  const inLaunchCounty = Boolean(county) && county in BAY_AREA_COUNTIES;
  const inNorcal = /^(california|ca)$/i.test((g.state ?? '').trim()) && inNorcalBounds(g.lat, g.lng);
  if (!inLaunchCounty && !inNorcal) return { kind: 'outside' };
  const near = nearestArea(g.lat, g.lng, 8);
  const launchCity = bayAreaCity(g.locality) ?? (inLaunchCounty && near ? bayAreaCity(near.city) : null);
  if (launchCity) {
    const named = neighborhoodIn(launchCity, g.neighborhood);
    const neighborhood = named?.name ?? (near && near.city === launchCity.name ? near.neighborhood : null);
    return found(launchCity.name, neighborhood, g.lat, g.lng, neighborhood ?? (g.neighborhood && g.neighborhood.length <= 40 ? g.neighborhood : launchCity.name));
  }
  const city = norcalCity(g.locality) ?? nearestNorcalCity(g.lat, g.lng);
  if (!city) return { kind: 'unknown' };
  return found(city.name, null, g.lat, g.lng, g.neighborhood && g.neighborhood.length <= 40 ? g.neighborhood : city.name);
}
