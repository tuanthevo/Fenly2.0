import test from "node:test";
import assert from "node:assert/strict";
import { buildFunnel, buildMediaSplit, median, parseMetricsDays, ratio, type FunnelInput } from "./metrics";

const INPUT: FunnelInput = {
  days: 28,
  events: { fill_started: 40, listing_published: 24, link_shared: 60, link_opened: 900, application_submitted: 72 },
  publishedListings: 24,
  sharedListings: 18,
  listingsWithApplications: 20,
  filledOfThose: 12,
  filled: 12,
  filledLaunchArea: 10,
  medianDaysToFill: 9.25,
  applications: 72,
  applicationsViaSharedLink: 54,
  chosenLongAgo: 5,
  chosenStillActive: 2,
};

test("ratio and median", () => {
  assert.equal(ratio(1, 4), 0.25);
  assert.equal(ratio(3, 0), null);
  assert.equal(ratio(5, 4), 1, "capped at 100%");
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("funnel rows follow Part 6 in order, with rates and advice", () => {
  const r = buildFunnel(INPUT);
  assert.deepEqual(
    r.rows.map((x) => x.id),
    ["post_reply", "reply_start", "start_publish", "publish_share", "open_apply", "apply_fill", "fill_passport"]
  );
  const row = (id: string) => r.rows.find((x) => x.id === id)!;
  assert.equal(row("post_reply").value, null, "not measured in the app");
  assert.equal(row("reply_start").value, "40");
  assert.equal(row("start_publish").rate, 0.6);
  assert.equal(row("publish_share").value, "2.5");
  assert.equal(row("publish_share").rate, 0.75);
  assert.equal(row("open_apply").rate, 0.08);
  assert.equal(row("apply_fill").rate, 0.6);
  assert.equal(row("apply_fill").value, "9.3 days median");
  assert.equal(row("fill_passport").value, "2 of 5");
  assert.equal(row("fill_passport").rate, 0.4);
  for (const x of r.rows) assert.ok(x.ifLow.length > 10, x.id);
});

test("north star per week and virality", () => {
  const r = buildFunnel(INPUT);
  assert.deepEqual(r.northStar, { filledLaunchArea: 10, perWeek: 2.5 });
  assert.equal(r.virality.rate, 0.75);
  assert.equal(buildFunnel({ ...INPUT, days: 7, filledLaunchArea: 3 }).northStar.perWeek, 3);
});

test("an empty week has no rates, never NaN", () => {
  const empty = buildFunnel({
    ...INPUT,
    events: { fill_started: 0, listing_published: 0, link_shared: 0, link_opened: 0, application_submitted: 0 },
    publishedListings: 0,
    sharedListings: 0,
    listingsWithApplications: 0,
    filledOfThose: 0,
    filled: 0,
    filledLaunchArea: 0,
    medianDaysToFill: null,
    applications: 0,
    applicationsViaSharedLink: 0,
    chosenLongAgo: 0,
    chosenStillActive: 0,
  });
  assert.ok(!JSON.stringify(empty).includes("NaN"));
  assert.ok(empty.rows.every((x) => x.rate === null));
  assert.equal(empty.rows.find((x) => x.id === "publish_share")!.value, null);
  assert.equal(empty.virality.rate, null);
});

test("window is 7 or 28 days", () => {
  assert.equal(parseMetricsDays("28"), 28);
  assert.equal(parseMetricsDays("7"), 7);
  assert.equal(parseMetricsDays("365"), 7);
  assert.equal(parseMetricsDays(undefined), 7);
});

/* ---------- video vs photos (the photo listings experiment) ---------- */

test("buildMediaSplit compares video and photo listings: chosen, started, published, time to publish, applicants, days to fill", () => {
  const day = (n: number, hour = 0) => new Date(Date.UTC(2026, 10, n, hour)).toISOString();
  const split = buildMediaSplit({
    chosen: { video: 5, photos: 4 },
    listings: [
      // video: 3 started, 2 published (after 2 h and 6 h), 1 filled after 10 days, 6 applications in all
      { media_type: "video", created_at: day(1), published_at: day(1, 2), filled_at: day(11, 2), applications: 4 },
      { media_type: "video", created_at: day(2), published_at: day(2, 6), filled_at: null, applications: 2 },
      { media_type: null, created_at: day(3), published_at: null, filled_at: null, applications: 0 },
      // photos: 2 started, 2 published (after 1 h and 3 h), both filled (4 and 8 days), 3 applications
      { media_type: "photos", created_at: day(1), published_at: day(1, 1), filled_at: day(5, 1), applications: 3 },
      { media_type: "photos", created_at: day(2), published_at: day(2, 3), filled_at: day(10, 3), applications: 0 },
    ],
  });
  assert.deepEqual(split, [
    { mediaType: "video", chosen: 5, started: 3, published: 2, completionRate: 2 / 3, medianHoursToPublish: 4, applicantsPerListing: 3, filled: 1, medianDaysToFill: 10 },
    { mediaType: "photos", chosen: 4, started: 2, published: 2, completionRate: 1, medianHoursToPublish: 2, applicantsPerListing: 1.5, filled: 2, medianDaysToFill: 6 },
  ]);
});

test("buildMediaSplit with nothing yet shows zeros and no rates, never a division by zero", () => {
  assert.deepEqual(buildMediaSplit({ chosen: { video: 0, photos: 0 }, listings: [] })[1], {
    mediaType: "photos", chosen: 0, started: 0, published: 0, completionRate: null, medianHoursToPublish: null, applicantsPerListing: null, filled: 0, medianDaysToFill: null,
  });
});
