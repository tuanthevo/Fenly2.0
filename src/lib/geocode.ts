/**
 * Address -> map point in the browser with the Google Maps JS Geocoder (the
 * public, referrer-restricted VITE_GOOGLE_MAPS_API_KEY). Used only to pick a
 * neighborhood in Fill; the address is never saved or sent to our API.
 * Resolves null when there's no key, the script can't load, or nothing matches.
 */
type GeoPoint = { lat: number; lng: number; zip: string | null };

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

export async function geocodeSfAddress(address: string): Promise<GeoPoint | null> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key || !address.trim()) return null;
  try {
    if (!(await loadMaps(key))) return null;
    const { Geocoder } = await window.google.maps.importLibrary('geocoding');
    const { results } = await new Geocoder().geocode({
      address,
      componentRestrictions: { country: 'US', locality: 'San Francisco' },
    });
    const top = results?.[0];
    if (!top) return null;
    const zip = top.address_components?.find((c: { types: string[] }) => c.types.includes('postal_code'))?.short_name ?? null;
    return { lat: top.geometry.location.lat(), lng: top.geometry.location.lng(), zip };
  } catch {
    return null;
  }
}
