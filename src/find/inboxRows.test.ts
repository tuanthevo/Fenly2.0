import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationStatus, canViewRoom, roomLine, splitInbox, type InboxRowThread } from './inboxRows';

const row = (over: Partial<InboxRowThread> = {}): InboxRowThread => ({
  applicationId: over.applicationId ?? 'a1',
  role: 'applicant',
  status: 'submitted',
  unread: 0,
  ...over,
});

test('a renter sees Pending, Shortlisted, Chosen or Not chosen', () => {
  assert.deepEqual(applicationStatus('submitted'), { label: 'Pending', tone: 'pending' });
  assert.deepEqual(applicationStatus('shortlisted'), { label: 'Shortlisted', tone: 'good' });
  assert.deepEqual(applicationStatus('chosen'), { label: 'Chosen', tone: 'good' });
  assert.deepEqual(applicationStatus('declined'), { label: 'Not chosen', tone: 'closed' });
  assert.deepEqual(applicationStatus('withdrawn'), { label: 'Withdrawn', tone: 'closed' });
});

test('status wording stays soft: never Denied, Rejected or Approved', () => {
  for (const s of ['submitted', 'shortlisted', 'chosen', 'declined', 'withdrawn', 'something_new']) {
    assert.doesNotMatch(applicationStatus(s).label, /denied|rejected|approved/i);
  }
  // a status the app doesn't know yet still shows something neutral
  assert.equal(applicationStatus('something_new').tone, 'pending');
});

test('closed applications go to Past; open ones stay on top, in the order given', () => {
  const threads = [
    row({ applicationId: 'open1' }),
    row({ applicationId: 'declined', status: 'declined' }),
    row({ applicationId: 'chosen', status: 'chosen' }),
    row({ applicationId: 'withdrawn', status: 'withdrawn' }),
    row({ applicationId: 'short', status: 'shortlisted' }),
  ];
  const { active, past } = splitInbox(threads);
  assert.deepEqual(active.map((t) => t.applicationId), ['open1', 'chosen', 'short']);
  assert.deepEqual(past.map((t) => t.applicationId), ['declined', 'withdrawn']);
});

test('a closed application with an unread message is not hidden in Past', () => {
  const { active, past } = splitInbox([row({ applicationId: 'd', status: 'declined', unread: 1 })]);
  assert.deepEqual(active.map((t) => t.applicationId), ['d']);
  assert.equal(past.length, 0);
});

test("a host's conversations never move to Past", () => {
  const { active, past } = splitInbox([
    row({ applicationId: 'h', role: 'host', status: 'declined' }),
    row({ applicationId: 'm', role: 'housemate', status: 'withdrawn' }),
  ]);
  assert.equal(active.length, 2);
  assert.equal(past.length, 0);
});

test('the room page opens only for rooms that have one', () => {
  assert.equal(canViewRoom({ status: 'published' }), true);
  assert.equal(canViewRoom({ status: 'filled' }), true);
  assert.equal(canViewRoom({ status: 'draft' }), false);
  assert.equal(canViewRoom({ status: 'removed' }), false);
  assert.equal(canViewRoom(null), false);
});

test('a row names the room by rent and place', () => {
  assert.equal(roomLine({ rentCents: 145000, neighborhood: 'Mission District' }), '$1,450/mo · Mission District');
  assert.equal(roomLine({ rentCents: null, neighborhood: 'Oakland' }), 'Room in Oakland');
  assert.equal(roomLine({ rentCents: 90000, neighborhood: null }), '$900/mo · Bay Area');
  assert.equal(roomLine(null), 'Room in the Bay Area');
});
