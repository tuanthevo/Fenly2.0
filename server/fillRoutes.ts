/**
 * Fenly 2.0 Fill routes: drafts, publishing, tracked links, the public listing
 * page (/r/<code>), fill status and applications.
 *
 * Owner actions run through a user-scoped Supabase client so row-level
 * security applies; the admin client is used only for public reads of published
 * listings, link visits, events and signed media URLs.
 */
import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentAccessToken, currentUser, requireUser } from "./auth.js";
import { getAdminClient, getUserClient } from "./supabase.js";
import { track } from "./track.js";
import { renderListingPage, renderNotFoundPage } from "./publicPage.js";
import { checkText, recordFlags } from "./moderation.js";
import { notify } from "./notify.js";
import { shouldHideListing } from "../src/find/moderation.js";
import { generateLinkCode, isLinkCode, isListingId, shareUrl } from "../src/fill/linkCodes.js";
import {
  PUBLISH_PROBLEM_TEXT,
  isIsoDate,
  listingFairHousingIssues,
  mediaTypeOf,
  publishProblems,
  type PhotoState,
  sanitizeListingPatch,
  validRentCents,
  depositCheck,
} from "../src/fill/listingRules.js";
import { allPostTexts, buildSharePosts } from "../src/fill/sharePosts.js";
import { buildListingMeta, isLinkPreviewBot, shouldCountVisit } from "../src/fill/publicListing.js";
import { daysUntil, fillNudges, summarizeByChannel, todayIn } from "../src/fill/fillStatus.js";
import { canProceedWithPhotos, isPhotoSlot, type PhotoSlot } from "../src/fill/photoShots.js";
import { getFlags } from "./flags.js";
import { isAdminUser } from "./routeKit.js";
import { SHARE_CHANNELS, isShareChannel, type FillListingInfo, type ShareChannel } from "../src/fill/types.js";

const LISTING_COLUMNS =
  "id, owner_id, status, title, description, neighborhood, city, rent_cents, deposit_cents, available_from, move_out_date, lease_term, lease_permission, beds, baths, square_feet, amenities, house_rules, caption, viral_edit, copy_approved_at, published_at, filled_at, created_at, updated_at, media_type";
const PUBLIC_COLUMNS =
  "id, status, title, description, neighborhood, city, rent_cents, deposit_cents, available_from, move_out_date, lease_term, beds, baths, amenities, caption, media_type";

type ListingRow = Record<string, any> & { id: string; status: string; media_type?: string | null };
type PublicLink = { id: string; listing_id: string; channel: ShareChannel; code: string };

export function toFillListingInfo(row: Record<string, any>): FillListingInfo {
  return {
    id: row.id,
    title: row.title ?? null,
    description: row.description ?? null,
    neighborhood: row.neighborhood ?? null,
    city: row.city ?? "San Francisco",
    rentCents: row.rent_cents ?? null,
    depositCents: row.deposit_cents ?? null,
    availableFrom: row.available_from ?? null,
    moveOutDate: row.move_out_date ?? null,
    beds: row.beds ?? null,
    baths: row.baths == null ? null : Number(row.baths),
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    leaseTerm: row.lease_term ?? null,
    caption: row.caption ?? null,
    mediaType: mediaTypeOf(row),
  };
}

/** Where public links point: APP_URL when set, else the address this request came in on. */
export function publicOrigin(req: Pick<Request, "headers" | "protocol">, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_URL?.trim();
  if (configured && /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(configured)) return configured.replace(/\/+$/, "");
  const first = (value: unknown) => String(Array.isArray(value) ? value[0] : value ?? "").split(",")[0].trim();
  const proto = first(req.headers["x-forwarded-proto"]) || req.protocol || "http";
  const host = first(req.headers["x-forwarded-host"]) || first(req.headers.host) || "localhost";
  const safeHost = /^[A-Za-z0-9.-]+(:\d+)?$/.test(host) ? host : "localhost";
  return `${proto === "https" ? "https" : "http"}://${safeHost}`;
}

function userDb(res: Response): SupabaseClient | null {
  const token = currentAccessToken(res);
  const db = token ? getUserClient(token) : null;
  if (!db) res.status(503).json({ error: "supabase_not_configured" });
  return db;
}

function dbError(res: Response, error: { code?: string; message: string }, context: string) {
  if (error.code === "23514") return res.status(409).json({ error: "check_failed", message: "That change isn't allowed for this listing." });
  if (error.code === "42501") return res.status(403).json({ error: "not_allowed" });
  console.error(`${context}:`, error.message);
  return res.status(500).json({ error: "database_error" });
}

/** The caller's own listing, or null after sending 404. */
async function ownListing(db: SupabaseClient, res: Response, id: string, userId: string): Promise<ListingRow | null> {
  if (!isListingId(id)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const { data, error } = await db.from("listings").select(LISTING_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    dbError(res, error, "load listing");
    return null;
  }
  if (!data || data.owner_id !== userId) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return data as ListingRow;
}

/** Makes sure the listing has one tracked link per channel; returns all of them. */
async function ensureLinks(db: SupabaseClient, listingId: string) {
  const { data: existing, error } = await db.from("listing_links").select("id, channel, code").eq("listing_id", listingId);
  if (error) throw new Error(error.message);
  const links = [...(existing ?? [])] as { id: string; channel: ShareChannel; code: string }[];
  for (const channel of SHARE_CHANNELS) {
    if (links.some((l) => l.channel === channel)) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = generateLinkCode((n) => new Uint8Array(randomBytes(n)));
      const inserted = await db
        .from("listing_links")
        .insert({ listing_id: listingId, channel, code })
        .select("id, channel, code")
        .single();
      if (!inserted.error) {
        links.push(inserted.data as { id: string; channel: ShareChannel; code: string });
        break;
      }
      if (inserted.error.code !== "23505") throw new Error(inserted.error.message);
      // code collision (or a parallel publish made this channel's link): look again
      const again = await db.from("listing_links").select("id, channel, code").eq("listing_id", listingId).eq("channel", channel).maybeSingle();
      if (again.data) {
        links.push(again.data as { id: string; channel: ShareChannel; code: string });
        break;
      }
    }
  }
  return SHARE_CHANNELS.map((c) => links.find((l) => l.channel === c)).filter(Boolean) as {
    id: string;
    channel: ShareChannel;
    code: string;
  }[];
}

const ANON_COOKIE = "fenly_aid";
const ANON_ID = /^[A-Za-z0-9_-]{8,64}$/;

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function referrerHost(req: Request): string | null {
  const ref = req.get("referer");
  if (!ref) return null;
  try {
    return new URL(ref).hostname.slice(0, 100) || null;
  } catch {
    return null;
  }
}

/**
 * Scam / fair-housing check on a newly published listing (and on later text edits). Flags go to the review
 * queue; a high-risk scam flag hides the room from Find (its link keeps working).
 * Returns true when the listing was hidden for review. Never throws.
 */
async function moderateListing(listing: ListingRow): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const text = [listing.title, listing.description, listing.house_rules].filter(Boolean).join(" — ");
    if (!admin || !text) return false;
    const { flags } = await checkText(text, "listing");
    await recordFlags(admin, "listing", listing.id, flags.filter((f) => f.category !== "off_platform"));
    if (!shouldHideListing(flags)) return false;
    await admin.from("listings").update({ hidden_at: new Date().toISOString() }).eq("id", listing.id);
    return true;
  } catch (error) {
    console.error("listing moderation:", error instanceof Error ? error.message : error);
    return false;
  }
}

const PHOTO_COLUMNS = "id, slot, position, storage_path, width, height, caption, caption_approved, phash, qc_flags";

/** A listing's photos in tour order. An error (the table missing before migration 0008 is run) reads as no photos. */
async function listingPhotos(db: SupabaseClient, listingId: string): Promise<Record<string, any>[]> {
  const { data, error } = await db.from("listing_photos").select(PHOTO_COLUMNS).eq("listing_id", listingId).order("position").order("created_at");
  if (error) return [];
  return data ?? [];
}

function photoState(rows: Record<string, any>[]): PhotoState {
  const slots = rows.map((r) => r.slot).filter(isPhotoSlot) as PhotoSlot[];
  return { slots, captionsApproved: canProceedWithPhotos(slots) && rows.every((r) => r.caption_approved === true) };
}

/** Photo listings are open to everyone once the flag is on, and to admins before that. */
export function photoListingsAllowed(res: Response): boolean {
  return getFlags().photo_listings || isAdminUser(currentUser(res));
}

export function registerFillRoutes(app: Express): void {
  // Start a draft: the two-question start (move-out date, rent for the room).
  app.post("/api/listings", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const { moveOutDate, rentCents } = req.body ?? {};
    if (!isIsoDate(moveOutDate)) return res.status(400).json({ error: "invalid", errors: ["Pick the date you need the room filled."] });
    if (!validRentCents(rentCents)) return res.status(400).json({ error: "invalid", errors: ["Rent must be between $100 and $20,000."] });
    const db = userDb(res);
    if (!db) return;
    const { data, error } = await db
      .from("listings")
      .insert({ owner_id: user.id, move_out_date: moveOutDate, available_from: moveOutDate, rent_cents: rentCents })
      .select(LISTING_COLUMNS)
      .single();
    if (error) return dbError(res, error, "create listing");
    await track("fill_started", {}, { userId: user.id, listingId: data.id });
    res.status(201).json({ listing: data });
  });

  // The host's listings (Fill home).
  app.get("/api/listings/mine", requireUser(), async (_req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    if (!db) return;
    const { data, error } = await db
      .from("listings")
      .select("id, status, title, neighborhood, city, rent_cents, move_out_date, lease_permission, published_at, created_at, updated_at")
      .eq("owner_id", user.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return dbError(res, error, "list listings");
    // The list shows an area: the city where there's no neighborhood list
    res.json({ listings: (data ?? []).map((l) => ({ ...l, neighborhood: l.neighborhood || l.city })) });
  });

  // One listing with its media (signed URLs, for resuming a draft) and links.
  app.get("/api/listings/:id", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    if (!db) return;
    const listing = await ownListing(db, res, req.params.id, user.id);
    if (!listing) return;
    const [media, links, photoRows] = await Promise.all([
      db.from("listing_media").select("id, kind, bucket, path, duration_ms, width, height, bytes").eq("listing_id", listing.id),
      db.from("listing_links").select("id, channel, code").eq("listing_id", listing.id),
      listingPhotos(db, listing.id),
    ]);
    const photoUrls = photoRows.length
      ? (await db.storage.from("listing-photos").createSignedUrls(photoRows.map((p) => p.storage_path), 3600)).data ?? []
      : [];
    if (media.error) return dbError(res, media.error, "load media");
    const withUrls = await Promise.all(
      (media.data ?? []).map(async (m) => {
        const signed = await db.storage.from(m.bucket).createSignedUrl(m.path, 3600);
        return { ...m, signedUrl: signed.data?.signedUrl ?? null };
      })
    );
    const origin = publicOrigin(req);
    res.json({
      listing,
      media: withUrls,
      photos: photoRows.map((p) => ({ ...p, signedUrl: photoUrls.find((u) => u.path === p.storage_path)?.signedUrl ?? null })),
      links: (links.data ?? []).map((l) => ({ ...l, url: shareUrl(origin, l.code) })),
    });
  });

  // Save lease check, details, copy and the video edit. Fair-housing hits are refused.
  app.patch("/api/listings/:id", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const result = sanitizeListingPatch(req.body);
    if (!result.ok) return res.status(400).json({ error: "invalid", errors: result.errors });
    const { patch } = result;
    // Choosing photos needs the feature; switching back to video is always allowed
    if (patch.media_type === "photos" && !photoListingsAllowed(res)) return res.status(404).json({ error: "feature_off", feature: "photo_listings" });
    const issues = listingFairHousingIssues({
      title: patch.title,
      description: patch.description,
      house_rules: patch.house_rules,
      caption: patch.caption,
      video: patch.viral_edit,
    });
    if (issues.length) return res.status(422).json({ error: "fair_housing", issues });
    const db = userDb(res);
    if (!db) return;
    const listing = await ownListing(db, res, req.params.id, user.id);
    if (!listing) return;
    if (Object.keys(patch).length === 0) return res.json({ listing });
    // The deposit limit is enforced here too, not only in the form: the deposit is shown on the public page
    if ("deposit_cents" in patch || "rent_cents" in patch) {
      const rent = patch.rent_cents ?? listing.rent_cents ?? 0;
      const deposit = "deposit_cents" in patch ? patch.deposit_cents ?? null : listing.deposit_cents ?? null;
      const check = depositCheck(rent, deposit);
      if (check.error) return res.status(400).json({ error: "invalid", message: check.error });
    }
    const { data, error } = await db.from("listings").update(patch).eq("id", listing.id).select(LISTING_COLUMNS).single();
    if (error) return dbError(res, error, "update listing");
    // A live listing whose text really changed gets the same scam check as at publish
    // (saving the same text again must not run the AI check or refill the review queue)
    const textChanged = (["title", "description", "house_rules"] as const).some((k) => k in patch && (patch[k] ?? null) !== (listing[k] ?? null));
    const underReview = (data as ListingRow).status === "published" && textChanged ? await moderateListing(data as ListingRow) : false;
    res.json({ listing: data, underReview });
  });

  // Publish: lease check, approved copy, video + cover, fair housing; then links and posts.
  app.post("/api/listings/:id/publish", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    if (!db) return;
    const listing = await ownListing(db, res, req.params.id, user.id);
    if (!listing) return;
    const media = await db.from("listing_media").select("kind").eq("listing_id", listing.id);
    if (media.error) return dbError(res, media.error, "load media");
    const isPhotos = mediaTypeOf(listing) === "photos";
    if (isPhotos && !photoListingsAllowed(res)) return res.status(404).json({ error: "feature_off", feature: "photo_listings" });
    const photoRows = isPhotos ? await listingPhotos(db, listing.id) : [];
    const problems = publishProblems(listing as any, (media.data ?? []).map((m) => m.kind), photoState(photoRows));
    if (problems.length) {
      return res.status(409).json({ error: "not_ready", problems, messages: problems.map((p) => PUBLISH_PROBLEM_TEXT[p]) });
    }
    const info = toFillListingInfo(listing);
    const origin = publicOrigin(req);
    const draftPosts = buildSharePosts(info, { direct: shareUrl(origin, "XXXXXXXX") }, todayIn(new Date()));
    const issues = listingFairHousingIssues({
      title: listing.title,
      description: listing.description,
      house_rules: listing.house_rules,
      caption: listing.caption,
      video: listing.viral_edit,
      photo_captions: photoRows.map((p) => p.caption),
      share_posts: allPostTexts(draftPosts),
    });
    if (issues.length) return res.status(422).json({ error: "fair_housing", issues });

    let links;
    try {
      links = await ensureLinks(db, listing.id);
    } catch (error) {
      console.error("create links:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "links_failed" });
    }
    let published = listing;
    let underReview = false;
    if (listing.status !== "published") {
      const { data, error } = await db
        .from("listings")
        .update({ status: "published", published_at: listing.published_at ?? new Date().toISOString() })
        .eq("id", listing.id)
        .select(LISTING_COLUMNS)
        .single();
      if (error) return dbError(res, error, "publish listing");
      published = data as ListingRow;
      await track("listing_published", { channels: links.length, media_type: mediaTypeOf(listing) }, { userId: user.id, listingId: listing.id });
      underReview = await moderateListing(published);
    }
    const urls = Object.fromEntries(links.map((l) => [l.channel, shareUrl(origin, l.code)])) as Record<ShareChannel, string>;
    res.json({
      listing: published,
      links: links.map((l) => ({ ...l, url: urls[l.channel] })),
      posts: buildSharePosts(toFillListingInfo(published), urls, todayIn(new Date())),
      underReview,
    });
  });

  // Fill status: views and applications per channel, days left, nudges.
  app.get("/api/listings/:id/status", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    if (!db) return;
    const listing = await ownListing(db, res, req.params.id, user.id);
    if (!listing) return;
    const linksResult = await db.from("listing_links").select("id, channel, code").eq("listing_id", listing.id);
    if (linksResult.error) return dbError(res, linksResult.error, "load links");
    const links = (linksResult.data ?? []).filter((l) => isShareChannel(l.channel)) as { id: string; channel: ShareChannel; code: string }[];
    const [visits, applications] = await Promise.all([
      links.length
        ? db.from("link_visits").select("link_id, anon_id").in("link_id", links.map((l) => l.id)).limit(20000)
        : Promise.resolve({ data: [], error: null }),
      db.from("applications").select("source_link_id, status").eq("listing_id", listing.id).neq("status", "withdrawn"),
    ]);
    if (visits.error) return dbError(res, visits.error, "load visits");
    if (applications.error) return dbError(res, applications.error, "load applications");
    const summary = summarizeByChannel(links, visits.data ?? [], applications.data ?? []);
    const now = new Date();
    const daysLeft = daysUntil(listing.move_out_date, todayIn(now));
    const origin = publicOrigin(req);
    res.json({
      listing: {
        id: listing.id,
        status: listing.status,
        title: listing.title,
        move_out_date: listing.move_out_date,
        published_at: listing.published_at,
        rent_cents: listing.rent_cents,
        neighborhood: listing.neighborhood,
      },
      summary,
      daysLeft,
      nudges: fillNudges(summary, { daysLeft, publishedAt: listing.published_at, now: now.getTime() }),
      links: links.map((l) => ({ ...l, url: shareUrl(origin, l.code) })),
    });
  });

  // Apply to a published listing; `via` (a link code) records the channel.
  app.post("/api/listings/:id/apply", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const id = req.params.id;
    if (!isListingId(id)) return res.status(404).json({ error: "not_found" });
    const { note, moveInDate, via, introVideoPath } = req.body ?? {};
    const intro =
      typeof introVideoPath === "string" && introVideoPath.length <= 200 && introVideoPath.startsWith(`${user.id}/`) && /^[A-Za-z0-9_-]+\.(webm|mp4|mov)$/.test(introVideoPath.slice(user.id.length + 1))
        ? introVideoPath
        : null;
    if (introVideoPath != null && !intro) return res.status(400).json({ error: "invalid", errors: ["That intro video didn't upload correctly."] });
    if (note != null && (typeof note !== "string" || note.length > 1000)) {
      return res.status(400).json({ error: "invalid", errors: ["Keep the note under 1,000 characters."] });
    }
    if (moveInDate != null && !isIsoDate(moveInDate)) return res.status(400).json({ error: "invalid", errors: ["Pick a move-in date."] });
    const db = userDb(res);
    if (!db) return;

    let sourceLinkId: string | null = null;
    let channel: ShareChannel = "direct";
    const admin = getAdminClient();
    if (admin && isLinkCode(via)) {
      const link = await admin.from("listing_links").select("id, channel").eq("code", via).eq("listing_id", id).maybeSingle();
      if (link.data) {
        sourceLinkId = link.data.id;
        channel = link.data.channel as ShareChannel;
      }
    }
    const { data, error } = await db
      .from("applications")
      .insert({
        listing_id: id,
        applicant_id: user.id,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        move_in_date: moveInDate ?? null,
        source_link_id: sourceLinkId,
        intro_video_path: intro,
      })
      .select("id, status, created_at")
      .single();
    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "already_applied" });
      if (error.code === "42501") return res.status(403).json({ error: "not_open", message: "This room isn't taking applications (or it's your own listing)." });
      return dbError(res, error, "apply");
    }
    await track("application_submitted", { channel, intro: Boolean(intro) }, { userId: user.id, listingId: id });
    if (admin) {
      // Tell the host and housemates.
      const [{ data: listing }, { data: members }, { count }] = await Promise.all([
        admin.from("listings").select("owner_id, neighborhood, city").eq("id", id).maybeSingle(),
        admin.from("house_members").select("user_id").eq("listing_id", id),
        admin.from("applications").select("id", { count: "exact", head: true }).eq("listing_id", id),
      ]);
      if (listing) {
        const recipients = [...new Set([listing.owner_id, ...(members ?? []).map((m) => m.user_id)])];
        const { data: names } = await admin.from("users").select("id, first_name").in("id", recipients);
        await Promise.all(
          recipients.map((uid) =>
            notify({
              userId: uid,
              kind: "new_applicant",
              listingId: id,
              payload: { area: listing.neighborhood ?? listing.city, firstName: (names ?? []).find((n) => n.id === uid)?.first_name ?? null, applicantCount: count ?? 1, path: `/?applicants=${id}` },
              appUrl: publicOrigin(req),
            })
          )
        );
      }
    }
    res.status(201).json({ application: data });
  });

  // Video cover for link previews: crawlers can't read a private bucket, so redirect to a signed URL.
  app.get("/api/media/thumb/:listingId", async (req, res) => {
    const admin = getAdminClient();
    const id = req.params.listingId.replace(/\.(jpe?g|png|webp)$/i, "");
    if (!admin || !isListingId(id)) return res.status(404).end();
    const listing = await admin.from("listings").select("id").eq("id", id).in("status", ["published", "filled"]).maybeSingle();
    if (!listing.data) return res.status(404).end();
    const thumb = await admin.from("listing_media").select("bucket, path").eq("listing_id", id).eq("kind", "thumbnail").limit(1).maybeSingle();
    if (!thumb.data) return res.status(404).end();
    const signed = await admin.storage.from(thumb.data.bucket).createSignedUrl(thumb.data.path, 7 * 24 * 3600);
    if (!signed.data?.signedUrl) return res.status(404).end();
    res.set("Cache-Control", "public, max-age=3600");
    res.redirect(302, signed.data.signedUrl);
  });

  // Public listing page: /r/<code> (a channel link) or /r/<listing id> (direct).
  app.get("/r/:code", async (req, res) => {
    const origin = publicOrigin(req);
    res.set("Cache-Control", "no-store");
    const notFound = () => res.status(404).type("html").send(renderNotFoundPage("/"));
    const admin = getAdminClient();
    const code = req.params.code;
    if (!admin || !(isLinkCode(code) || isListingId(code))) return notFound();

    let link: PublicLink | null = null;
    let listingId: string;
    if (isLinkCode(code)) {
      const found = await admin.from("listing_links").select("id, listing_id, channel, code").eq("code", code).maybeSingle();
      if (!found.data) return notFound();
      link = found.data as PublicLink;
      listingId = found.data.listing_id;
    } else {
      listingId = code;
      const direct = await admin.from("listing_links").select("id, listing_id, channel, code").eq("listing_id", code).eq("channel", "direct").maybeSingle();
      link = (direct.data as PublicLink | null) ?? null;
    }

    const listingResult = await admin.from("listings").select(PUBLIC_COLUMNS).eq("id", listingId).in("status", ["published", "filled"]).maybeSingle();
    if (!listingResult.data) return notFound();
    const listing = listingResult.data as Record<string, any>;
    const media = await admin
      .from("listing_media")
      .select("kind, bucket, path")
      .eq("listing_id", listingId)
      .in("kind", ["video_full", "video_teaser", "thumbnail"]);
    const pick = (kind: string) => media.data?.find((m) => m.kind === kind);
    const video = pick("video_full") ?? pick("video_teaser");
    const videoUrl = video ? (await admin.storage.from(video.bucket).createSignedUrl(video.path, 3600)).data?.signedUrl ?? null : null;
    const posterUrl = pick("thumbnail") ? `${origin}/api/media/thumb/${listingId}.jpg` : null;

    // Count the view (people only, once per browser per 30 minutes) and track it.
    const userAgent = req.get("user-agent");
    if (!isLinkPreviewBot(userAgent)) {
      let anonId = readCookie(req, ANON_COOKIE);
      if (!anonId || !ANON_ID.test(anonId)) {
        anonId = `v_${randomBytes(12).toString("hex")}`;
        const secure = origin.startsWith("https:") ? "; Secure" : "";
        res.append("Set-Cookie", `${ANON_COOKIE}=${anonId}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`);
      }
      try {
        if (link) {
          const last = await admin
            .from("link_visits")
            .select("created_at")
            .eq("link_id", link.id)
            .eq("anon_id", anonId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastAt = last.data ? Date.parse(last.data.created_at) : null;
          if (shouldCountVisit(lastAt, Date.now())) {
            await admin.from("link_visits").insert({ link_id: link.id, anon_id: anonId, referrer_host: referrerHost(req) });
            await track("link_opened", { channel: link.channel }, { anonId, listingId });
          }
        } else {
          await track("link_opened", { channel: "direct" }, { anonId, listingId });
        }
      } catch (error) {
        console.error("record visit:", error instanceof Error ? error.message : error);
      }
    }

    const info = toFillListingInfo(listing);
    const today = todayIn(new Date());
    const url = `${origin}/r/${code}`;
    const via = isLinkCode(code) ? code : link?.code;
    const applyHref = `/?apply=${listingId}${via ? `&via=${via}` : ""}`;
    res.type("html").send(
      renderListingPage({
        listing: info,
        status: listing.status === "filled" ? "filled" : "published",
        metaTags: buildListingMeta(info, { url, imageUrl: posterUrl, today }),
        videoUrl,
        posterUrl,
        applyHref,
        findHref: "/",
        today,
      })
    );
  });
}
