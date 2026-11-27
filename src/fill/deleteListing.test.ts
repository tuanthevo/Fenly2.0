import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteListingCopy } from './deleteListing';
import { EVENT_NAMES } from '../../server/track';

const EMOJI = /\p{Extended_Pictographic}/u;
const all = (c: ReturnType<typeof deleteListingCopy>) => [c.title, ...c.lines, c.confirm, c.cancel].join(' ');

test('every delete warning says it cannot be undone', () => {
  for (const status of ['draft', 'published', 'filled'])
    for (const media of ['video', 'photos'] as const) {
      const copy = deleteListingCopy(status, media);
      assert.match(all(copy), /can't be undone/i, `${status} ${media}`);
      assert.ok(!EMOJI.test(all(copy)));
    }
});

test('a live listing warns about its links, applications and messages', () => {
  for (const status of ['published', 'filled']) {
    const text = all(deleteListingCopy(status, 'video'));
    assert.match(text, /links? .*stop working/i);
    assert.match(text, /applications/i);
    assert.match(text, /messages/i);
  }
});

test('a draft has no links or applications to warn about', () => {
  const copy = deleteListingCopy('draft', 'video');
  assert.match(copy.title, /draft/i);
  assert.doesNotMatch(all(copy), /applications|links/i);
});

test('the warning names what the host made: video or photos', () => {
  assert.match(all(deleteListingCopy('published', 'video')), /video/i);
  assert.doesNotMatch(all(deleteListingCopy('published', 'video')), /photo/i);
  assert.match(all(deleteListingCopy('published', 'photos')), /photos/i);
});

test('the confirm button names the action, and the way out keeps the listing', () => {
  const copy = deleteListingCopy('published', 'video');
  assert.equal(copy.confirm, 'Delete listing');
  assert.equal(copy.cancel, 'Keep listing');
  assert.equal(deleteListingCopy('draft', 'video').confirm, 'Delete draft');
});

test('deleting a listing is a tracked event', () => {
  assert.ok((EVENT_NAMES as readonly string[]).includes('listing_deleted'));
});
