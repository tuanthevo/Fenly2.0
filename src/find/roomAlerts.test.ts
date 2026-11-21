import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_DIGEST_MAX, alertDigest, cleanAlertPrefs, listingMatchesAlert, stayFits, type AlertListing, type AlertPrefs } from './roomAlerts';
import { protectedTermsIn } from './factualApplicant';

const PREFS: AlertPrefs = {
  userId: 'renter',
  near: { label: 'Mission', lat: 37.7599, lng: -122.4148, miles: 3 },
  budgetMaxCents: 200000,
  moveInFrom: '2026-12-01',
  stayLength: '6 months',
};

const room = (over: Partial<AlertListing> = {}): AlertListing => ({
  id: 'r1',
  ownerId: 'host',
  city: 'San Francisco',
  neighborhood: 'Noe Valley',
  rentCents: 180000,
  availableFrom: '2026-12-01',
  leaseTerm: '6 months',
  publishedAt: '2026-11-20T10:00:00Z',
  ...over,
});

test('a room matches on place, budget, move-in date and length of stay', () => {
  assert.ok(listingMatchesAlert(room(), PREFS));
  assert.ok(!listingMatchesAlert(room({ city: 'Oakland', neighborhood: 'Temescal' }), PREFS), 'about 9 miles away');
  assert.ok(!listingMatchesAlert(room({ rentCents: 260000 }), PREFS), 'way over budget');
  assert.ok(listingMatchesAlert(room({ rentCents: 215000 }), PREFS), 'a little over budget still counts, like applicant matching');
  assert.ok(!listingMatchesAlert(room({ availableFrom: '2027-03-01' }), PREFS), 'months after the move-in date');
  assert.ok(!listingMatchesAlert(room({ leaseTerm: '12+ months' }), { ...PREFS, stayLength: '3 months' }));
  // Whatever the renter left blank doesn't filter
  assert.ok(listingMatchesAlert(room({ city: 'Fremont', neighborhood: null, rentCents: 900000, leaseTerm: null }), { userId: 'renter', near: null, budgetMaxCents: null, moveInFrom: null, stayLength: null }));
});

test('length of stay: month-to-month fits anything, otherwise within a few months', () => {
  assert.ok(stayFits('Month-to-month', '12+ months'));
  assert.ok(stayFits('6 months', 'Month-to-month'));
  assert.ok(stayFits('6 months', '9 months'));
  assert.ok(stayFits('12+ months', '12+ months'));
  assert.ok(!stayFits('3 months', '12+ months'));
  assert.ok(stayFits(null, '3 months'));
});

test('the digest: new since the last one, never your own room, closest first, capped', () => {
  const rooms = [
    room({ id: 'old', publishedAt: '2026-11-18T00:00:00Z' }),
    room({ id: 'mine', ownerId: 'renter' }),
    room({ id: 'castro', neighborhood: 'Castro' }),
    room({ id: 'mission', neighborhood: 'Mission' }),
    room({ id: 'far', city: 'San Jose', neighborhood: null }),
    ...Array.from({ length: 8 }, (_, i) => room({ id: `extra${i}`, neighborhood: 'Bernal Heights' })),
  ];
  const d = alertDigest(rooms, PREFS, '2026-11-19T00:00:00Z');
  assert.equal(d.total, 10);
  assert.equal(d.rooms.length, ALERT_DIGEST_MAX);
  assert.equal(d.rooms[0].id, 'mission', 'closest first');
  assert.ok(!d.rooms.some((r) => ['old', 'mine', 'far'].includes(r.id)));
});

test('alert settings from the database are cleaned; only logistics are used', () => {
  const p = cleanAlertPrefs({
    user_id: 'u',
    alert_rooms: true,
    alert_place: 'Mission<script>',
    alert_lat: 37.76,
    alert_lng: -122.41,
    alert_miles: 7,
    budget_max_cents: 200000,
    move_in_from: '2026-12-01',
    stay_length: 'forever',
  });
  assert.equal(p?.near?.miles, 5, 'unknown radius -> 5 mi');
  assert.equal(p?.near?.label, 'Mission script');
  assert.equal(p?.stayLength, null);
  assert.equal(cleanAlertPrefs({ user_id: 'u', alert_rooms: false }), null, 'alerts off');
  assert.equal(cleanAlertPrefs({ user_id: 'u', alert_rooms: true, alert_lat: 47.6, alert_lng: -122.3, alert_miles: 5 })?.near, null, 'outside the Bay Area: no place filter');
  for (const key of Object.keys(PREFS)) assert.deepEqual(protectedTermsIn(key), [], key);
});
