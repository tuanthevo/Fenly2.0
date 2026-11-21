/**
 * San Francisco neighborhoods for the Fill details step, launch area first
 * (Mission, Noe Valley, Bernal Heights). Centers are approximate; they only
 * prefill the picker from the phone's location. Exact addresses are never stored.
 */
export type Neighborhood = { name: string; lat: number; lng: number };

export const SF_NEIGHBORHOODS: Neighborhood[] = [
  { name: 'Mission', lat: 37.7599, lng: -122.4148 },
  { name: 'Noe Valley', lat: 37.7502, lng: -122.4337 },
  { name: 'Bernal Heights', lat: 37.7389, lng: -122.4152 },
  { name: 'Castro', lat: 37.7609, lng: -122.435 },
  { name: 'Glen Park', lat: 37.7343, lng: -122.4338 },
  { name: 'Potrero Hill', lat: 37.7605, lng: -122.4009 },
  { name: 'Dogpatch', lat: 37.7577, lng: -122.3878 },
  { name: 'SoMa', lat: 37.7785, lng: -122.4056 },
  { name: 'Hayes Valley', lat: 37.7759, lng: -122.4245 },
  { name: 'Lower Haight', lat: 37.7718, lng: -122.4316 },
  { name: 'Haight-Ashbury', lat: 37.7692, lng: -122.4481 },
  { name: 'Inner Sunset', lat: 37.7602, lng: -122.4695 },
  { name: 'Outer Sunset', lat: 37.7553, lng: -122.4945 },
  { name: 'Inner Richmond', lat: 37.7802, lng: -122.4645 },
  { name: 'Outer Richmond', lat: 37.7778, lng: -122.4951 },
  { name: 'Excelsior', lat: 37.7244, lng: -122.4272 },
  { name: 'Western Addition', lat: 37.7811, lng: -122.4353 },
  { name: 'Nob Hill', lat: 37.793, lng: -122.4161 },
  { name: 'North Beach', lat: 37.8061, lng: -122.4103 },
  { name: 'Marina', lat: 37.8015, lng: -122.4368 },
];

/** Closest neighborhood within ~2.5 km, or null (outside the city, or a bad fix). */
export function nearestNeighborhood(lat: number, lng: number, maxKm = 2.5): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let best: { name: string; km: number } | null = null;
  for (const n of SF_NEIGHBORHOODS) {
    const dLat = toRad(n.lat - lat);
    const dLng = toRad(n.lng - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(n.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (!best || km < best.km) best = { name: n.name, km };
  }
  return best && best.km <= maxKm ? best.name : null;
}

export const FILL_AMENITIES = [
  'Private bath',
  'In-unit laundry',
  'Laundry in building',
  'Furnished',
  'Utilities included',
  'Fast WiFi',
  'Backyard',
  'Balcony',
  'Parking',
  'Bike storage',
  'Dishwasher',
  'Near BART/Muni',
  'Pets OK',
];

export { LEASE_TERMS, leaseTermOptions } from './leaseTerms.js';
