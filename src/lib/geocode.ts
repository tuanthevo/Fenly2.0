/**
 * City, ZIP or address -> a Bay Area place, in the browser, with the Google Maps
 * JS Geocoder (the public, referrer-restricted VITE_GOOGLE_MAPS_API_KEY). Used to
 * pick a city/neighborhood in Fill and a search center in Find. What was typed is
 * never saved or sent to our API. Names and SF ZIPs resolve locally first
 * (src/geo/placeLookup.ts), so it works without a key for those.
 */
import { BAY_AREA_BOUNDS } from '../geo/bayArea';
import { lookupLocally, placeFromGeocode, type PlaceResult } from '../geo/placeLookup';

declare global {
  interface Window {
    google?: any;
    __fennMapsReady?: () => void;
  }
}

let loading: Promise<boolean> | null = null;

function loadMaps(key: string): Promise<boolean> {
  if (window.google?.maps?.importLibrary) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    window.__fennMapsReady = () => resolve(true);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__fennMapsReady`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return loading;
}

type AddressComponent = { long_name: string; short_name: string; types: string[] };

/** A typed city, neighborhood, ZIP or address -> found / outside the launch area / unknown. */
export async function lookupBayAreaPlace(text: string): Promise<PlaceResult> {
  const local = lookupLocally(text);
  if (local) return local;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key) return { kind: 'unknown' };
  try {
    if (!(await loadMaps(key))) return { kind: 'unknown' };
    const { Geocoder } = await window.google.maps.importLibrary('geocoding');
    const b = BAY_AREA_BOUNDS;
    const { results } = await new Geocoder().geocode({
      address: text.slice(0, 120),
      componentRestrictions: { country: 'US' },
      bounds: { south: b.south, west: b.west, north: b.north, east: b.east },
    });
    const top = results?.[0];
    if (!top) return { kind: 'unknown' };
    const parts: AddressComponent[] = top.address_components ?? [];
    const part = (...types: string[]) => parts.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? null;
    return placeFromGeocode({
      lat: top.geometry.location.lat(),
      lng: top.geometry.location.lng(),
      county: part('administrative_area_level_2'),
      locality: part('locality', 'postal_town'),
      neighborhood: part('neighborhood', 'sublocality_level_1', 'sublocality'),
    });
  } catch {
    return { kind: 'unknown' };
  }
}
