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
  assert.ok(html.includes(">Apply to this room<"));
  // Brand font, and white text only on the darker terracotta (4.5:1), never on #D06C4E
  assert.ok(html.includes("fonts.googleapis.com/css2?family=Plus+Jakarta+Sans"));
  const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  for (const rule of style.split("}")) assert.ok(!(rule.includes("color:#fff") && /var\(--accent\)|#D06C4E/i.test(rule)), rule);
  assert.ok(!/opacity:\.7/.test(html));
  assert.ok(!/address:/i.test(html));
});

test("listing page names the host and shows a verified badge only when it is backed", () => {
  const page = (host?: { firstName: string | null; verified: boolean }) =>
    renderListingPage({
      listing: toFillListingInfo(ROW),
      status: "published",
      metaTags: "",
      videoUrl: null,
      posterUrl: null,
      applyHref: "/?apply=aaaa",
      findHref: "/",
      today: "2026-11-17",
      host,
    });
  assert.ok(page({ firstName: "<b>Ana</b>", verified: true }).includes("Listed by &lt;b&gt;Ana&lt;/b&gt;"));
  assert.ok(page({ firstName: "Ana", verified: true }).includes("Verified"));
  assert.ok(!page({ firstName: "Ana", verified: false }).includes(">Verified<"));
  assert.ok(page({ firstName: "Ana", verified: false }).includes("No phone or ID check yet"));
  assert.ok(page({ firstName: null, verified: false }).includes("Listed by a host on Fenn"));
  assert.ok(!page().includes("Listed by"));
  // No media: a calm placeholder, never an empty black box
  assert.ok(!page().includes('class="video"'));
});

test("listing page shows the security deposit when the host set one", () => {
  const page = (row: Record<string, unknown>) =>
    renderListingPage({
      listing: toFillListingInfo({ ...ROW, ...row }),
      status: "published",
      metaTags: "",
      videoUrl: null,
      posterUrl: null,
      applyHref: "/?apply=aaaa",
      findHref: "/",
      today: "2026-11-17",
    });
  assert.ok(page({ deposit_cents: 145000 }).includes("$1,450 deposit"));
  assert.ok(page({ deposit_cents: 0 }).includes("No deposit"));
  assert.ok(!/deposit</i.test(page({ deposit_cents: null })), "no chip when unknown");
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

test("listing page stays small and paints the cover first on mobile data", () => {
  const info = toFillListingInfo({
    ...ROW,
    description: "A long description. ".repeat(190),
    amenities: ["Furnished", "In-unit laundry", "Private bath", "Backyard", "Bike storage", "Dishwasher", "Fast wifi", "Utilities included"],
  });
  const html = renderListingPage({
    listing: info,
    status: "published",
    metaTags: buildListingMeta(info, { url: "https://fenly.app/r/fbCode01", imageUrl: "https://fenly.app/api/media/thumb/a.jpg" }),
    videoUrl: "https://x.supabase.co/storage/v1/object/sign/listing-videos/a/full.mp4?token=t",
    posterUrl: "https://x.supabase.co/storage/v1/object/sign/listing-thumbnails/a/thumb.jpg?token=t",
    applyHref: "/?apply=aaaa&via=fbCode01",
    findHref: "/",
    today: "2026-11-17",
  });
  const bytes = Buffer.byteLength(html, "utf8");
  assert.ok(bytes < 20_000, `listing page is ${bytes} bytes`);
  assert.ok(html.includes('<link rel="preconnect" href="https://x.supabase.co" crossorigin>'));
  assert.ok(/<link rel="preload" as="image" href="https:\/\/x\.supabase\.co[^"]*thumb\.jpg[^"]*" fetchpriority="high">/.test(html));
  assert.ok(html.includes('preload="none"'), "the video waits for the cover");
  assert.ok(!/<script/i.test(html), "no JavaScript on the listing page");
});

test("a photo listing's page says it is a photo tour made from the host's photos; a video listing's page does not", () => {
  const page = (mediaType?: "video" | "photos") =>
    renderListingPage({
      listing: toFillListingInfo({ ...ROW, media_type: mediaType }),
      status: "published",
      metaTags: "",
      videoUrl: "https://x.supabase.co/v.mp4",
      posterUrl: "https://fenly.app/api/media/thumb/a.jpg",
      applyHref: "/?apply=aaaa",
      findHref: "/",
      today: "2026-11-17",
    });
  const photos = page("photos");
  assert.ok(photos.includes("Photo tour. The area is shown"));
  assert.ok(photos.includes("Made from the host&#39;s photos"));
  assert.ok(photos.includes('aria-label="Photo tour of the room'));
  for (const html of [page("video"), page()]) {
    assert.ok(html.includes("Video tour. The area is shown"));
    assert.equal(html.includes("Made from the host"), false);
  }
  assert.equal(toFillListingInfo({ id: "x" }).mediaType, "video");
});
