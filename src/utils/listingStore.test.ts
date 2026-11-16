import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDIA_TOKEN_PREFIX,
  collectStrings,
  isBlobUrl,
  isHostListing,
  isMediaToken,
  mapStrings,
  mergeSavedListings,
} from './listingStore';
import type { RoomListing } from '../types';

test('mapStrings swaps blob: URLs anywhere in a listing and leaves other values alone', () => {
  const room = {
    id: 'room-custom-1',
    price: 1450,
    videoUrl: 'blob:http://localhost/aaa',
    fallbackThumbnail: 'data:image/jpeg;base64,xyz',
    customScenes: [
      { label: 'Clip 1', imageUrl: 'data:image/jpeg;base64,1', videoUrl: 'blob:http://localhost/bbb' },
      { label: 'Clip 2', imageUrl: 'https://images.example/2.jpg', isCtaClip: true },
    ],
  };
  const swapped = mapStrings(room, (s) => (isBlobUrl(s) ? `${MEDIA_TOKEN_PREFIX}${s.slice(-3)}` : s));
  assert.equal(swapped.videoUrl, `${MEDIA_TOKEN_PREFIX}aaa`);
  assert.equal(swapped.customScenes[0].videoUrl, `${MEDIA_TOKEN_PREFIX}bbb`);
  assert.equal(swapped.customScenes[1].imageUrl, 'https://images.example/2.jpg');
  assert.equal(swapped.price, 1450);
  assert.equal(swapped.customScenes[1].isCtaClip, true);
  // the original is not changed
  assert.equal(room.videoUrl, 'blob:http://localhost/aaa');
});

test('collectStrings finds each blob: URL once and spots media tokens', () => {
  const rooms = [
    { videoUrl: 'blob:x/1', scenes: [{ videoUrl: 'blob:x/1' }, { videoUrl: 'blob:x/2' }] },
    { videoUrl: `${MEDIA_TOKEN_PREFIX}abc` },
  ];
  assert.deepEqual(collectStrings(rooms, isBlobUrl).sort(), ['blob:x/1', 'blob:x/2']);
  assert.deepEqual(collectStrings(rooms, isMediaToken), [`${MEDIA_TOKEN_PREFIX}abc`]);
});

test('saved host listings go first and replace a built-in listing with the same id', () => {
  const r = (id: string, title = id) => ({ id, title }) as RoomListing;
  const merged = mergeSavedListings([r('room-custom-2'), r('room-custom-1')], [r('room-1'), r('room-2')]);
  assert.deepEqual(merged.map((x) => x.id), ['room-custom-2', 'room-custom-1', 'room-1', 'room-2']);
  assert.equal(isHostListing(r('room-custom-9')), true);
  assert.equal(isHostListing(r('room-1')), false);
});

test('after a reload, edited built-in listings keep their place and deleted ones stay deleted', () => {
  const r = (id: string, title = id) => ({ id, title }) as RoomListing;
  const builtIn = [r('room-1'), r('room-2'), r('room-3')];
  const saved = [r('room-custom-9'), r('room-2', 'Edited title')];
  const merged = mergeSavedListings(saved, builtIn, ['room-3']);
  assert.deepEqual(merged.map((x) => x.id), ['room-custom-9', 'room-1', 'room-2']);
  assert.equal(merged[2].title, 'Edited title');
});
