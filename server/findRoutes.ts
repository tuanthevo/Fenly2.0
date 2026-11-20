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
import { adminDb, dbError, isUuid, signedUrls, userDb } from "./routeKit.js";
import { LAUNCH_AREAS, launchAreaOf, parseFindQuery, type FindListing } from "../src/find/findFilters.js";

const FEED_LIMIT = 40;
const FEED_COLUMNS =
  "id, owner_id, status, title, description, neighborhood, city, rent_cents, deposit_cents, available_from, lease_term, beds, baths, square_feet, amenities, house_rules, published_at";

type Row = Record<string, any>;

/** Builds feed entries for listing rows: signed media, host and housemate first names + badges. */
export async function buildFindListings(admin: SupabaseClient, rows: Row[]): Promise<FindListing[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
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
    status: r.status,
    videoUrl: videoPaths[i] ? videos.get(videoPaths[i]!) ?? null : null,
    thumbUrl: thumbPaths[i] ? thumbs.get(thumbPaths[i]!) ?? null : null,
    publishedAt: r.published_at ?? null,
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
  // Public feed. Launch area first, newest first; filters: area, maxRent ($), moveInBy (YYYY-MM-DD).
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
      .order("published_at", { ascending: false })
      .limit(FEED_LIMIT * 2);
    if (filters.area) query = query.eq("neighborhood", filters.area);
    if (filters.maxRentCents != null) query = query.lte("rent_cents", filters.maxRentCents);
    if (filters.moveInBy) query = query.or(`available_from.is.null,available_from.lte.${filters.moveInBy}`);
    const { data, error } = await query;
    if (error) return dbError(res, error, "find feed");
    let rows = (data ?? []) as Row[];
    const viewer = currentUser(res);
    if (viewer) {
      const blocked = await blockedWith(admin, viewer.id);
      rows = rows.filter((r) => !blocked.has(r.owner_id));
    }
    const launch = new Set<string>(LAUNCH_AREAS);
    rows.sort((a, b) => Number(launch.has(launchAreaOf(b.neighborhood) ?? "")) - Number(launch.has(launchAreaOf(a.neighborhood) ?? "")));
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
