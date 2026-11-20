import test from 'node:test';
import assert from 'node:assert/strict';
import { neighborhoodFromZip, zipIn, zipTableIsValid } from './zipNeighborhood';
import { sanitizeListingPatch } from './listingRules';

test('every ZIP maps to a neighborhood the picker offers', () => {
  assert.ok(zipTableIsValid());
});

test('a ZIP alone or inside an address finds the neighborhood', () => {
  assert.deepEqual(neighborhoodFromZip('94110'), { kind: 'found', neighborhood: 'Mission', zip: '94110' });
  assert.deepEqual(neighborhoodFromZip('123 Valencia St, San Francisco, CA 94110-1234'), { kind: 'found', neighborhood: 'Mission', zip: '94110' });
  assert.equal(zipIn('500 4th St Apt 12, SF 94107'), '94107');
});

test('SF ZIPs we do not list yet, other cities and plain addresses are told apart', () => {
  assert.equal(neighborhoodFromZip('94124').kind, 'sf_unlisted');
  assert.equal(neighborhoodFromZip('10001').kind, 'outside_sf');
  assert.equal(neighborhoodFromZip('123 Valencia St').kind, 'no_zip');
});

test('room size saves as a whole number from 50 to 10,000 sq ft, or blank', () => {
  const ok = sanitizeListingPatch({ square_feet: 220 });
  assert.ok(ok.ok && ok.patch.square_feet === 220);
  const blank = sanitizeListingPatch({ square_feet: null });
  assert.ok(blank.ok && blank.patch.square_feet === null);
  assert.equal(sanitizeListingPatch({ square_feet: 10 }).ok, false);
  assert.equal(sanitizeListingPatch({ square_feet: 220.5 }).ok, false);
});
