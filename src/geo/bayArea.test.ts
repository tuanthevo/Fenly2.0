import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAY_AREA_CITIES,
  BAY_AREA_COUNTIES,
  areaCenter,
  areaLabel,
  bayAreaCity,
  distanceMiles,
  inBayAreaBounds,
  nearestArea,
  placeByName,
} from './bayArea';

test('the launch area is the core Bay Area: SF, East Bay, Peninsula, South Bay', () => {
  assert.deepEqual(Object.keys(BAY_AREA_COUNTIES).sort(), ['Alameda', 'Contra Costa', 'San Francisco', 'San Mateo', 'Santa Clara']);
  for (const name of ['San Francisco', 'Oakland', 'Berkeley', 'Fremont', 'Walnut Creek', 'San Mateo', 'Palo Alto', 'San Jose']) {
    assert.ok(bayAreaCity(name), name);
  }
  for (const name of ['Santa Rosa', 'Napa', 'Vallejo', 'San Rafael', 'Sacramento']) assert.equal(bayAreaCity(name), null, name);
  // Unique names, every center inside the launch box, every neighborhood within ~10 miles of its city (San Jose is big)
  assert.equal(new Set(BAY_AREA_CITIES.map((c) => c.name)).size, BAY_AREA_CITIES.length);
  for (const c of BAY_AREA_CITIES) {
    assert.ok(inBayAreaBounds(c.lat, c.lng), c.name);
    for (const h of c.neighborhoods ?? []) assert.ok(distanceMiles(c, h) < 10, `${h.name} is ${distanceMiles(c, h).toFixed(1)} mi from ${c.name}`);
  }
  // SF, Oakland, Berkeley and San Jose list neighborhoods
  assert.deepEqual(BAY_AREA_CITIES.filter((c) => c.neighborhoods).map((c) => c.name), ['San Francisco', 'Oakland', 'Berkeley', 'San Jose']);
});

test('city names are matched loosely', () => {
  assert.equal(bayAreaCity('oakland')?.name, 'Oakland');
  assert.equal(bayAreaCity('SF')?.name, 'San Francisco');
  assert.equal(bayAreaCity('San Jose, CA')?.name, 'San Jose');
});

test('distances: Mission to Oakland is about 8 miles, SF to San Jose about 42', () => {
  const mission = areaCenter('San Francisco', 'Mission')!;
  const oakland = areaCenter('Oakland', null)!;
  assert.ok(Math.abs(distanceMiles(mission, oakland) - 8) < 1.5, `${distanceMiles(mission, oakland)}`);
  assert.ok(Math.abs(distanceMiles(areaCenter('San Francisco', null)!, areaCenter('San Jose', null)!) - 42) < 4);
});

test('a listing is placed by its neighborhood, else its city; unknown places have no center', () => {
  assert.equal(areaCenter('San Francisco', 'Mission District')?.name, 'Mission');
  assert.equal(areaCenter('Oakland', 'Temescal')?.name, 'Temescal');
  assert.equal(areaCenter('Fremont', 'Somewhere')?.name, 'Fremont');
  assert.equal(areaCenter('Napa', null)?.name, 'Napa', 'any Northern California city has a center');
  assert.equal(areaCenter('Los Angeles', null), null);
  assert.equal(areaCenter(null, 'Mission'), null);
});

test('the location pin picks the nearest city and, where we list them, neighborhood', () => {
  assert.deepEqual(nearestArea(37.836, -122.262), { city: 'Oakland', neighborhood: 'Temescal' });
  assert.deepEqual(nearestArea(37.7601, -122.4149), { city: 'San Francisco', neighborhood: 'Mission' });
  assert.deepEqual(nearestArea(37.4425, -122.1435), { city: 'Palo Alto', neighborhood: null });
  assert.equal(nearestArea(38.44, -122.71), null, 'Santa Rosa is outside the launch area');
  assert.equal(nearestArea(NaN, 1), null);
});

test('places by name, for when Maps is unavailable', () => {
  assert.deepEqual(
    { ...placeByName('temescal')!, lat: 0, lng: 0 },
    { city: 'Oakland', neighborhood: 'Temescal', name: 'Temescal', lat: 0, lng: 0 }
  );
  assert.equal(placeByName('Mission District')?.city, 'San Francisco');
  assert.equal(placeByName('Fremont')?.neighborhood, null);
  assert.equal(placeByName('Narnia'), null);
  assert.equal(areaLabel({ city: 'Oakland', neighborhood: 'Temescal' }), 'Temescal, Oakland');
  assert.equal(areaLabel({ city: 'Fremont', neighborhood: null }), 'Fremont');
});
