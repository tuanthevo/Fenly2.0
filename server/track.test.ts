import test from "node:test";
import assert from "node:assert/strict";
import { CLIENT_EVENT_NAMES, MAX_PROPS_BYTES, buildEventRow, cleanProps, track, type EventRow } from "./track";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "22222222-2222-4222-8222-222222222222";

test("buildEventRow rejects unknown events and honors a narrower allowlist", () => {
  assert.deepEqual(buildEventRow("drop_table", {}), { ok: false, reason: "unknown_event" });
  assert.equal(buildEventRow("listing_published", {}).ok, true);
  assert.equal(buildEventRow("listing_published", {}, {}, CLIENT_EVENT_NAMES).ok, false);
  assert.equal(buildEventRow("feed_view", {}, {}, CLIENT_EVENT_NAMES).ok, true);
});

test("buildEventRow keeps valid ids and drops malformed ones", () => {
  const good = buildEventRow("listing_open", {}, { userId: USER_ID, anonId: "anon_12345678", listingId: LISTING_ID });
  assert.ok(good.ok);
  assert.equal(good.row.user_id, USER_ID);
  assert.equal(good.row.anon_id, "anon_12345678");
  assert.equal(good.row.listing_id, LISTING_ID);

  const bad = buildEventRow("listing_open", {}, { userId: "admin", anonId: "x", listingId: "'; drop" });
  assert.ok(bad.ok);
  assert.equal(bad.row.user_id, null);
  assert.equal(bad.row.anon_id, null);
  assert.equal(bad.row.listing_id, null);
});

test("cleanProps drops personal data keys and non-JSON values", () => {
  const props = cleanProps({
    channel: "reddit",
    email: "a@b.co",
    phoneNumber: "+1415",
    full_name: "Sam",
    home_address: "1 Main",
    access_token: "x",
    count: 3,
    nan: Number.NaN,
    fn: () => 1,
    nested: { ok: true, contactEmail: "x", deeper: { deepest: { fourthLevel: { gone: 1 } } } },
    list: [1, "a", { phone: "x", keep: 1 }],
  });
  assert.deepEqual(props, {
    channel: "reddit",
    count: 3,
    nested: { ok: true, deeper: { deepest: {} } },
    list: [1, "a", { keep: 1 }],
  });
  assert.deepEqual(cleanProps("nope"), {});
  assert.deepEqual(cleanProps([1, 2]), {});
});

test("cleanProps caps long strings; oversized props become { truncated: true }", () => {
  const long = cleanProps({ note: "x".repeat(1000) });
  assert.equal((long.note as string).length, 300);

  const big: Record<string, string> = {};
  for (let i = 0; i < 30; i++) big[`k${i}`] = "y".repeat(299);
  const built = buildEventRow("feed_view", big);
  assert.ok(built.ok);
  assert.deepEqual(built.row.props, { truncated: true });
  assert.ok(JSON.stringify(built.row.props).length < MAX_PROPS_BYTES);
});

test("track writes the cleaned row and never throws", async () => {
  const rows: EventRow[] = [];
  assert.equal(await track("fill_started", { step: 1, email: "x" }, { userId: USER_ID }, async (row) => void rows.push(row)), true);
  assert.deepEqual(rows, [{ name: "fill_started", user_id: USER_ID, anon_id: null, listing_id: null, props: { step: 1 } }]);

  const quiet = { warn: console.warn, error: console.error };
  console.warn = () => {};
  console.error = () => {};
  try {
    assert.equal(await track("not_an_event", {}, {}, async (row) => void rows.push(row)), false);
    assert.equal(rows.length, 1);
    assert.equal(
      await track("feed_view", {}, {}, async () => {
        throw new Error("db down");
      }),
      false
    );
  } finally {
    console.warn = quiet.warn;
    console.error = quiet.error;
  }
});

test("track without Supabase configured is a quiet no-op", async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  try {
    assert.equal(await track("feed_view"), true);
  } finally {
    if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
    if (saved.key !== undefined) process.env.SUPABASE_SECRET_KEY = saved.key;
  }
});
