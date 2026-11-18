import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectStrings,
  isIsoDate,
  listingFairHousingIssues,
  nextDay,
  publishProblems,
  sanitizeListingPatch,
} from './listingRules';

const NOW = new Date('2026-11-17T20:00:00Z');

test('sanitizeListingPatch keeps known fields, trims text and drops unknown keys', () => {
  const result = sanitizeListingPatch(
    {
      title: '  Sunny room  ',
      description: '',
      lease_permission: 'can_replace',
      rent_cents: 145000,
      beds: 1,
      baths: 1.5,
      amenities: [' Laundry ', 'Laundry', 'Backyard'],
      available_from: '2026-12-01',
      owner_id: 'someone-else',
      status: 'published',
    },
    NOW
  );
  assert.ok(result.ok);
  assert.deepEqual(result.patch, {
    title: 'Sunny room',
    description: null,
    lease_permission: 'can_replace',
    rent_cents: 145000,
    beds: 1,
    baths: 1.5,
    amenities: ['Laundry', 'Backyard'],
    available_from: '2026-12-01',
    copy_approved_at: null, // title changed without re-approval
  });
});

test('sanitizeListingPatch rejects bad values with plain messages', () => {
  const result = sanitizeListingPatch({
    lease_permission: 'maybe',
    rent_cents: 50,
    available_from: '2026-02-30',
    beds: 1.5,
    amenities: 'Laundry',
    city: '',
    title: 42,
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.length === 7, JSON.stringify(result));
  assert.equal(sanitizeListingPatch(null).ok, false);
  assert.equal(sanitizeListingPatch([1]).ok, false);
});

test('approval: ticking the box stamps the time; editing the copy clears it', () => {
  const approve = sanitizeListingPatch({ title: 'A', description: 'B', copy_approved: true }, NOW);
  assert.ok(approve.ok && approve.patch.copy_approved_at === NOW.toISOString());
  const rentOnly = sanitizeListingPatch({ rent_cents: 150000 }, NOW);
  assert.ok(rentOnly.ok && !('copy_approved_at' in rentOnly.patch));
  const untick = sanitizeListingPatch({ copy_approved: false }, NOW);
  assert.ok(untick.ok && untick.patch.copy_approved_at === null);
});

test('dates', () => {
  assert.equal(isIsoDate('2026-12-01'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('12/01/2026'), false);
  assert.equal(nextDay('2026-11-30'), '2026-12-01');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
});

test('fair-housing issues are found in any field, including nested video words', () => {
  const issues = listingFairHousingIssues({
    title: 'Sunny room',
    description: 'Ideal for students. Quiet street.',
    video: { callouts: [{ text: 'No kids' }, { text: 'In-unit laundry' }] },
    posts: ['Room in Mission'],
  });
  assert.deepEqual(issues, [
    { field: 'description', phrases: ['Ideal for students'] },
    { field: 'video', phrases: ['No kids'] },
  ]);
  assert.deepEqual(collectStrings({ a: ['x', { b: 'y' }], c: 3 }), ['x', 'y']);
});

const READY = {
  status: 'draft',
  lease_permission: 'can_replace',
  copy_approved_at: '2026-11-17T20:00:00Z',
  title: 'Sunny room',
  description: 'Bright',
  rent_cents: 145000,
};

test('publishProblems: a complete draft can publish', () => {
  assert.deepEqual(publishProblems(READY, ['video_full', 'video_teaser', 'thumbnail', 'raw_clip']), []);
});

test('publishProblems lists everything missing, including an unresolved lease check', () => {
  assert.deepEqual(
    publishProblems(
      { status: 'draft', lease_permission: 'not_sure', copy_approved_at: null, title: ' ', description: null, rent_cents: null },
      ['raw_clip']
    ),
    ['lease_check', 'missing_title', 'missing_description', 'copy_not_approved', 'missing_rent', 'missing_video', 'missing_thumbnail']
  );
  assert.deepEqual(publishProblems({ ...READY, status: 'filled' }, ['video_full', 'thumbnail']), ['already_filled']);
});
