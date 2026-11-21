import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bedBathLabel,
  cleanTag,
  defaultHook,
  heroFacts,
  leaseFact,
  listingFacts,
  defaultTags,
  hashtagsFor,
  hookFontSizeFor,
  hookFromText,
  pickPerk,
  priceLabel,
  sanitizeHookText,
  violatesFairHousing,
} from './copy';
import type { ViralListingInfo } from './types';

const listing: ViralListingInfo = {
  monthlyRent: 1250,
  beds: 2,
  baths: 1,
  neighborhood: 'Echo Park',
  city: 'Los Angeles',
  roomType: 'Entire Place',
  amenities: ['Balcony', 'Parking'],
};

test('prices read like people say them', () => {
  assert.equal(priceLabel(1250), '$1,250/mo');
  assert.equal(priceLabel(985.4), '$985/mo');
  assert.equal(priceLabel(Number.NaN), '$0/mo');
});

test('each style has a hook that fits on screen', () => {
  for (const style of ['price-hook', 'guess-rent', 'pov'] as const) {
    const hook = defaultHook(style, listing);
    assert.ok(hook.text.length <= 64, hook.text);
    assert.ok(hookFontSizeFor(hook.text) >= 68);
  }
  assert.equal(defaultHook('pov', listing).text, 'You just found a $1,250/mo place in Echo Park');
});

test('typed hooks get the price and neighborhood highlighted', () => {
  const hook = hookFromText('POV: $1,250 a month in echo park ✨', listing);
  assert.equal(hook.text, 'POV: $1,250 a month in echo park');
  assert.deepEqual(
    hook.segments.map((s) => [s.text, s.em ?? null]),
    [
      ['POV: ', null],
      ['$1,250', 'price'],
      [' a month in ', null],
      ['echo park', 'place'],
    ]
  );
});

test('hooks that are too long to read in 2 seconds are rejected', () => {
  assert.equal(sanitizeHookText('x'.repeat(65)), null);
  assert.equal(sanitizeHookText('  "What $1,250 gets you"  '), 'What $1,250 gets you');
  assert.equal(sanitizeHookText(''), null);
});

test('callouts are 2-3 words, no emoji, at most 22 characters', () => {
  assert.equal(cleanTag('🔥 Huge walk-in closet with shelving'), 'Huge walk-in closet');
  assert.equal(cleanTag('Extraordinarily spacious kitchen'), 'Extraordinarily');
  assert.equal(cleanTag(undefined), '');
});

test('default callouts come from the guided slots and the amenities', () => {
  const tags = defaultTags(listing);
  assert.equal(tags[1], 'Main bedroom');
  assert.equal(tags[3], 'The bathroom');
  assert.equal(tags[5], 'Private balcony');
  assert.equal(pickPerk([]), 'The best part');
});

test('fair-housing guard catches who-should-live-here phrasing only', () => {
  assert.ok(violatesFairHousing('Perfect for young professionals'));
  assert.ok(violatesFairHousing('Ideal for a couple'));
  assert.ok(violatesFairHousing('No kids please'));
  assert.ok(violatesFairHousing('Women only'));
  assert.ok(!violatesFairHousing('Perfect for working from home'));
  // Audit additions: an adjective in between, source of income (protected in California), language, disability, age
  assert.ok(violatesFairHousing('Great for working professionals'));
  assert.ok(violatesFairHousing('Ideal for a quiet student'));
  assert.ok(violatesFairHousing('No Section 8'));
  assert.ok(violatesFairHousing('no vouchers accepted'));
  assert.ok(violatesFairHousing('English speakers only'));
  assert.ok(violatesFairHousing('Must be able-bodied'));
  assert.ok(violatesFairHousing('Mature adults preferred'));
  assert.ok(!violatesFairHousing('Section 8 welcome'));
  assert.ok(!violatesFairHousing('Mature trees out back'));
  assert.ok(!violatesFairHousing('Great for working from home'));
  assert.ok(!violatesFairHousing('Walk-in closet'));
  assert.ok(!violatesFairHousing('What $1,250/mo gets you in Echo Park'));
});

test('five unique hashtags', () => {
  const tags = hashtagsFor(listing);
  assert.deepEqual(tags, ['#EchoPark', '#LosAngelesApartments', '#ApartmentForRent', '#ApartmentTour', '#FennRentals']);
});

test('listing facts for the full tour: beds and baths, size, amenities, then the lease', () => {
  const room: ViralListingInfo = {
    monthlyRent: 1450,
    beds: '1',
    baths: 1,
    neighborhood: 'Mission District',
    city: 'San Francisco',
    squareFeet: 220,
    amenities: ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi', 'Utilities Included'],
    leaseTerm: '6 Months',
  };
  assert.equal(bedBathLabel(room), '1 bed · 1 bath');
  assert.equal(bedBathLabel({ ...room, beds: 2, baths: 1.5 }), '2 beds · 1.5 baths');
  assert.equal(bedBathLabel({ ...room, beds: 'Studio' }), 'Studio · 1 bath');
  assert.deepEqual(heroFacts(room, ['In-unit laundry', 'Private bath']), ['1 bed · 1 bath', '220 sq ft', 'Utilities included']);
  assert.deepEqual(heroFacts({ ...room, squareFeet: undefined, amenities: [] }), ['1 bed · 1 bath', '6-month lease']);
  assert.deepEqual(listingFacts(room, ['Utilities included', 'In-unit laundry', 'Private bath']), ['Fast WiFi', '6-month lease']);
  assert.equal(leaseFact({ ...room, leaseTerm: '12+ Months' }), '12+ month lease');
  assert.equal(leaseFact({ ...room, leaseTerm: 'Month-to-month' }), 'Month-to-month');
  assert.equal(leaseFact({ ...room, leaseTerm: undefined }), '');
});
