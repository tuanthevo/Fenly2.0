import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLifestyle, lifestyleComplete } from './lifestyle';
import { level1Missing, passportLevel, type PassportFacts } from './passportLevel';
import { budgetFit, compareApplicants, moveInFit, scoreApplicant, summarizeApplicants } from './fit';
import { toFactualApplicant } from './factualApplicant';
import {
  activeFilterCount,
  dbListingId,
  findQueryString,
  matchesFindFilters,
  parseFindQuery,
  rentInput,
  rentRangeError,
  toIsoDate,
  toRoomListing,
  visibleMediaTypes,
  type FindListing,
} from './findFilters';
import { similarRooms } from './similarRooms';
import { declineTemplate, roomTakenText } from './hostText';
import { moderationFlags, scamPhrases, shouldHideListing, warningFor } from './moderation';
import { fairHousingIssues } from '../remotion/viral/copy';

const LIFE = { sleep: 'Early bird', cleanliness: 'Tidy', guests: 'Rarely', pets: 'No pets', smoking: 'Never', wfh: 'Some days' };

test('lifestyle: keeps valid answers, maps 1.0 keys, drops the rest', () => {
  assert.deepEqual(cleanLifestyle({ schedule: 'Night owl', tidiness: 'Very tidy', social: 'Quiet' }), { sleep: 'Night owl', cleanliness: 'Very tidy' });
  assert.deepEqual(cleanLifestyle({ sleep: 'Sometimes', pets: 'No pets', other: 'x' }), { pets: 'No pets' });
  assert.deepEqual(cleanLifestyle(null), {});
  assert.deepEqual(cleanLifestyle(['Early bird']), {});
  assert.equal(lifestyleComplete(LIFE), true);
  assert.equal(lifestyleComplete({ ...LIFE, wfh: undefined }), false);
});

test('passport level: level 1 needs every item, then ID, then rent history', () => {
  const base: PassportFacts = {
    phoneVerified: true,
    photoUrl: 'u/photo.jpg',
    bio: 'Hi',
    moveInFrom: '2026-12-01',
    budgetMaxCents: 150000,
    lifestyle: LIFE,
    idVerified: false,
    rentHistoryVerified: false,
  };
  assert.equal(passportLevel(base), 1);
  assert.deepEqual(level1Missing(base), []);
  assert.equal(passportLevel({ ...base, idVerified: true }), 2);
  assert.equal(passportLevel({ ...base, idVerified: true, rentHistoryVerified: true }), 3);
  assert.equal(passportLevel({ ...base, bio: '   ', idVerified: true }), 0, 'ID alone does not skip level 1');
  assert.deepEqual(level1Missing({ ...base, phoneVerified: false, photoUrl: null, budgetMaxCents: null, lifestyle: {} }), ['phone', 'photo', 'budget', 'lifestyle']);
});

test('move-in fit: a week is great, two weeks is ok, more is off', () => {
  const f = (d: Partial<{ moveInDate: string; moveInFrom: string; moveInTo: string }>) => ({ moveInDate: null, moveInFrom: null, moveInTo: null, ...d });
  assert.equal(moveInFit(f({ moveInDate: '2026-12-05' }), '2026-12-01').level, 'great');
  assert.equal(moveInFit(f({ moveInDate: '2026-12-12' }), '2026-12-01').level, 'ok');
  assert.equal(moveInFit(f({ moveInDate: '2027-01-15' }), '2026-12-01').text, "Moves in 45 days after it's free");
  assert.equal(moveInFit(f({ moveInDate: '2026-11-20' }), '2026-12-01').text, "Moves in 11 days before it's free");
  assert.equal(moveInFit(f({ moveInFrom: '2026-11-15', moveInTo: '2026-12-15' }), '2026-12-01').level, 'great', 'inside the window');
  assert.equal(moveInFit(f({ moveInFrom: '2026-12-20', moveInTo: '2026-12-31' }), '2026-12-01').level, 'off');
  assert.equal(moveInFit(f({}), '2026-12-01').level, 'unknown');
  assert.equal(moveInFit(f({}), null).level, 'ok');
});

test('budget fit: within budget, up to 10% over, beyond', () => {
  assert.deepEqual(budgetFit(145000, { budgetMaxCents: 150000 }), { level: 'great', text: 'Budget OK' });
  assert.equal(budgetFit(155000, { budgetMaxCents: 150000 }).level, 'ok');
  assert.equal(budgetFit(155000, { budgetMaxCents: 150000 }).text, '$50/mo over budget');
  assert.equal(budgetFit(200000, { budgetMaxCents: 150000 }).level, 'off');
  assert.equal(budgetFit(145000, { budgetMaxCents: null }).level, 'unknown');
});

test('summary and ordering of applicants', () => {
  const listing = { rentCents: 145000, availableFrom: '2026-12-01' };
  const mk = (id: string, raw: Record<string, unknown>, status = 'submitted', createdAt = '2026-11-01') =>
    scoreApplicant({ id, status, createdAt, facts: toFactualApplicant({ phoneVerified: true, moveInDate: '2026-12-02', budgetMaxCents: 150000, ...raw }) }, listing);
  const a = mk('a', { idVerified: true, passportLevel: 2 });
  const b = mk('b', { idVerified: true, passportLevel: 2 }, 'submitted', '2026-11-02');
  const c = mk('c', { idVerified: true, passportLevel: 2 }, 'shortlisted', '2026-11-03');
  const weak = mk('w', { budgetMaxCents: 100000 });
  assert.equal(summarizeApplicants([a, b, c]), '3 strong fits: verified ID, move-in matches, budget OK.');
  assert.equal(summarizeApplicants([a, weak]), '1 strong fit: verified ID, move-in matches, budget OK. 1 other applicant.');
  assert.equal(summarizeApplicants([weak]), '1 applicant, no strong fits yet: 0 within budget.');
  assert.equal(summarizeApplicants([]), 'No open applications yet.');
  assert.equal(summarizeApplicants([mk('x', {}), mk('y', {})]), '2 strong fits: verified phone, move-in matches, budget OK.');
  assert.deepEqual([weak, b, a, c].sort(compareApplicants).map((x) => x.id), ['c', 'a', 'b', 'w']);
});

test('find filters: parse, match, query string', () => {
  const oakland = { label: 'Oakland', lat: 37.8044, lng: -122.2712, miles: 5 };
  assert.deepEqual(parseFindQuery({ place: 'Oakland', lat: '37.8044', lng: '-122.2712', miles: '5', maxRent: '1500', moveInBy: '2026-12-15' }), {
    near: oakland,
    minRentCents: null,
    maxRentCents: 150000,
    moveInBy: '2026-12-15',
    mustHave: [],
    sort: 'newest',
  });
  // Bad values are dropped: outside Northern California, an odd radius, junk text
  assert.deepEqual(parseFindQuery({ place: 'Los Angeles', lat: '34.05', lng: '-118.24', miles: '5', maxRent: 'abc', moveInBy: 'soon' }), {
    near: null,
    minRentCents: null,
    maxRentCents: null,
    moveInBy: null,
    mustHave: [],
    sort: 'newest',
  });
  assert.equal(parseFindQuery({ place: 'Oakland', lat: '37.8', lng: '-122.27', miles: '7' }).near?.miles, 5, 'unknown radius -> 5 mi');
  assert.equal(parseFindQuery({ place: '<script>', lat: '37.8', lng: '-122.27', miles: '3' }).near?.label, 'script');
  assert.equal(findQueryString({ near: oakland, minRentCents: null, maxRentCents: 150000, moveInBy: null }), 'place=Oakland&lat=37.8&lng=-122.27&miles=5&maxRent=1500', 'coordinates go out rounded to 2 decimals');
  assert.deepEqual(parseFindQuery(Object.fromEntries(new URLSearchParams(findQueryString({ near: oakland, minRentCents: null, maxRentCents: null, moveInBy: null })))).near, { ...oakland, lat: 37.8, lng: -122.27 });

  const mission = { city: 'San Francisco', neighborhood: 'Mission', rentCents: 145000, availableFrom: '2026-12-01' };
  const sf = { label: 'San Francisco', lat: 37.7749, lng: -122.4194, miles: 3 };
  assert.ok(matchesFindFilters(mission, { near: sf, minRentCents: null, maxRentCents: 150000, moveInBy: '2026-12-01' }));
  assert.ok(!matchesFindFilters(mission, { near: { ...oakland, miles: 5 }, minRentCents: null, maxRentCents: null, moveInBy: null }), 'Mission is ~8 mi from Oakland');
  assert.ok(matchesFindFilters(mission, { near: { ...oakland, miles: 10 }, minRentCents: null, maxRentCents: null, moveInBy: null }));
  assert.ok(!matchesFindFilters({ ...mission, city: 'Napa' }, { near: sf, minRentCents: null, maxRentCents: null, moveInBy: null }), 'unknown place: no match');
  assert.ok(matchesFindFilters({ ...mission, city: 'Napa' }, { near: null, minRentCents: null, maxRentCents: null, moveInBy: null }), 'no place filter: shown');
  assert.ok(!matchesFindFilters(mission, { near: null, minRentCents: null, maxRentCents: 140000, moveInBy: null }));
  assert.ok(!matchesFindFilters(mission, { near: null, minRentCents: null, maxRentCents: null, moveInBy: '2026-11-30' }));
  assert.equal(activeFilterCount({ near: sf, minRentCents: null, maxRentCents: null, moveInBy: '2026-12-01' }), 2);

  // Rent range (typed by the renter): min and max, either one alone, swapped when entered backwards
  assert.deepEqual(
    (({ minRentCents, maxRentCents }) => ({ minRentCents, maxRentCents }))(parseFindQuery({ minRent: '1200', maxRent: '1800' })),
    { minRentCents: 120000, maxRentCents: 180000 }
  );
  assert.equal(parseFindQuery({ minRent: '1300' }).minRentCents, 130000);
  assert.deepEqual(
    (({ minRentCents, maxRentCents }) => ({ minRentCents, maxRentCents }))(parseFindQuery({ minRent: '2000', maxRent: '1500' })),
    { minRentCents: 150000, maxRentCents: 200000 }
  );
  assert.equal(parseFindQuery({ minRent: '50' }).minRentCents, null, 'under $100 is ignored');
  assert.equal(findQueryString({ near: null, minRentCents: 120000, maxRentCents: 180000, moveInBy: null }), 'minRent=1200&maxRent=1800');
  assert.ok(!matchesFindFilters(mission, { near: null, minRentCents: 150000, maxRentCents: null, moveInBy: null }), '$1,450 is under a $1,500 min');
  assert.ok(matchesFindFilters(mission, { near: null, minRentCents: 140000, maxRentCents: 150000, moveInBy: null }));
  assert.equal(activeFilterCount({ near: null, minRentCents: 140000, maxRentCents: 150000, moveInBy: null }), 1, 'a rent range counts once');

  // What the renter types
  assert.deepEqual(rentInput(''), { cents: null });
  assert.deepEqual(rentInput('$1,450'), { cents: 145000 });
  assert.ok(rentInput('40').error);
  assert.ok(rentInput('25000').error);
  assert.equal(rentRangeError(200000, 150000), 'Min rent is higher than max rent.');
  assert.equal(rentRangeError(150000, 200000), null);
  assert.equal(rentRangeError(null, 150000), null);
  assert.equal(toIsoDate('Nov 1, 2026', '2026-10-01'), '2026-11-01');
  assert.equal(toIsoDate('Available Now', '2026-10-01'), '2026-10-01');
  assert.equal(toIsoDate('whenever', '2026-10-01'), null);
});

test('toRoomListing adapts a database room for the 1.0 feed, without ages', () => {
  const l: FindListing = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: null,
    description: 'Bright',
    neighborhood: 'Mission',
    city: 'San Francisco',
    rentCents: 145000,
    depositCents: null,
    availableFrom: '2026-12-01',
    leaseTerm: '6 months',
    beds: 1,
    baths: 1,
    amenities: ['Furnished'],
    houseRules: 'No smoking\nQuiet after 10',
    status: 'published',
    videoUrl: 'https://x/v.mp4',
    thumbUrl: 'https://x/t.jpg',
    publishedAt: '2026-11-01T00:00:00Z',
    host: { id: 'h', firstName: 'Hana', photoUrl: null, phoneVerified: true, idVerified: false },
    housemates: [{ firstName: 'Jo', phoneVerified: true, idVerified: true }],
  };
  const room = toRoomListing(l, '2026-11-18');
  assert.equal(room.id, 'db:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(dbListingId(room.id), l.id);
  assert.equal(dbListingId('room-1'), null);
  assert.equal(room.title, 'Room in Mission');
  assert.equal(room.price, 1450);
  assert.equal(room.leaseTerm, '6 Months');
  assert.equal(room.availableDate, 'Dec 1, 2026');
  assert.deepEqual(room.houseRules, ['No smoking', 'Quiet after 10']);
  assert.equal(room.roommates[0].role, 'Housemate · ID verified');
  assert.equal(room.roommates[0].age, undefined);
  assert.equal(toRoomListing({ ...l, availableFrom: '2026-11-01' }, '2026-11-18').availableDate, 'Available Now');
});

test('similar rooms: within ~2 miles, rent ±20%, within 30 days, same area first, then closest', () => {
  const sf = 'San Francisco';
  const taken = { id: 't', city: sf, neighborhood: 'Mission', rentCents: 150000, availableFrom: '2026-12-01' };
  const rooms = [
    { id: 't', city: sf, neighborhood: 'Mission', rentCents: 150000, availableFrom: '2026-12-01' },
    { id: 'near', city: sf, neighborhood: 'Noe Valley', rentCents: 152000, availableFrom: '2026-12-05' },
    { id: 'same', city: sf, neighborhood: 'Mission', rentCents: 170000, availableFrom: '2026-12-10' },
    { id: 'pricey', city: sf, neighborhood: 'Mission', rentCents: 200000, availableFrom: '2026-12-01' },
    { id: 'far', city: sf, neighborhood: 'Marina', rentCents: 150000, availableFrom: '2026-12-01' },
    { id: 'late', city: sf, neighborhood: 'Mission', rentCents: 150000, availableFrom: '2027-03-01' },
    { id: 'castro', city: sf, neighborhood: 'Castro', rentCents: 140000, availableFrom: '2026-11-20' },
    { id: 'oakland', city: 'Oakland', neighborhood: 'Temescal', rentCents: 150000, availableFrom: '2026-12-01' },
  ];
  assert.deepEqual(similarRooms(taken, rooms).map((r) => r.id), ['same', 'castro', 'near']);
  // Works the same in the East Bay
  const temescal = { id: 'x', city: 'Oakland', neighborhood: 'Temescal', rentCents: 150000, availableFrom: '2026-12-01' };
  assert.deepEqual(similarRooms(temescal, rooms).map((r) => r.id), ['oakland']);
  assert.deepEqual(similarRooms(taken, rooms, 1).map((r) => r.id), ['same']);
});

test('host texts pass the fair-housing check', () => {
  const decline = declineTemplate('Sam', 'Mission');
  assert.ok(decline.startsWith('Hi Sam,'));
  assert.deepEqual(fairHousingIssues(decline), []);
  assert.equal(declineTemplate(null, 'Mission').slice(0, 3), 'Hi,');
  assert.equal(roomTakenText('Mission', 4), 'This room in Mission is taken. Here are 4 similar rooms nearby.');
  assert.equal(roomTakenText('Mission', 1), 'This room in Mission is taken. Here is 1 similar room nearby.');
});

test('moderation: scam phrases, flags, hiding and warnings', () => {
  assert.deepEqual(scamPhrases("I'm out of the country, I'll mail you the keys after you send the deposit by Zelle"), [
    'asks for a deposit by app',
    '"I\'m away, I\'ll mail the keys"',
  ]);
  assert.deepEqual(scamPhrases('Happy to show you the room on Saturday'), []);
  const flags = moderationFlags(
    { offPlatform: true, fairHousingPhrases: [], scamPhrases: scamPhrases('wire the deposit before viewing') },
    { scam: true, fairHousing: false, harassment: false, confidence: 0.9, reason: 'pay first' }
  );
  assert.equal(flags[0].category, 'scam');
  assert.equal(flags[0].severity, 'high');
  assert.equal(flags.filter((f) => f.category === 'scam').length, 1, 'AI does not duplicate a heuristic scam flag');
  assert.ok(shouldHideListing(flags));
  assert.match(warningFor(flags) ?? '', /rental scam/);
  const fh = moderationFlags({ offPlatform: false, fairHousingPhrases: ['no kids'], scamPhrases: [] }, null);
  assert.deepEqual(fh.map((f) => f.category), ['fair_housing']);
  assert.equal(shouldHideListing(fh), false);
  assert.equal(warningFor(fh), null);
  assert.deepEqual(moderationFlags({ offPlatform: false, fairHousingPhrases: [], scamPhrases: [] }, { scam: false, fairHousing: false, harassment: false, confidence: 0.1, reason: '' }), []);
});

/* ---------- photo listings in Find ---------- */

const FIND_BASE: FindListing = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Room',
  description: null,
  neighborhood: 'Mission',
  city: 'San Francisco',
  rentCents: 145000,
  depositCents: null,
  availableFrom: '2026-12-01',
  leaseTerm: '6 months',
  beds: 1,
  baths: 1,
  amenities: [],
  houseRules: null,
  status: 'published',
  videoUrl: 'https://x/full.mp4',
  thumbUrl: 'https://x/thumb.jpg',
  publishedAt: null,
  host: { id: 'h', firstName: 'Hana', photoUrl: null, phoneVerified: true, idVerified: false },
  housemates: [],
};

test('toRoomListing carries the media type and the photos; a listing without one is a video listing', () => {
  const photos = [{ url: 'https://x/a.jpg', slot: 'doorway' as const, caption: 'Bright bedroom', width: 2400, height: 1800 }];
  const photoRoom = toRoomListing({ ...FIND_BASE, mediaType: 'photos', photos }, '2026-11-22');
  assert.equal(photoRoom.mediaType, 'photos');
  assert.deepEqual(photoRoom.photos, photos);
  // With its exported MP4 it plays like any tour video
  assert.equal(photoRoom.tourFormat, 'viral_edit');
  const videoRoom = toRoomListing(FIND_BASE, '2026-11-22');
  assert.equal(videoRoom.mediaType, 'video');
  assert.deepEqual(videoRoom.photos, []);
});

test('while photo listings are off, only people allowed to use them see them in Find', () => {
  const rows = [{ id: 1, media_type: 'video' }, { id: 2, media_type: 'photos' }, { id: 3 }];
  assert.deepEqual(visibleMediaTypes(rows, false).map((r) => r.id), [1, 3]);
  assert.deepEqual(visibleMediaTypes(rows, true).map((r) => r.id), [1, 2, 3]);
});

test('must-have filters: only listed room features, kept in the query and counted', async () => {
  const { MUST_HAVE_OPTIONS, EMPTY_FIND_FILTERS: EMPTY, activeFilterCount: count, findQueryString: qs, parseFindQuery: parse, matchesFindFilters: matches } = await import('./findFilters');
  const { protectedTermsIn } = await import('./factualApplicant');
  assert.ok(MUST_HAVE_OPTIONS.includes('Private bath') && MUST_HAVE_OPTIONS.length <= 5);
  for (const option of MUST_HAVE_OPTIONS) assert.deepEqual(protectedTermsIn(option), [], option);
  const filters = { ...EMPTY, mustHave: ['Private bath', 'Furnished'] };
  assert.equal(qs(filters), 'has=Private+bath%2CFurnished');
  assert.deepEqual(parse({ has: 'Private bath,Furnished,Near a church,<b>' }).mustHave, ['Private bath', 'Furnished'], 'anything off the list is dropped');
  assert.deepEqual(parse({}).mustHave, []);
  assert.equal(count(filters), 1);
  assert.equal(count(EMPTY), 0);
  const room = { city: 'San Francisco', neighborhood: 'Mission', rentCents: 145000, availableFrom: '2026-12-01', amenities: ['Private bath', 'Fast WiFi'] };
  assert.ok(matches(room, { ...EMPTY, mustHave: ['Private bath'] }));
  assert.ok(!matches(room, filters), 'every must-have has to be there');
  // Sort: newest unless lowest rent is asked for; it is an order, not a filter, so it is not counted
  assert.equal(parse({ sort: 'rent_low' }).sort, 'rent_low');
  assert.equal(parse({ sort: 'drop table' }).sort, 'newest');
  assert.equal(qs({ ...EMPTY, sort: 'rent_low' }), 'sort=rent_low');
  assert.equal(count({ ...EMPTY, sort: 'rent_low' }), 0);
});
