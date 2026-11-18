import test from "node:test";
import assert from "node:assert/strict";
import { publicOrigin, toFillListingInfo } from "./fillRoutes";
import { renderListingPage, renderNotFoundPage } from "./publicPage";
import { buildListingMeta } from "../src/fill/publicListing";

const ROW = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  status: "published",
  title: "Sunny room",
  description: "Bright room.",
  neighborhood: "Mission",
  city: "San Francisco",
  rent_cents: 145000,
  available_from: "2026-12-01",
  move_out_date: "2026-11-30",
  lease_term: "6 Months",
  beds: 1,
  baths: "1.5",
  amenities: ["Laundry"],
  caption: null,
};

test("toFillListingInfo maps database rows (baths come back from numeric as text)", () => {
  const info = toFillListingInfo(ROW);
  assert.equal(info.baths, 1.5);
  assert.equal(info.rentCents, 145000);
  assert.deepEqual(toFillListingInfo({ id: "x" }).amenities, []);
  assert.equal(toFillListingInfo({ id: "x" }).city, "San Francisco");
});

test("publicOrigin prefers APP_URL, else forwarded proto/host, and never trusts a strange host", () => {
  const req = (headers: Record<string, string>, protocol = "http") => ({ headers, protocol }) as any;
  assert.equal(publicOrigin(req({ host: "x" }), { APP_URL: "https://fenly.app/" }), "https://fenly.app");
  assert.equal(publicOrigin(req({ host: "x" }), { APP_URL: "MY_APP_URL" }), "http://x");
  assert.equal(
    publicOrigin(req({ host: "internal", "x-forwarded-proto": "https", "x-forwarded-host": "fenly.vercel.app" }), {}),
    "https://fenly.vercel.app"
  );
  assert.equal(publicOrigin(req({ host: "192.168.1.23:3000" }), {}), "http://192.168.1.23:3000");
  assert.equal(publicOrigin(req({ host: 'evil.com"><script>' }), {}), "http://localhost");
  assert.equal(publicOrigin(req({ host: "a", "x-forwarded-proto": "javascript" }), {}), "http://a");
});

test("listing page escapes listing text, shows facts, and links Apply with the channel code", () => {
  const info = toFillListingInfo({ ...ROW, title: "<img src=x onerror=alert(1)>", description: "Tom & Jerry's \"room\"" });
  const html = renderListingPage({
    listing: info,
    status: "published",
    metaTags: buildListingMeta(info, { url: "https://fenly.app/r/fbCode01", imageUrl: "https://fenly.app/api/media/thumb/a.jpg" }),
    videoUrl: "https://x.supabase.co/storage/v1/object/sign/listing-videos/a/full.mp4?token=t&x=1",
    posterUrl: "https://fenly.app/api/media/thumb/a.jpg",
    applyHref: "/?apply=aaaa&via=fbCode01",
    findHref: "/",
    today: "2026-11-17",
  });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("Tom &amp; Jerry&#39;s &quot;room&quot;"));
  assert.ok(html.includes("$1,450/mo"));
  assert.ok(html.includes("Move in Dec 1"));
  assert.ok(html.includes("Mission, San Francisco"));
  assert.ok(html.includes('href="/?apply=aaaa&amp;via=fbCode01"'));
  assert.ok(html.includes("token=t&amp;x=1")); // URLs inside attributes are escaped too
  assert.ok(html.includes('property="og:image"'));
  assert.ok(html.includes("Apply with your Passport"));
  assert.ok(!/address:/i.test(html));
});

test("a filled listing says so and offers similar rooms instead of Apply", () => {
  const html = renderListingPage({
    listing: toFillListingInfo(ROW),
    status: "filled",
    metaTags: "",
    videoUrl: null,
    posterUrl: null,
    applyHref: "/?apply=x",
    findHref: "/",
    today: "2026-11-17",
  });
  assert.ok(html.includes("This room is taken"));
  assert.ok(!html.includes("Apply with your Passport"));
  assert.ok(renderNotFoundPage("/").includes("isn&#39;t available") || renderNotFoundPage("/").includes("isn't available"));
});
