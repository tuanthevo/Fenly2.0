import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_ROOMS } from '../data/mockRooms';
import { factsForRoom, listingVariant, photoTourPlanForRoom, PHOTO_TOUR_STYLES } from './photoTourListing';
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
