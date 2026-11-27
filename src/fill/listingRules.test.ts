import test from 'node:test';
import assert from 'node:assert/strict';
import {
  depositCheck,
  collectStrings,
  isIsoDate,
  listingFairHousingIssues,
  nextDay,
  publishProblems,
  sanitizeListingPatch,
  resumeStep,
  rawClipPath,
  slotFromRawPath,
} from './listingRules';
import type { PhotoSlot } from './photoShots';

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

test('resumeStep picks up a draft where it stopped', () => {
  const base = { status: 'draft', lease_permission: null, title: null, description: null, copy_approved_at: null };
  assert.equal(resumeStep(null, [], 0), 'start');
  assert.equal(resumeStep(base, [], 0), 'lease');
  assert.equal(resumeStep({ ...base, lease_permission: 'not_sure' }, [], 5), 'lease');
  assert.equal(resumeStep({ ...base, lease_permission: 'leaseholder' }, [], 3), 'tour', 'four areas are required');
  assert.equal(resumeStep({ ...base, lease_permission: 'leaseholder' }, [], 4), 'details');
  const approved = { ...base, lease_permission: 'can_replace', title: 'T', description: 'D', copy_approved_at: 'x' };
  assert.equal(resumeStep(approved, ['raw_clip'], 4), 'video');
  assert.equal(resumeStep(approved, ['video_full'], 4), 'video');
  assert.equal(resumeStep(approved, ['video_full', 'thumbnail'], 4), 'publish');
  assert.equal(resumeStep({ ...approved, status: 'published' }, [], 0), 'share');
});

test('raw clip paths round-trip their slot number', () => {
  const path = rawClipPath('aaaa', 3, 'webm');
  assert.equal(path, 'aaaa/raw/slot-3.webm');
  assert.equal(slotFromRawPath(path), 3);
  assert.equal(slotFromRawPath('aaaa/full.mp4'), null);
  assert.equal(slotFromRawPath('aaaa/raw/slot-9.mp4'), null);
});

test('security deposit: optional, at most two months of rent, a note past one month', () => {
  assert.deepEqual(depositCheck(145000, null), {});
  assert.deepEqual(depositCheck(145000, 0), {});
  assert.deepEqual(depositCheck(145000, 145000), {});
  assert.ok(depositCheck(145000, 200000).note, 'over one month: a California note');
  assert.equal(depositCheck(145000, 200000).error, undefined);
  assert.ok(depositCheck(145000, 300000).error, 'over two months: blocked');
  assert.deepEqual(depositCheck(0, 50000), {}, 'no rent yet: nothing to compare');
});

/* ---------- photo listings (media_type) ---------- */

const FOUR = { slots: ['doorway', 'center', 'corner', 'storage'] as PhotoSlot[], captionsApproved: true };

test('sanitizeListingPatch: switching media_type changes nothing else in the draft', () => {
  const toPhotos = sanitizeListingPatch({ media_type: 'photos' }, NOW);
  assert.deepEqual(toPhotos, { ok: true, patch: { media_type: 'photos' } });
  const toVideo = sanitizeListingPatch({ media_type: 'video' }, NOW);
  assert.deepEqual(toVideo, { ok: true, patch: { media_type: 'video' } });
  // In particular the host's approval of the text survives the switch
  assert.equal(toPhotos.ok && 'copy_approved_at' in toPhotos.patch, false);
  const bad = sanitizeListingPatch({ media_type: 'slideshow' }, NOW);
  assert.equal(bad.ok, false);
});

test('publishProblems: a photo listing needs its required shots, approved captions and a cover, not a video', () => {
  const photos = { ...READY, media_type: 'photos' };
  assert.deepEqual(publishProblems(photos, ['thumbnail'], FOUR), []);
  assert.deepEqual(publishProblems(photos, ['video_full', 'thumbnail'], FOUR), []);
  assert.deepEqual(publishProblems(photos, [], { slots: ['doorway', 'center', 'corner'], captionsApproved: false }), [
    'missing_photos',
    'captions_not_approved',
    'missing_thumbnail',
  ]);
  assert.deepEqual(publishProblems(photos, ['thumbnail']), ['missing_photos', 'captions_not_approved']);
});

test('publishProblems: a video listing ignores photos, and a listing with no media_type is a video listing', () => {
  assert.deepEqual(publishProblems({ ...READY, media_type: 'video' }, ['thumbnail'], FOUR), ['missing_video']);
  assert.deepEqual(publishProblems(READY, ['thumbnail'], FOUR), ['missing_video']);
});

test('resumeStep follows the chosen media type and keeps the other type\'s work', () => {
  const approved = { status: 'draft', lease_permission: 'can_replace', title: 'T', description: 'D', copy_approved_at: 'x' };
  const photos = { ...approved, media_type: 'photos' };
  // Three clips filmed, then switched to photos: the photo shots are what is missing
  assert.equal(resumeStep(photos, ['raw_clip'], 3, { slots: ['doorway'], captionsApproved: false }), 'tour');
  assert.equal(resumeStep(photos, [], 0, { ...FOUR, captionsApproved: false }), 'video');
  assert.equal(resumeStep(photos, [], 0, FOUR), 'video');
  assert.equal(resumeStep(photos, ['thumbnail'], 0, FOUR), 'publish');
  assert.equal(resumeStep({ ...photos, copy_approved_at: null }, [], 0, FOUR), 'details');
  // Switched back to video: the clips still count, the photos are ignored
  assert.equal(resumeStep({ ...approved, media_type: 'video' }, ['raw_clip'], 4, FOUR), 'video');
  assert.equal(resumeStep({ ...approved, media_type: 'video' }, [], 0, FOUR), 'tour');
});
