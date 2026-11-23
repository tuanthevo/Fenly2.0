import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupLocally, placeFromGeocode, zipCouldBeBayArea } from './placeLookup';

test('names and Northern California ZIPs resolve without the network; ZIPs elsewhere are turned away', () => {
  assert.deepEqual(
    (({ kind, city, neighborhood, label }) => ({ kind, city, neighborhood, label }))(lookupLocally('Oakland') as any),
    { kind: 'found', city: 'Oakland', neighborhood: null, label: 'Oakland' }
  );
  assert.equal((lookupLocally('rockridge') as any).city, 'Oakland');
  assert.equal((lookupLocally('94110') as any).neighborhood, 'Mission');
  assert.deepEqual((({ city, neighborhood }) => ({ city, neighborhood }))(lookupLocally('94612') as any), { city: 'Oakland', neighborhood: 'Uptown' }, 'an Oakland ZIP finds Oakland and its nearest neighborhood');
  assert.equal(lookupLocally('123 Main St, Fremont'), null, 'an address goes to Maps');
  assert.deepEqual(lookupLocally('10001'), { kind: 'outside' });
  assert.deepEqual(lookupLocally('  '), { kind: 'unknown' });
  assert.ok(zipCouldBeBayArea('95112') && !zipCouldBeBayArea('95404') && !zipCouldBeBayArea('93101'));
});

test('a Maps answer is kept only in our 5 counties, mapped to our city and neighborhood', () => {
  const temescal = placeFromGeocode({ lat: 37.8355, lng: -122.2625, county: 'Alameda County', locality: 'Oakland', neighborhood: 'Temescal' });
  assert.deepEqual(temescal, { kind: 'found', city: 'Oakland', neighborhood: 'Temescal', label: 'Temescal', lat: 37.8355, lng: -122.2625 });
  // Google's neighborhood isn't one of ours: our nearest one is used, and it still reads well
  const fremont = placeFromGeocode({ lat: 37.5485, lng: -121.9886, county: 'Alameda County', locality: 'Fremont', neighborhood: 'Centerville' });
  assert.deepEqual(fremont, { kind: 'found', city: 'Fremont', neighborhood: null, label: 'Centerville', lat: 37.5485, lng: -121.9886 });
  // An unincorporated place maps to the nearest listed city
  const kensington = placeFromGeocode({ lat: 37.9105, lng: -122.2805, county: 'Contra Costa County', locality: 'Kensington', neighborhood: null });
  assert.equal(kensington.kind === 'found' && kensington.city, 'El Cerrito');
  // Marin, Sonoma and anything else are outside the launch area
  assert.deepEqual(placeFromGeocode({ lat: 37.9735, lng: -122.5311, county: 'Marin County', locality: 'San Rafael', neighborhood: null }), { kind: 'outside' });
  assert.deepEqual(placeFromGeocode({ lat: 40.7, lng: -74, county: null, locality: 'New York', neighborhood: null }), { kind: 'outside' });
});
