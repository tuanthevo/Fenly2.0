import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhotoTourPlan, closerTagFromLabel, photoHookSec, tagsFromLabel, PHOTO_TIMING, PHOTO_TEXT_SCALE } from './photoTour';
import { checkPlan } from './plan';
import type { ViralListingInfo } from './types';

const listing: ViralListingInfo = {
  monthlyRent: 1450,
  beds: 1,
  baths: 1,
  neighborhood: 'Mission District',
  city: 'San Francisco',
  roomType: 'Private Room',
  squareFeet: 220,
  amenities: ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi', 'Utilities Included'],
  leaseTerm: '6 Months',
};

const photos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ src: `https://img/${i}.jpg`, tag: ['Living area', 'Bedroom', 'Bathroom', 'Private balcony', 'Kitchen', 'Rooftop'][i], detail: i === 1 ? 'Closet space' : undefined }));

const sec = (frames: number) => frames / 30;

test('4 photos make a ~17 s walk-through: hook, look around, 2 rooms (walk + look), reveal, end card', () => {
  const plan = buildPhotoTourPlan({ listing, photos: photos(4), facts: ['Private room', '220 sq ft'] });
  assert.deepEqual(checkPlan(plan), []);
  assert.ok(sec(plan.totalFrames) >= 15 && sec(plan.totalFrames) <= 19, `${sec(plan.totalFrames)}s`);
  assert.deepEqual(plan.shots.map((s) => `${s.slotNumber}:${s.photo?.move}:${s.role}`), [
    '1:walk:hook', '1:look:tour', '2:walk:tour', '2:look:tour', '3:walk:tour', '3:look:tour', '4:walk:closer',
  ]);
  assert.deepEqual(plan.cuts.map((c) => c.kind), ['whip-left', 'zoom-through', 'whip-right', 'zoom-through', 'whip-left', 'light-leak']);
  assert.ok(plan.shots.every((s) => s.photo && s.src.startsWith('https://img/')));
  assert.equal(plan.shots[0].photo!.doorway, true, 'the first shot steps through the doorway');
  assert.ok(plan.shots.slice(1).every((s) => !s.photo!.doorway));
  assert.equal(plan.endCard.durationInFrames, Math.round(PHOTO_TIMING.endCardSec * 30));
});

test('the headline is up for its reading time on frame 0, then the facts answer it', () => {
  const plan = buildPhotoTourPlan({ listing, photos: photos(4), facts: ['Private room', '220 sq ft', 'Available now'] });
  assert.equal(plan.hook.text, 'What $1,450/mo gets you in Mission District');
  assert.equal(plan.hookExitFrame, plan.shots[1].startFrame);
  assert.equal(plan.shots[0].durationInFrames - plan.shots[0].outOverlapFrames, Math.round(photoHookSec(plan.hook.text) * 30));
  assert.deepEqual(plan.shots[1].callouts.map((c) => [c.text, c.kind, c.row]), [
    ['Private room', 'fact', -1], ['220 sq ft', 'fact', 0], ['Available now', 'fact', 1],
  ]);
});

test('rooms get their callout on the walk in and a second one on the look around', () => {
  const plan = buildPhotoTourPlan({ listing, photos: photos(4) });
  const bedroomWalk = plan.shots.find((s) => s.id === 'photo-2-walk')!;
  const bedroomLook = plan.shots.find((s) => s.id === 'photo-2-look')!;
  assert.equal(bedroomWalk.tag, 'Bedroom');
  assert.deepEqual(bedroomLook.callouts.map((c) => [c.text, c.kind]), [['Closet space', 'room']]);
  // No detail given: a listing fact fills the beat
  const bathLook = plan.shots.find((s) => s.id === 'photo-3-look')!;
  assert.equal(bathLook.callouts[0].kind, 'fact');
  const closer = plan.shots[plan.shots.length - 1];
  assert.equal(closer.tag, 'Private balcony');
  assert.equal(closer.kicker, 'THE BEST PART');
  for (const s of plan.shots) for (const c of s.callouts) assert.ok(c.inFrame < c.outFrame && c.outFrame < s.durationInFrames);
});

test('walks push forward with a bob, looks pan across the room; variants move differently', () => {
  const a = buildPhotoTourPlan({ listing, photos: photos(4) }, { variant: 0 });
  const b = buildPhotoTourPlan({ listing, photos: photos(4) }, { variant: 1 });
  for (const s of a.shots) {
    const m = s.photo!;
    if (m.move === 'walk') {
      assert.ok(m.toScale > m.fromScale && m.bob > 0);
    } else {
      assert.ok(Math.abs(m.toX - m.fromX) >= 50, 'a look pans across most of the photo');
    }
  }
  assert.notEqual(a.shots[1].photo!.fromX, b.shots[1].photo!.fromX);
});

test('re-hook on the middle room, guess-the-rent hides the price, every style is valid', () => {
  const plan = buildPhotoTourPlan({ listing, photos: photos(4) });
  assert.ok(plan.rehook && plan.rehook.fromFrame > plan.shots[2].startFrame && plan.rehook.fromFrame < plan.shots[4].startFrame + plan.shots[4].durationInFrames);
  const guess = buildPhotoTourPlan({ listing, photos: photos(4) }, { style: 'guess-rent' });
  assert.equal(guess.hidePriceUntilEnd, true);
  assert.ok(!guess.hook.text.includes('$'));
  const pov = buildPhotoTourPlan({ listing, photos: photos(4) }, { style: 'pov' });
  for (const p of [guess, pov]) assert.deepEqual(checkPlan(p), []);
});

test('2, 3, 5 and 6 photos are valid; 1 photo still makes a short; no photos is an error', () => {
  for (const n of [1, 2, 3, 5, 6]) {
    const plan = buildPhotoTourPlan({ listing, photos: photos(n) });
    assert.deepEqual(checkPlan(plan), [], `${n} photos`);
    assert.equal(plan.shots[plan.shots.length - 1].role, 'closer');
    assert.ok(plan.sfx.every((c) => c.atFrame >= 0 && c.atFrame < plan.totalFrames));
  }
  assert.throws(() => buildPhotoTourPlan({ listing, photos: [] }));
});

test('without effects the reveal cut is a flash; unsafe callouts are dropped', () => {
  const plan = buildPhotoTourPlan(
    { listing, photos: [...photos(3), { src: 'https://img/x.jpg', tag: 'Perfect for students' }], facts: ['No kids'] },
    { enableEffects: false }
  );
  assert.equal(plan.cuts[plan.cuts.length - 1].kind, 'flash');
  assert.equal(plan.shots[plan.shots.length - 1].tag, '');
  assert.ok(plan.shots[1].callouts.every((c) => c.text !== 'No kids'));
});

test('photo labels become callouts', () => {
  assert.deepEqual(tagsFromLabel('Clip 2/4 • Bedroom & Closet Space'), { tag: 'Bedroom', detail: 'Closet space' });
  assert.deepEqual(tagsFromLabel('Photo 1/4 • Silver Lake Studio'), { tag: 'Silver Lake Studio', detail: '' });
  assert.deepEqual(tagsFromLabel('Clip 3/4 • En-Suite Bath & Pressure'), { tag: 'En-Suite Bath', detail: '' });
  assert.deepEqual(tagsFromLabel('Clip 1/4 • Front Door & Living Area'), { tag: 'Front Door', detail: 'Living area' });
  assert.equal(closerTagFromLabel('Clip 4/4 • Kitchen & Private Balcony'), 'Private Balcony');
  assert.equal(closerTagFromLabel('Clip 4/4 • Backyard Pool & Deck'), 'Backyard Pool');
  assert.equal(closerTagFromLabel('Clip 4/4 • 360° Rooftop Deck'), '360 Rooftop Deck');
});

test('photo tours run their text smaller than video tours', () => {
  const plan = buildPhotoTourPlan({ listing, photos: photos(4) });
  assert.equal(plan.textScale, PHOTO_TEXT_SCALE);
  assert.ok(PHOTO_TEXT_SCALE < 1 && PHOTO_TEXT_SCALE >= 0.75);
});
