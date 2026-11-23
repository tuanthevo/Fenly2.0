import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PHOTOS,
  MIN_PHOTOS,
  PHOTO_SHOTS,
  PHOTO_TIPS,
  canAddPhoto,
  canProceedWithPhotos,
  coverSlot,
  missingRequiredSlots,
  photoPath,
  photoProgressText,
  slotFromPhotoPath,
} from './photoShots';

test('the four required shots are the room for rent, in order', () => {
  assert.deepEqual(PHOTO_SHOTS.filter((s) => s.required).map((s) => s.slot), ['doorway', 'center', 'corner', 'storage']);
  assert.deepEqual(PHOTO_SHOTS.filter((s) => !s.required).map((s) => s.slot), ['kitchen', 'bathroom', 'living', 'building']);
  assert.equal(MIN_PHOTOS, 4);
  assert.equal(MAX_PHOTOS, 12);
});

test('a host cannot continue until every required shot is taken', () => {
  assert.equal(canProceedWithPhotos([]), false);
  assert.equal(canProceedWithPhotos(['doorway', 'center', 'corner']), false);
  // Four photos that are not the four required shots do not count
  assert.equal(canProceedWithPhotos(['doorway', 'center', 'corner', 'kitchen']), false);
  assert.equal(canProceedWithPhotos(['doorway', 'center', 'corner', 'storage']), true);
  assert.deepEqual(missingRequiredSlots(['doorway', 'kitchen']), ['center', 'corner', 'storage']);
});

test('at most 12 photos', () => {
  const twelve = ['doorway', 'center', 'corner', 'storage', 'kitchen', 'bathroom', 'living', 'building', 'other', 'other', 'other', 'other'] as const;
  assert.equal(canProceedWithPhotos([...twelve]), true);
  assert.equal(canAddPhoto(11), true);
  assert.equal(canAddPhoto(12), false);
  assert.equal(canProceedWithPhotos([...twelve, 'other']), false);
});

test('progress counts required shots first, then all photos', () => {
  assert.equal(photoProgressText([]), '0 of 4 required');
  assert.equal(photoProgressText(['doorway', 'center', 'corner']), '3 of 4 required');
  assert.equal(photoProgressText(['doorway', 'center', 'corner', 'kitchen']), '3 of 4 required');
  assert.equal(photoProgressText(['doorway', 'center', 'corner', 'storage', 'kitchen']), '5 photos, up to 12');
});

test('the cover is the doorway photo, else the center photo, else the first', () => {
  assert.equal(coverSlot(['center', 'doorway']), 'doorway');
  assert.equal(coverSlot(['corner', 'center']), 'center');
  assert.equal(coverSlot(['kitchen', 'corner']), 'kitchen');
  assert.equal(coverSlot([]), null);
});

test('storage paths start with the listing id and round-trip the slot', () => {
  const path = photoPath('11111111-1111-4111-8111-111111111111', 'doorway', 'ab12');
  assert.equal(path, '11111111-1111-4111-8111-111111111111/doorway-ab12.jpg');
  assert.equal(slotFromPhotoPath(path), 'doorway');
  assert.equal(slotFromPhotoPath('x/raw/slot-1.mp4'), null);
});

test('no photo copy tells the host to walk or step, and none has emoji', () => {
  const copy = [...PHOTO_TIPS, ...PHOTO_SHOTS.flatMap((s) => [s.name, s.instruction])];
  assert.equal(PHOTO_TIPS.length, 4);
  for (const text of copy) {
    assert.doesNotMatch(text, /\b(walk\w*|steps?)\b/i, text);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, text);
  }
});
