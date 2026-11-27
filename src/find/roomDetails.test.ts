import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostInitials, roomDetailsView } from './roomDetails';

const host = { id: 'h', name: 'Antoine', avatar: '', verified: false, occupation: '', responseRate: '', rating: 0, bio: '', joinedDate: '' };
const room = { deposit: 0, squareFeet: 0, availableDate: 'Available Now', price: 1450, roommates: [], houseRules: [], host };

test('a room with little data shows only what is known', () => {
  const view = roomDetailsView(room);
  assert.deepEqual(view.badges, []);
  assert.deepEqual(view.tiles.map((t) => t.label), ['Monthly rent', 'Available']);
  assert.equal(view.showRoommates, false);
  assert.equal(view.showRules, false);
  assert.equal(view.host.occupation, null);
  assert.equal(view.host.responds, null);
});

test('size and deposit tiles appear when the host gave them', () => {
  const view = roomDetailsView({ ...room, deposit: 1450, squareFeet: 150 });
  assert.deepEqual(view.tiles.map((t) => `${t.label}: ${t.value}`), ['Monthly rent: $1,450', 'Deposit: $1,450', 'Room size: 150 sq ft', 'Available: Available Now']);
});

test('badges only claim what the data backs', () => {
  assert.deepEqual(roomDetailsView({ ...room, host: { ...host, verified: true } }).badges, ['Verified']);
  assert.deepEqual(roomDetailsView({ ...room, host: { ...host, verified: true, phoneVerified: true } }).badges, ['Phone verified']);
  // Escrow belongs to the 1.0 Home hub: only with that feature on
  assert.deepEqual(roomDetailsView(room, { escrow: true }).badges, ['Move-in escrow']);
  for (const b of roomDetailsView({ ...room, host: { ...host, verified: true } }).badges) assert.doesNotMatch(b, /escrow|ID/i);
});

test('host details and housemates show when filled in', () => {
  const view = roomDetailsView({ ...room, roommates: [{}], houseRules: ['No smoking'], host: { ...host, occupation: ' Nurse ', responseRate: 'within a day' } });
  assert.equal(view.showRoommates, true);
  assert.equal(view.showRules, true);
  assert.equal(view.host.occupation, 'Nurse');
  assert.equal(view.host.responds, 'within a day');
});

test('initials stand in for a missing or broken photo', () => {
  assert.equal(hostInitials('Antoine'), 'A');
  assert.equal(hostInitials('maya lin'), 'ML');
  assert.equal(hostInitials('  '), '?');
});

test('the feed and the details sheet say Apply, never "Request to Book"', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const rel of ['components/VideoInfoOverlay.tsx', 'components/RoomDetailsModal.tsx']) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(src, /Request to Book/i, rel);
    assert.match(src, />\s*Apply\s*</, rel);
  }
});
