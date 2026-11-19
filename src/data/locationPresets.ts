/** Location presets for the 1.0 filters (moved out of FilterModal so the app shell doesn't load the modal). */
export interface LocationPreset {
  label: string;
  secondaryText: string;
  zip: string;
  city: string;
  neighborhood: string;
  coords: { lat: number; lng: number };
}

export const LOCATION_PRESETS: LocationPreset[] = [
  {
    label: 'San Francisco, CA',
    secondaryText: 'City • California',
    zip: '94102',
    city: 'San Francisco',
    neighborhood: '',
    coords: { lat: 37.7749, lng: -122.4194 },
  },
  {
    label: 'Mission District, San Francisco, CA 94110',
    secondaryText: 'Neighborhood & Zip • San Francisco, CA',
    zip: '94110',
    city: 'San Francisco',
    neighborhood: 'Mission District',
    coords: { lat: 37.7599, lng: -122.4148 },
  },
  {
    label: 'Hayes Valley, San Francisco, CA 94102',
    secondaryText: 'Neighborhood & Zip • San Francisco, CA',
    zip: '94102',
    city: 'San Francisco',
    neighborhood: 'Hayes Valley',
    coords: { lat: 37.7759, lng: -122.4245 },
  },
  {
    label: 'Marina District, San Francisco, CA 94123',
    secondaryText: 'Neighborhood & Zip • San Francisco, CA',
    zip: '94123',
    city: 'San Francisco',
    neighborhood: 'Marina District',
    coords: { lat: 37.8015, lng: -122.4368 },
  },
  {
    label: 'Dolores Heights / Castro, San Francisco, CA 94114',
    secondaryText: 'Neighborhood & Zip • San Francisco, CA',
    zip: '94114',
    city: 'San Francisco',
    neighborhood: 'Dolores Heights',
    coords: { lat: 37.7596, lng: -122.4269 },
  },
  {
    label: 'North Beach, San Francisco, CA 94133',
    secondaryText: 'Neighborhood & Zip • San Francisco, CA',
    zip: '94133',
    city: 'San Francisco',
    neighborhood: 'North Beach',
    coords: { lat: 37.8005, lng: -122.4101 },
  },
  {
    label: 'NoPa / Alamo Square, San Francisco, CA 94117',
    secondaryText: 'Neighborhood & Zip • San Francisco, CA',
    zip: '94117',
    city: 'San Francisco',
    neighborhood: 'NoPa',
    coords: { lat: 37.7755, lng: -122.4391 },
  },
  {
    label: 'Williamsburg, Brooklyn, NY 11211',
    secondaryText: 'Neighborhood & Zip • New York, NY',
    zip: '11211',
    city: 'New York',
    neighborhood: 'Williamsburg',
    coords: { lat: 40.7181, lng: -73.9571 },
  },
  {
    label: 'South Congress, Austin, TX 78704',
    secondaryText: 'Neighborhood & Zip • Austin, TX',
    zip: '78704',
    city: 'Austin',
    neighborhood: 'South Congress',
    coords: { lat: 30.249, lng: -97.7494 },
  },
  {
    label: 'Capitol Hill, Seattle, WA 98102',
    secondaryText: 'Neighborhood & Zip • Seattle, WA',
    zip: '98102',
    city: 'Seattle',
    neighborhood: 'Capitol Hill',
    coords: { lat: 47.6253, lng: -122.3222 },
  },
  {
    label: 'Logan Square, Chicago, IL 60647',
    secondaryText: 'Neighborhood & Zip • Chicago, IL',
    zip: '60647',
    city: 'Chicago',
    neighborhood: 'Logan Square',
    coords: { lat: 41.9231, lng: -87.7093 },
  },
  {
    label: 'Silver Lake, Los Angeles, CA 90026',
    secondaryText: 'Neighborhood & Zip • Los Angeles, CA',
    zip: '90026',
    city: 'Los Angeles',
    neighborhood: 'Silver Lake',
    coords: { lat: 34.0869, lng: -118.2702 },
  },
];
