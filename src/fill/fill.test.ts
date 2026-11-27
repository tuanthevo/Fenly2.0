import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLinkCode, isLinkCode, isListingId, shareUrl, LINK_CODE_LENGTH } from './linkCodes';
import { ATTRIBUTION_WINDOW_MS, channelLabel, parseStoredVia, rememberVia, viaForListing } from './attribution';
import { daysUntil, fillNudges, summarizeByChannel, todayIn } from './fillStatus';
import { allPostTexts, buildSharePosts } from './sharePosts';
import {
  buildListingMeta,
  escapeHtml,
  formatMoveIn,
  isLinkPreviewBot,
  listingHeadline,
  listingSummary,
  shouldCountVisit,
  VISIT_DEDUPE_MS,
} from './publicListing';
import { fairHousingIssues, violatesFairHousing } from '../remotion/viral/copy';
import type { FillListingInfo } from './types';

const LISTING: FillListingInfo = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Sunny room near Dolores Park',
  description: 'Bright room with a big window.',
  neighborhood: 'Mission',
  city: 'San Francisco',
  rentCents: 145000,
  availableFrom: '2026-12-01',
  moveOutDate: '2026-11-30',
  beds: 1,
  baths: 1,
  amenities: ['In-unit laundry', 'Backyard', 'Bike storage', 'Dishwasher'],
  leaseTerm: '6 Months',
};

/* ---------------- link codes ---------------- */

test('link codes are 8 base62 characters and differ each time', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const code = generateLinkCode();
    assert.equal(code.length, LINK_CODE_LENGTH);
    assert.ok(isLinkCode(code), code);
    seen.add(code);
  }
  assert.equal(seen.size, 500);
});

test('link codes skip biased bytes (>= 248) and map the rest evenly', () => {
  let call = 0;
  const source = (n: number) => {
    call++;
    // first batch is all rejected bytes, second batch is 0..15
    return call === 1 ? new Uint8Array(n).fill(250) : Uint8Array.from({ length: n }, (_, i) => i);
  };
  assert.equal(generateLinkCode(source), '01234567');
  assert.equal(generateLinkCode(() => new Uint8Array(16).fill(61)), 'zzzzzzzz');
  assert.equal(generateLinkCode(() => new Uint8Array(16).fill(62)), '00000000');
});

test('isLinkCode / isListingId / shareUrl', () => {
  assert.equal(isLinkCode('k3Fx9aQ2'), true);
  assert.equal(isLinkCode('k3Fx9aQ'), false);
  assert.equal(isLinkCode('k3Fx9aQ2!'), false);
  assert.equal(isLinkCode('../../etc'), false);
  assert.equal(isListingId(LISTING.id), true);
  assert.equal(isListingId('k3Fx9aQ2'), false);
  assert.equal(shareUrl('https://fenly.app/', 'k3Fx9aQ2'), 'https://fenly.app/r/k3Fx9aQ2');
});

/* ---------------- attribution ---------------- */

test('the latest channel link wins; a direct visit does not erase a fresh channel', () => {
  const t0 = 1_000_000;
  const fb = rememberVia(null, { code: 'fbCode01', listingId: 'L1' }, t0);
  assert.deepEqual(fb, { code: 'fbCode01', listingId: 'L1', at: t0, direct: undefined });
  const direct = rememberVia(fb, { code: 'dirCode1', listingId: 'L1', direct: true }, t0 + 1000);
  assert.equal(direct?.code, 'fbCode01');
  const reddit = rememberVia(fb, { code: 'rdCode01', listingId: 'L1' }, t0 + 2000);
  assert.equal(reddit?.code, 'rdCode01');
  // a different listing's direct link replaces it
  assert.equal(rememberVia(fb, { code: 'dirCode2', listingId: 'L2', direct: true }, t0 + 3000)?.code, 'dirCode2');
  // junk codes keep what was there
  assert.equal(rememberVia(fb, { code: '<script>', listingId: 'L1' }, t0 + 4000)?.code, 'fbCode01');
});

test('attribution expires after 7 days and only applies to its listing', () => {
  const t0 = 5_000_000;
  const stored = { code: 'fbCode01', listingId: 'L1', at: t0 };
  assert.equal(viaForListing(stored, 'L1', t0 + ATTRIBUTION_WINDOW_MS), 'fbCode01');
  assert.equal(viaForListing(stored, 'L1', t0 + ATTRIBUTION_WINDOW_MS + 1), null);
  assert.equal(viaForListing(stored, 'L2', t0 + 10), null);
  assert.equal(rememberVia(stored, { code: null, listingId: 'L1' }, t0 + ATTRIBUTION_WINDOW_MS + 1), null);
  assert.deepEqual(parseStoredVia(JSON.stringify(stored)), { ...stored, direct: undefined });
  assert.equal(parseStoredVia('{bad json'), null);
  assert.equal(parseStoredVia(JSON.stringify({ code: 'x', listingId: 'L1', at: 1 })), null);
  assert.equal(channelLabel('group_chat'), 'Group chat');
});

/* ---------------- status math ---------------- */

test('daysUntil counts calendar days in the launch time zone', () => {
  assert.equal(daysUntil('2026-11-30', '2026-11-17'), 13);
  assert.equal(daysUntil('2026-11-17', '2026-11-17'), 0);
  assert.equal(daysUntil('2026-11-10', '2026-11-17'), -7);
  assert.equal(daysUntil('2027-03-15', '2027-03-10'), 5); // across the DST change
  assert.equal(daysUntil(null, '2026-11-17'), null);
  assert.equal(daysUntil('nope', '2026-11-17'), null);
  // 2026-11-18 07:30 UTC is still Nov 17 in San Francisco
  assert.equal(todayIn(new Date('2026-11-18T07:30:00Z')), '2026-11-17');
});

const LINKS = [
  { id: 'fb', channel: 'facebook' as const },
  { id: 'rd', channel: 'reddit' as const },
  { id: 'gc', channel: 'group_chat' as const },
  { id: 'dir', channel: 'direct' as const },
];

test('summarizeByChannel counts views, unique viewers and applications per channel', () => {
  const summary = summarizeByChannel(
    LINKS,
    [
      { link_id: 'fb', anon_id: 'a1' },
      { link_id: 'fb', anon_id: 'a1' },
      { link_id: 'fb', anon_id: 'a2' },
      { link_id: 'rd', anon_id: 'a3' },
      { link_id: 'zz', anon_id: 'a4' }, // unknown link: ignored
    ],
    [{ source_link_id: 'fb' }, { source_link_id: null }, { source_link_id: 'gone' }]
  );
  const fb = summary.rows.find((r) => r.channel === 'facebook')!;
  assert.deepEqual(fb, { channel: 'facebook', views: 3, uniqueViewers: 2, applications: 1, conversion: 0.5 });
  const direct = summary.rows.find((r) => r.channel === 'direct')!;
  assert.equal(direct.applications, 2);
  assert.equal(direct.conversion, null);
  assert.deepEqual(
    summary.rows.map((r) => r.channel),
    ['facebook', 'reddit', 'group_chat', 'direct']
  );
  assert.equal(summary.totals.views, 4);
  assert.equal(summary.totals.applications, 3);
});

test('nudges: nothing to say right after publishing', () => {
  const now = Date.parse('2026-11-17T20:00:00Z');
  const empty = summarizeByChannel(LINKS, [], []);
  assert.deepEqual(fillNudges(empty, { daysLeft: 20, publishedAt: '2026-11-17T19:00:00Z', now }), []);
});

test('nudges: no views, move-out soon, quiet channel, views without applications, best channel', () => {
  const now = Date.parse('2026-11-20T20:00:00Z');
  const publishedAt = '2026-11-16T20:00:00Z'; // 4 days live
  const none = summarizeByChannel(LINKS, [], []);
  const n1 = fillNudges(none, { daysLeft: 5, publishedAt, now });
  assert.deepEqual(n1.map((n) => n.id), ['move_out_soon', 'no_views']);
  assert.match(n1[0].text, /5 days left to fill the room/);

  const visits = Array.from({ length: 35 }, (_, i) => ({ link_id: 'rd', anon_id: `a${i}` }));
  const busy = summarizeByChannel(LINKS, visits, []);
  const n2 = fillNudges(busy, { daysLeft: 20, publishedAt, now });
  assert.deepEqual(n2.map((n) => n.id), ['views_no_applications', 'quiet_facebook']);
  assert.match(n2[1].text, /Facebook group link has no views after 3 days/);

  const converting = summarizeByChannel(LINKS, visits.slice(0, 5), [{ source_link_id: 'rd' }, { source_link_id: 'rd' }]);
  const n3 = fillNudges(converting, { daysLeft: -1, publishedAt, now });
  assert.deepEqual(n3.map((n) => n.id), ['move_out_passed', 'quiet_facebook', 'best_reddit']);
  assert.equal(fillNudges(converting, { daysLeft: -1, publishedAt, now }, 2).length, 2);
});

/* ---------------- share posts ---------------- */

test('share posts carry the facts and each channel gets its own link', () => {
  const urls = {
    facebook: 'https://fenly.app/r/fbCode01',
    reddit: 'https://fenly.app/r/rdCode01',
    tiktok: 'https://fenly.app/r/ttCode01',
    instagram: 'https://fenly.app/r/igCode01',
    group_chat: 'https://fenly.app/r/gcCode01',
    direct: 'https://fenly.app/r/dirCode1',
  };
  const posts = buildSharePosts(LISTING, urls, '2026-11-17');
  assert.match(posts.facebook.text, /Room for rent in Mission, \$1,450\/mo, available Dec 1/);
  assert.ok(posts.facebook.text.includes(urls.facebook));
  assert.equal(posts.reddit.title, '[OFFERING] $1,450 / room in Mission · available Dec 1');
  assert.ok(posts.reddit.body.includes(urls.reddit));
  assert.ok(posts.tiktok.caption.includes(urls.tiktok) && posts.tiktok.caption.includes('#mission'));
  assert.ok(posts.group_chat.text.includes(urls.group_chat));
  for (const text of allPostTexts(posts)) assert.equal(violatesFairHousing(text), false, text);
  // a missing channel link falls back to the direct link
  assert.ok(buildSharePosts(LISTING, { direct: urls.direct }).reddit.body.includes(urls.direct));
});

test('the Instagram caption follows the caption rules: facts before the cut, no link, at most 5 labels, one ask', () => {
  const caption = buildSharePosts(LISTING, { instagram: 'https://fenly.app/r/igCode01', direct: 'https://fenly.app/r/dirCode1' }, '2026-11-17').instagram.caption;
  const visible = caption.slice(0, 125);
  assert.ok(visible.includes('$1,450') && visible.includes('Mission'), visible);
  // captions aren't clickable: the link lives in the bio (the share kit has a "bio link" button)
  assert.doesNotMatch(caption, /https?:|fenly\.app|www\./);
  const tags: string[] = caption.match(/#\w+/g) ?? [];
  assert.ok(tags.length >= 1 && tags.length <= 5, tags.join(' '));
  for (const dead of ['#viral', '#fyp', '#explorepage', '#foryou', '#sfhousing']) assert.ok(!tags.includes(dead), dead);
  assert.equal(new Set(tags).size, tags.length);
  assert.equal((caption.match(/link in bio/gi) ?? []).length, 1);
  assert.ok(caption.includes('room for rent in Mission') || caption.includes('Room for rent in Mission'));
  assert.equal(violatesFairHousing(caption), false);

  const sparse = buildSharePosts({ ...LISTING, rentCents: null, neighborhood: null, availableFrom: null, amenities: [] }, {}).instagram.caption;
  assert.doesNotMatch(sparse, /\$|undefined|null/);
});

test('share posts handle a listing with few facts', () => {
  const sparse: FillListingInfo = { ...LISTING, title: null, rentCents: null, availableFrom: null, beds: null, baths: null, amenities: [], leaseTerm: null, neighborhood: null };
  const posts = buildSharePosts(sparse, { direct: 'https://x/r/dirCode1' });
  assert.equal(posts.reddit.title, '[OFFERING] room in San Francisco · available soon');
  for (const text of allPostTexts(posts)) assert.ok(!/undefined|null|NaN/.test(text), text);
});

/* ---------------- public page helpers ---------------- */

test('formatMoveIn, headline and summary', () => {
  assert.equal(formatMoveIn('2026-12-01'), 'Dec 1');
  assert.equal(formatMoveIn('2026-11-10', '2026-11-17'), 'now');
  assert.equal(formatMoveIn('2026-13-01'), null);
  assert.equal(formatMoveIn(null), null);
  assert.equal(listingHeadline(LISTING), 'Room in Mission · $1,450/mo');
  assert.equal(listingSummary(LISTING, '2026-11-17'), '$1,450/mo · Move in Dec 1 · Mission, San Francisco');
});

test('listing meta tags are escaped (no HTML injection from listing text)', () => {
  const evil = { ...LISTING, title: '"><script>alert(1)</script>', neighborhood: 'Mission & <b>Noe</b>' };
  const meta = buildListingMeta(evil, { url: 'https://fenly.app/r/k3Fx9aQ2?x="y"', imageUrl: 'https://fenly.app/api/media/thumb/1' });
  assert.ok(!meta.includes('<script>'));
  assert.ok(!meta.includes('<b>'));
  assert.ok(meta.includes('&quot;&gt;&lt;script&gt;'));
  assert.ok(meta.includes('og:image" content="https://fenly.app/api/media/thumb/1"'));
  assert.ok(meta.includes('summary_large_image'));
  assert.ok(!buildListingMeta(LISTING, { url: 'u' }).includes('og:image'));
  assert.equal(escapeHtml(`<a href='x'>&</a>`), '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
});

test('preview bots are recognized and do not count as views', () => {
  for (const ua of [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Twitterbot/1.0',
    'WhatsApp/2.23.20.0 A',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Slackbot-LinkExpanding 1.0',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Googlebot/2.1)',
    '',
  ]) {
    assert.equal(isLinkPreviewBot(ua), true, ua);
  }
  for (const ua of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
    // Facebook's in-app browser is a person, not the crawler
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
  ]) {
    assert.equal(isLinkPreviewBot(ua), false, ua);
  }
});

test('one view per browser per 30 minutes', () => {
  const now = 10_000_000;
  assert.equal(shouldCountVisit(null, now), true);
  assert.equal(shouldCountVisit(now - 60_000, now), false);
  assert.equal(shouldCountVisit(now - VISIT_DEDUPE_MS, now), true);
  assert.equal(shouldCountVisit(now + 60_000, now), true); // clock skew: count it
});

/* ---------------- fair housing ---------------- */

test('fairHousingIssues names the phrases to change', () => {
  assert.deepEqual(fairHousingIssues('Perfect for young professionals. No kids please.'), [
    'Perfect for young',
    'No kids',
  ]);
  assert.deepEqual(fairHousingIssues('Great light, quiet street, close to BART.'), []);
  assert.deepEqual(fairHousingIssues(null), []);
  assert.deepEqual(fairHousingIssues('women only, women only'), ['women only']);
});

/* ---------------- neighborhoods ---------------- */

test('nearestNeighborhood prefills from location, only inside the city', async () => {
  const { nearestNeighborhood } = await import('./neighborhoods');
  assert.equal(nearestNeighborhood(37.7596, -122.4148), 'Mission');
  assert.equal(nearestNeighborhood(37.7509, -122.4330), 'Noe Valley');
  assert.equal(nearestNeighborhood(37.7385, -122.4160), 'Bernal Heights');
  assert.equal(nearestNeighborhood(37.8044, -122.2712), null); // Oakland
  assert.equal(nearestNeighborhood(Number.NaN, 1), null);
});

test('share posts for a photo listing say "photo tour"; a video listing keeps "video tour"', () => {
  const urls = { direct: 'https://fenly.app/r/dirCode1' };
  const video = allPostTexts(buildSharePosts(LISTING, urls, '2026-11-17')).join('\n');
  const photos = allPostTexts(buildSharePosts({ ...LISTING, mediaType: 'photos' }, urls, '2026-11-17')).join('\n');
  assert.ok(video.includes('video tour') && !video.includes('photo tour'));
  assert.ok(photos.includes('photo tour'));
  assert.equal(/video/i.test(photos), false, 'a photo listing never promises a video');
  // Nothing else changes: same facts, same links
  assert.equal(photos.replace(/See the short photo tour/g, 'Watch the short video tour').replace(/[Pp]hoto tour/g, (m) => (m[0] === 'P' ? 'Video tour' : 'video tour')), video);
});
