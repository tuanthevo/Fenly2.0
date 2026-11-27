/**
 * Fenly 2.0 Find: the public feed of published rooms (launch area first) and
 * saved rooms. The feed is read with the service-role client because it joins
 * hosts' first names and badges, which RLS keeps private otherwise; only those
 * public-safe fields leave this module.
 */
import type { Express } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, optionalUser, requireUser } from "./auth.js";
import { getAdminClient } from "./supabase.js";
import { track } from "./track.js";
import { adminDb, dbError, isAdminUser, isUuid, signedUrls, userDb } from "./routeKit.js";
import { getFlags } from "./flags.js";
import { parseFindQuery, roomDistanceMiles, visibleMediaTypes, type FindListing } from "../src/find/findFilters.js";
import { cleanChapters } from "../src/find/videoChapters.js";

const FEED_LIMIT = 40;
/** Rooms scanned when filtering by distance (the radius is checked here, not in SQL) */
const NEAR_SCAN_LIMIT = 500;
const FEED_COLUMNS =
  "id, owner_id, status, title, description, neighborhood, city, rent_cents, deposit_cents, available_from, lease_term, beds, baths, square_feet, amenities, house_rules, published_at, media_type, chapters:viral_edit->chapters";

type Row = Record<string, any>;

/** Builds feed entries for listing rows: signed media, host and housemate first names + badges. */
export async function buildFindListings(admin: SupabaseClient, rows: Row[]): Promise<FindListing[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  // Photo listings: the host's photos, for "See all photos" and for playing the tour when it has no MP4
  const photoIds = rows.filter((r) => r.media_type === "photos").map((r) => r.id);
  const photoRows: Row[] = photoIds.length
    ? ((await admin.from("listing_photos").select("listing_id, slot, position, storage_path, width, height, caption").in("listing_id", photoIds).order("position")).data ?? [])
    : [];
  const photoFiles = await signedUrls(admin, "listing-photos", photoRows.map((p) => p.storage_path), 6 * 3600);
  const [media, members] = await Promise.all([
    admin.from("listing_media").select("listing_id, kind, bucket, path").in("listing_id", ids).in("kind", ["video_full", "video_teaser", "thumbnail"]),
    admin.from("house_members").select("listing_id, user_id").in("listing_id", ids),
  ]);
  const peopleIds = [...new Set([...rows.map((r) => r.owner_id), ...(members.data ?? []).map((m) => m.user_id)])];
  const [people, passports] = await Promise.all([
    admin.from("users").select("id, first_name, photo_url").in("id", peopleIds),
    admin.from("passports").select("user_id, phone_verified, id_verified").in("user_id", peopleIds),
  ]);
  const mediaRows = (media.data ?? []) as Row[];
  const pick = (listingId: string, kind: string) => mediaRows.find((m) => m.listing_id === listingId && m.kind === kind);
  const videoPaths = rows.map((r) => (pick(r.id, "video_full") ?? pick(r.id, "video_teaser"))?.path);
  const thumbPaths = rows.map((r) => pick(r.id, "thumbnail")?.path);
  const photoPaths = (people.data ?? []).map((p) => p.photo_url).filter((p: string | null) => p && !/^https?:/.test(p));
  const [videos, thumbs, photos] = await Promise.all([
    signedUrls(admin, "listing-videos", videoPaths, 6 * 3600),
    signedUrls(admin, "listing-thumbnails", thumbPaths, 6 * 3600),
    signedUrls(admin, "profile-photos", photoPaths, 6 * 3600),
  ]);
  const person = (id: string) => {
    const u = (people.data ?? []).find((p) => p.id === id);
    const pass = (passports.data ?? []).find((p) => p.user_id === id);
    const photo = u?.photo_url ? (/^https?:/.test(u.photo_url) ? u.photo_url : photos.get(u.photo_url) ?? null) : null;
    return { firstName: u?.first_name ?? null, photoUrl: photo, phoneVerified: pass?.phone_verified === true, idVerified: pass?.id_verified === true };
  };
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title ?? null,
    description: r.description ?? null,
    neighborhood: r.neighborhood ?? null,
    city: r.city ?? "San Francisco",
    rentCents: r.rent_cents ?? null,
    depositCents: r.deposit_cents ?? null,
    availableFrom: r.available_from ?? null,
    leaseTerm: r.lease_term ?? null,
    beds: r.beds ?? null,
    baths: r.baths == null ? null : Number(r.baths),
    squareFeet: r.square_feet ?? null,
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    houseRules: r.house_rules ?? null,
    chapters: cleanChapters(r.chapters),
    status: r.status,
    videoUrl: videoPaths[i] ? videos.get(videoPaths[i]!) ?? null : null,
    thumbUrl: thumbPaths[i] ? thumbs.get(thumbPaths[i]!) ?? null : null,
    publishedAt: r.published_at ?? null,
    mediaType: r.media_type === "photos" ? ("photos" as const) : ("video" as const),
    photos: photoRows
      .filter((p) => p.listing_id === r.id && photoFiles.has(p.storage_path))
      .map((p) => ({ url: photoFiles.get(p.storage_path)!, slot: p.slot, caption: p.caption ?? null, width: p.width ?? null, height: p.height ?? null })),
    host: { id: r.owner_id, ...person(r.owner_id) },
    housemates: (members.data ?? [])
      .filter((m) => m.listing_id === r.id && m.user_id !== r.owner_id)
      .map((m) => {
        const { firstName, phoneVerified, idVerified } = person(m.user_id);
        return { firstName, phoneVerified, idVerified };
      }),
  }));
}

/** User ids on either side of a block with `userId`. */
export async function blockedWith(admin: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await admin.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  return new Set((data ?? []).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)));
}

export function registerFindRoutes(app: Express): void {
  // Public feed, newest first (closest first with a place). Filters: place + lat/lng + miles, minRent / maxRent ($), moveInBy (YYYY-MM-DD).
  app.get("/api/find", optionalUser(), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const admin = getAdminClient();
    if (!admin) return res.json({ listings: [], configured: false });
    const filters = parseFindQuery(req.query as Record<string, unknown>);
    let query = admin
      .from("listings")
      .select(FEED_COLUMNS)
      .eq("status", "published")
      .is("hidden_at", null)
      .order(filters.sort === "rent_low" ? "rent_cents" : "published_at", { ascending: filters.sort === "rent_low" })
      .limit(filters.near ? NEAR_SCAN_LIMIT : FEED_LIMIT * 2);
    if (filters.minRentCents != null) query = query.gte("rent_cents", filters.minRentCents);
    if (filters.maxRentCents != null) query = query.lte("rent_cents", filters.maxRentCents);
    if (filters.moveInBy) query = query.or(`available_from.is.null,available_from.lte.${filters.moveInBy}`);
    // Must-haves come from a fixed list (parseFindQuery); the room has to list every one
    if (filters.mustHave?.length) query = query.contains("amenities", filters.mustHave);
    const { data, error } = await query;
    if (error) return dbError(res, error, "find feed");
    const viewer = currentUser(res);
    let rows = visibleMediaTypes((data ?? []) as Row[], getFlags().photo_listings || isAdminUser(viewer));
    if (viewer) {
      const blocked = await blockedWith(admin, viewer.id);
      rows = rows.filter((r) => !blocked.has(r.owner_id));
    }
    const near = filters.near;
    if (near) {
      // Distance from the room's area center (neighborhood or city), never an address
      rows = rows
        .map((r) => ({ r, d: roomDistanceMiles({ city: r.city, neighborhood: r.neighborhood }, near) }))
        .filter((x): x is { r: Row; d: number } => x.d != null && x.d <= near.miles)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.r);
    }
    rows = rows.slice(0, FEED_LIMIT);
    try {
      res.json({ listings: await buildFindListings(admin, rows), configured: true });
    } catch (e) {
      console.error("find feed media:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "database_error" });
    }
  });

  app.get("/api/saved", requireUser(), async (_req, res) => {
    const db = userDb(res);
    if (!db) return;
    const { data, error } = await db.from("saved_listings").select("listing_id, created_at").order("created_at", { ascending: false });
    if (error) return dbError(res, error, "saved list");
    res.json({ listingIds: (data ?? []).map((r) => r.listing_id) });
  });

  app.put("/api/saved/:listingId", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    if (!isUuid(req.params.listingId)) return res.status(404).json({ error: "not_found" });
    const db = userDb(res);
    if (!db) return;
    const { error } = await db.from("saved_listings").upsert({ user_id: user.id, listing_id: req.params.listingId }, { onConflict: "user_id,listing_id", ignoreDuplicates: true });
    if (error) return dbError(res, error, "save room");
    await track("listing_saved", {}, { userId: user.id, listingId: req.params.listingId });
    res.status(204).end();
  });

  app.delete("/api/saved/:listingId", requireUser(), async (req, res) => {
    if (!isUuid(req.params.listingId)) return res.status(404).json({ error: "not_found" });
    const db = userDb(res);
    if (!db) return;
    const { error } = await db.from("saved_listings").delete().eq("listing_id", req.params.listingId);
    if (error) return dbError(res, error, "unsave room");
    res.status(204).end();
  });

  // Saved rooms' details (for the Saved list), including filled ones.
  app.get("/api/saved/listings", requireUser(), async (_req, res) => {
    const db = userDb(res);
    const admin = adminDb(res);
    if (!db || !admin) return;
    const saved = await db.from("saved_listings").select("listing_id");
    if (saved.error) return dbError(res, saved.error, "saved rooms");
    const ids = (saved.data ?? []).map((r) => r.listing_id);
    if (ids.length === 0) return res.json({ listings: [] });
    const { data, error } = await admin.from("listings").select(FEED_COLUMNS).in("id", ids).in("status", ["published", "filled"]).is("hidden_at", null);
    if (error) return dbError(res, error, "saved rooms");
    res.json({ listings: await buildFindListings(admin, data ?? []) });
  });
}
