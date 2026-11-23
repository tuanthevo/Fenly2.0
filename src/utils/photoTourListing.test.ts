import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_ROOMS } from '../data/mockRooms';
import { factsForRoom, listingVariant, photoTourPlanForRoom, photoTourPlanForListing, PHOTO_TOUR_STYLES } from './photoTourListing';
import { checkPlan } from '../remotion/viral/plan';

const scenes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: `Clip ${i + 1}/${n} • Room ${i + 1} & Detail`, imageUrl: `https://img/${i}.jpg` }));

test('every demo listing becomes a valid photo tour, rotating hook styles', () => {
  const styles = new Set<string>();
  for (const room of INITIAL_ROOMS) {
    const plan = photoTourPlanForRoom(room, scenes(4));
    assert.ok(plan, room.id);
    assert.deepEqual(checkPlan(plan!), [], room.id);
    assert.equal(plan!.priceLabel, `$${room.price.toLocaleString('en-US')}/mo`);
    styles.add(plan!.style);
  }
  assert.deepEqual([...styles].sort(), [...PHOTO_TOUR_STYLES].sort());
});

test('fewer than 2 photos keeps the slideshow', () => {
  assert.equal(photoTourPlanForRoom(INITIAL_ROOMS[0], scenes(1)), null);
});

test('variants and facts', () => {
  assert.equal(listingVariant('room-1'), 0);
  assert.equal(listingVariant('room-7'), 6);
  assert.ok(listingVariant('abc') >= 0);
  const facts = factsForRoom({ ...INITIAL_ROOMS[0], roomType: 'Master Suite', squareFeet: 260, availableDate: 'Immediately' });
  assert.deepEqual(facts, ['Primary suite', '260 sq ft', 'Available now']);
});

/* ---------- host photo listings ---------- */

const INFO = {
  monthlyRent: 1450,
  beds: 1,
  baths: 1,
  neighborhood: 'Mission District',
  city: 'San Francisco',
  roomType: 'Private Room',
  squareFeet: 150,
  amenities: ['Furnished'],
  leaseTerm: '6 months',
};
const HOST_PHOTOS = [
  { src: 'blob:a', slot: 'doorway' as const, caption: 'Bright bedroom', landscape: true },
  { src: 'blob:b', slot: 'center' as const, caption: 'South-facing window, Built-in closet', landscape: true },
  { src: 'blob:c', slot: 'corner' as const, caption: '', landscape: true },
  { src: 'blob:d', slot: 'storage' as const, caption: 'Walk-in closet', landscape: false },
];

test('a host photo listing becomes a calm tour with the price, the area and the move-in date up front', () => {
  const plan = photoTourPlanForListing(INFO, HOST_PHOTOS, { availableFrom: '2026-12-01', today: '2026-11-22', listingId: '11111111-1111-4111-8111-111111111111' })!;
  assert.equal(plan.hook.text, 'What $1,450/mo gets you in Mission District');
  const facts = plan.shots[1].callouts.map((c) => c.text);
  assert.deepEqual(facts, ['Private room', '150 sq ft', 'Available Dec 1']);
  assert.ok(plan.cuts.slice(0, -1).every((c) => c.kind === 'crossfade'));
  assert.deepEqual(plan.sfx, []);
  assert.equal(plan.textScale, 0.64);
  assert.equal(plan.endCard.brand, 'Tour it on Fenly');
});

test('captions become the callouts: "A, B" is the room label and its second callout; an empty caption uses the shot name', () => {
  const plan = photoTourPlanForListing(INFO, HOST_PHOTOS, { listingId: 'x' })!;
  const walk2 = plan.shots.find((s) => s.id === 'photo-2-walk')!;
  const look2 = plan.shots.find((s) => s.id === 'photo-2-look')!;
  assert.equal(walk2.tag, 'South-facing window');
  assert.deepEqual(look2.callouts.map((c) => c.text), ['Built-in closet']);
  assert.equal(plan.shots.find((s) => s.id === 'photo-3-walk')!.tag, 'Corner angle');
  assert.equal(plan.shots.at(-1)!.tag, 'Walk-in closet');
});

test('a move-in date that has passed reads "Available now"; fewer than 2 photos makes no tour', () => {
  const plan = photoTourPlanForListing(INFO, HOST_PHOTOS, { availableFrom: '2026-11-01', today: '2026-11-22', listingId: 'x' })!;
  assert.ok(plan.shots[1].callouts.some((c) => c.text === 'Available now'));
  assert.equal(photoTourPlanForListing(INFO, HOST_PHOTOS.slice(0, 1), { listingId: 'x' }), null);
});
