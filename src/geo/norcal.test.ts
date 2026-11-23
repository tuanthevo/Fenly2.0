import test from 'node:test';
import assert from 'node:assert/strict';
import { inNorcalBounds, nearestNorcalCity, norcalCity, norcalCounts, norcalZip, zipCouldBeNorcal } from './norcal';
import { lookupLocally, placeFromGeocode } from './placeLookup';
import { areaCenter, serviceCity } from './bayArea';

test('the table holds Northern California: over 1,300 ZIP codes and 750 cities', () => {
  const n = norcalCounts();
  assert.ok(n.zips > 1300 && n.cities > 750, JSON.stringify(n));
});

test('ZIP codes resolve to their city, from the Bay Area to Redding, Fresno and Tahoe', () => {
  for (const [zip, city] of [['94536', 'Fremont'], ['95125', 'San Jose'], ['95814', 'Sacramento'], ['96001', 'Redding'], ['93721', 'Fresno'], ['95060', 'Santa Cruz'], ['96150', 'South Lake Tahoe'], ['94954', 'Petaluma']]) {
    assert.equal(norcalZip(zip)?.city, city, zip);
  }
  assert.equal(norcalZip('95125-1234')?.city, 'San Jose');
  assert.equal(norcalZip('90210'), null, 'Beverly Hills is Southern California');
  assert.equal(norcalZip('10001'), null);
  assert.equal(norcalZip('abc'), null);
  assert.ok(zipCouldBeNorcal('95125') && !zipCouldBeNorcal('90210') && !zipCouldBeNorcal('10001'));
});

test('cities resolve by name, however they are typed', () => {
  assert.equal(norcalCity('sacramento')?.name, 'Sacramento');
  assert.equal(norcalCity('Santa Cruz, CA')?.name, 'Santa Cruz');
  assert.equal(norcalCity('Saint Helena')?.name, norcalCity('St. Helena')?.name);
  assert.equal(norcalCity('Los Angeles'), null);
  const sac = norcalCity('Sacramento')!;
  assert.ok(Math.abs(sac.lat - 38.58) < 0.15 && Math.abs(sac.lng + 121.49) < 0.15, JSON.stringify(sac));
  assert.equal(nearestNorcalCity(38.58, -121.49)?.name, 'Sacramento');
  assert.equal(nearestNorcalCity(34.05, -118.24), null, 'Los Angeles is outside');
  assert.ok(inNorcalBounds(40.56, -122.41) && !inNorcalBounds(34.05, -118.24));
});

test('a typed ZIP or city is found without the network', () => {
  const fremont = lookupLocally('94536');
  assert.deepEqual(fremont && fremont.kind === 'found' ? [fremont.city, fremont.neighborhood] : fremont, ['Fremont', null]);
  const willow = lookupLocally('95125');
  assert.ok(willow && willow.kind === 'found' && willow.city === 'San Jose', 'a San Jose ZIP is San Jose');
  const mission = lookupLocally('94110');
  assert.ok(mission && mission.kind === 'found' && mission.city === 'San Francisco' && mission.neighborhood, 'SF ZIPs keep their neighborhood');
  const sac = lookupLocally('Sacramento');
  assert.ok(sac && sac.kind === 'found' && sac.city === 'Sacramento' && sac.label === 'Sacramento');
  const redding = lookupLocally('96001');
  assert.ok(redding && redding.kind === 'found' && redding.city === 'Redding');
  assert.deepEqual(lookupLocally('90210'), { kind: 'outside' });
  assert.deepEqual(lookupLocally('10001'), { kind: 'outside' });
  assert.equal(lookupLocally('95999'), null, 'an unlisted Northern California ZIP asks Maps');
  assert.equal(lookupLocally('123 Main St'), null, 'addresses ask Maps');
});

test('a Maps answer anywhere in Northern California is accepted; elsewhere is outside', () => {
  const sac = placeFromGeocode({ lat: 38.58, lng: -121.49, county: 'Sacramento County', state: 'California', locality: 'Sacramento', neighborhood: 'Midtown' });
  assert.ok(sac.kind === 'found' && sac.city === 'Sacramento' && sac.label === 'Midtown');
  assert.deepEqual(placeFromGeocode({ lat: 34.05, lng: -118.24, county: 'Los Angeles County', state: 'California', locality: 'Los Angeles', neighborhood: null }), { kind: 'outside' });
  assert.deepEqual(placeFromGeocode({ lat: 39.53, lng: -119.81, county: 'Washoe County', state: 'Nevada', locality: 'Reno', neighborhood: null }), { kind: 'outside' });
});

test('rooms in any Northern California city have a center for distances', () => {
  assert.equal(serviceCity('Sacramento')?.name, 'Sacramento');
  assert.equal(serviceCity('Oakland')?.name, 'Oakland');
  assert.equal(serviceCity('Los Angeles'), null);
  assert.ok(areaCenter('Sacramento', null));
  assert.equal(areaCenter('San Francisco', 'Mission')?.name, 'Mission');
});
