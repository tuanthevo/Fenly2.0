/**
 * Review queue (accounts in FENLY_ADMIN_EMAILS only) and the daily cron
 * (move-out reminders). Every other caller gets 404, so the queue's existence
 * isn't advertised.
 */
import type { Express, RequestHandler } from "express";
import { currentUser, requireUser } from "./auth.js";
import { notify } from "./notify.js";
import { publicOrigin } from "./fillRoutes.js";
import { adminDb, dbError, isAdminUser, isUuid } from "./routeKit.js";
import { moveOutReminderDue } from "./emails.js";
import { daysUntil, todayIn } from "../src/fill/fillStatus.js";
import { buildFunnel, median, parseMetricsDays, buildMediaSplit } from "./metrics.js";
import { bayAreaCity } from "../src/geo/bayArea.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alertDigest, cleanAlertPrefs, type AlertListing } from "../src/find/roomAlerts.js";
import { shareUrl } from "../src/fill/linkCodes.js";
import { formatRentCents } from "../src/fill/publicListing.js";

type Row = Record<string, any>;

const requireAdmin: RequestHandler = (_req, res, next) => {
  if (!isAdminUser(currentUser(res))) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  next();
};

/** True when the request carries the cron secret (Vercel Cron sends it as a Bearer token). */
export function isCronRequest(authorization: string | undefined, secret = process.env.CRON_SECRET): boolean {
  return Boolean(secret && secret.length >= 16 && authorization === `Bearer ${secret}`);
}

export function registerAdminRoutes(app: Express): void {
  app.get("/api/admin/queue", requireUser(), requireAdmin, async (_req, res) => {
    const admin = adminDb(res);
    if (!admin) return;
    const { data: flags, error } = await admin.from("moderation_flags").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(100);
    if (error) return dbError(res, error, "queue");
    const ids = (type: string) => [...new Set((flags ?? []).filter((f) => f.target_type === type).map((f) => f.target_id))];
    const [listings, messages, users] = await Promise.all([
      ids("listing").length ? admin.from("listings").select("id, title, neighborhood, description, status, hidden_at").in("id", ids("listing")) : { data: [] as Row[] },
      ids("message").length ? admin.from("messages").select("id, body, sender_id, hidden_at, created_at").in("id", ids("message")) : { data: [] as Row[] },
      ids("user").length ? admin.from("users").select("id, first_name, bio").in("id", ids("user")) : { data: [] as Row[] },
    ]);
    const preview = (f: Row) => {
      if (f.target_type === "listing") {
        const l = (listings.data ?? []).find((x) => x.id === f.target_id);
        return l ? { title: l.title ?? "Untitled room", text: String(l.description ?? "").slice(0, 400), sub: `${l.neighborhood ?? ""} · ${l.status}`, hidden: Boolean(l.hidden_at) } : null;
      }
      if (f.target_type === "message") {
        const m = (messages.data ?? []).find((x) => x.id === f.target_id);
        return m ? { title: "Message", text: String(m.body).slice(0, 400), sub: m.created_at, hidden: Boolean(m.hidden_at) } : null;
      }
      const u = (users.data ?? []).find((x) => x.id === f.target_id);
      return u ? { title: u.first_name ?? "Profile", text: String(u.bio ?? "").slice(0, 400), sub: "Profile", hidden: false } : null;
    };
    res.json({
      flags: (flags ?? []).map((f) => ({
        id: f.id,
        targetType: f.target_type,
        targetId: f.target_id,
        source: f.source,
        category: f.category,
        severity: f.severity,
        reason: f.reason,
        createdAt: f.created_at,
        target: preview(f),
      })),
    });
  });

  // clear: nothing wrong (un-hides a listing with no other open high scam flag); hide: take it down.
  app.post("/api/admin/flags/:id", requireUser(), requireAdmin, async (req, res) => {
    const admin = adminDb(res);
    if (!admin) return;
    const action = req.body?.action;
    if (!isUuid(req.params.id) || !["clear", "hide"].includes(action)) return res.status(400).json({ error: "invalid" });
    const { data: flag } = await admin.from("moderation_flags").select("*").eq("id", req.params.id).maybeSingle();
    if (!flag) return res.status(404).json({ error: "not_found" });
    const now = new Date().toISOString();
    const table = flag.target_type === "listing" ? "listings" : flag.target_type === "message" ? "messages" : null;
    // Every open flag on the same target is resolved together.
    const resolve = admin.from("moderation_flags").update({ status: action === "hide" ? "actioned" : "cleared", reviewed_at: now });
    if (action === "hide") {
      if (table) {
        const hidden = await admin.from(table).update({ hidden_at: now }).eq("id", flag.target_id);
        if (hidden.error) return dbError(res, hidden.error, "hide");
      }
      await resolve.eq("target_type", flag.target_type).eq("target_id", flag.target_id).eq("status", "open");
    } else {
      await resolve.eq("id", flag.id);
      if (table === "listings") {
        const { data: open } = await admin.from("moderation_flags").select("id").eq("target_type", "listing").eq("target_id", flag.target_id).eq("status", "open").eq("category", "scam").eq("severity", "high");
        if (!open?.length) await admin.from("listings").update({ hidden_at: null }).eq("id", flag.target_id);
      }
    }
    res.json({ ok: true });
  });

  // Part 6 funnel for the last 7 or 28 days (counts only; no personal data leaves the server).
  app.get("/api/admin/metrics", requireUser(), requireAdmin, async (req, res) => {
    const admin = adminDb(res);
    if (!admin) return;
    const days = parseMetricsDays(req.query.days);
    const now = Date.now();
    const since = new Date(now - days * 86_400_000).toISOString();
    const sixtyDaysAgo = new Date(now - 60 * 86_400_000).toISOString();
    const DAY = 86_400_000;
    try {
      const countEvent = async (name: string) => {
        const { count, error } = await admin.from("events").select("id", { count: "exact", head: true }).eq("name", name).gte("created_at", since);
        if (error) throw new Error(error.message);
        return count ?? 0;
      };
      const [fillStarted, listingPublished, linkShared, linkOpened, applicationSubmitted] = await Promise.all(
        ["fill_started", "listing_published", "link_shared", "link_opened", "application_submitted"].map(countEvent)
      );
      const [published, shares, apps, filledRows, chosenOld] = await Promise.all([
        admin.from("listings").select("id").gte("published_at", since).limit(10000),
        admin.from("events").select("listing_id").eq("name", "link_shared").gte("created_at", since).not("listing_id", "is", null).limit(50000),
        admin.from("applications").select("listing_id, source_link_id").gte("created_at", since).limit(50000),
        admin.from("listings").select("id, city, neighborhood, published_at, filled_at").eq("status", "filled").gte("filled_at", since).limit(10000),
        admin.from("applications").select("applicant_id").eq("status", "chosen").lte("updated_at", sixtyDaysAgo).limit(10000),
      ]);
      for (const r of [published, shares, apps, filledRows, chosenOld]) if (r.error) throw new Error(r.error.message);
      const publishedIds = new Set((published.data ?? []).map((l) => l.id));
      const sharedIds = new Set((shares.data ?? []).map((e) => e.listing_id).filter((id) => publishedIds.has(id)));
      const appListingIds = [...new Set((apps.data ?? []).map((a) => a.listing_id))];
      const { data: appListings } = appListingIds.length
        ? await admin.from("listings").select("id, status").in("id", appListingIds)
        : { data: [] as Row[] };
      const linkIds = [...new Set((apps.data ?? []).map((a) => a.source_link_id).filter(Boolean))];
      const { data: links } = linkIds.length ? await admin.from("listing_links").select("id, channel").in("id", linkIds) : { data: [] as Row[] };
      const sharedLinkIds = new Set((links ?? []).filter((l) => l.channel !== "direct").map((l) => l.id));
      const chosenIds = [...new Set((chosenOld.data ?? []).map((a) => a.applicant_id))];
      const { count: active } = chosenIds.length
        ? await admin.from("passports").select("user_id", { count: "exact", head: true }).in("user_id", chosenIds).gte("updated_at", sixtyDaysAgo)
        : { count: 0 };
      const filled = filledRows.data ?? [];
      // Video vs photos: listings started in the window. Read on its own so that a database
      // without migration 0008 (no media_type column) still gets the funnel.
      let mediaSplit: ReturnType<typeof buildMediaSplit> | undefined;
      const started = await admin.from("listings").select("id, media_type, created_at, published_at, filled_at").gte("created_at", since).limit(10000);
      if (!started.error) {
        const startedIds = (started.data ?? []).map((l) => l.id);
        const [startedApps, chosenEvents] = await Promise.all([
          startedIds.length ? admin.from("applications").select("listing_id").in("listing_id", startedIds).limit(50000) : Promise.resolve({ data: [] as Row[] }),
          admin.from("events").select("props").eq("name", "media_option_chosen").gte("created_at", since).limit(50000),
        ]);
        const appsPer = new Map<string, number>();
        for (const a of startedApps.data ?? []) appsPer.set(a.listing_id, (appsPer.get(a.listing_id) ?? 0) + 1);
        const picks = (chosenEvents.data ?? []).map((e) => (e.props as { media_type?: string } | null)?.media_type);
        mediaSplit = buildMediaSplit({
          chosen: { video: picks.filter((p) => p === "video").length, photos: picks.filter((p) => p === "photos").length },
          listings: (started.data ?? []).map((l) => ({ ...l, applications: appsPer.get(l.id) ?? 0 })),
        });
      }
      res.json({
        ...buildFunnel({
          days,
          events: {
            fill_started: fillStarted,
            listing_published: listingPublished,
            link_shared: linkShared,
            link_opened: linkOpened,
            application_submitted: applicationSubmitted,
          },
          publishedListings: publishedIds.size,
          sharedListings: sharedIds.size,
          listingsWithApplications: appListingIds.length,
          filledOfThose: (appListings ?? []).filter((l) => l.status === "filled").length,
          filled: filled.length,
          filledLaunchArea: filled.filter((l) => bayAreaCity(l.city) != null).length,
          medianDaysToFill: median(
            filled.filter((l) => l.published_at && l.filled_at).map((l) => (Date.parse(l.filled_at) - Date.parse(l.published_at)) / DAY)
          ),
          applications: (apps.data ?? []).length,
          applicationsViaSharedLink: (apps.data ?? []).filter((a) => a.source_link_id && sharedLinkIds.has(a.source_link_id)).length,
          chosenLongAgo: chosenIds.length,
          chosenStillActive: active ?? 0,
        }),
        mediaSplit,
      });
    } catch (error) {
      console.error("metrics:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "database_error" });
    }
  });

  // Daily: move-out reminders (14, 7 and 3 days before) for rooms that aren't filled yet.
  app.get("/api/cron/daily", async (req, res) => {
    if (!isCronRequest(req.headers.authorization)) return res.status(404).json({ error: "not_found" });
    const admin = adminDb(res);
    if (!admin) return;
    const today = todayIn(new Date());
    const { data: listings, error } = await admin
      .from("listings")
      .select("id, owner_id, neighborhood, city, move_out_date")
      .eq("status", "published")
      .not("move_out_date", "is", null)
      .gte("move_out_date", today)
      .limit(1000);
    if (error) return dbError(res, error, "cron listings");
    const ids = (listings ?? []).map((l) => l.id);
    const { data: sentRows } = ids.length
      ? await admin.from("notifications").select("dedupe_key").eq("kind", "move_out_reminder").in("listing_id", ids)
      : { data: [] as Row[] };
    const origin = publicOrigin(req);
    let sent = 0;
    for (const l of listings ?? []) {
      const sentDays = (sentRows ?? [])
        .map((r) => String(r.dedupe_key ?? ""))
        .filter((k) => k.startsWith(`move_out:${l.id}:`))
        .map((k) => Number(k.split(":")[2]));
      const daysLeft = daysUntil(l.move_out_date, today);
      const due = moveOutReminderDue(daysLeft, sentDays);
      if (due == null) continue;
      await notify({
        userId: l.owner_id,
        kind: "move_out_reminder",
        listingId: l.id,
        payload: { area: l.neighborhood ?? l.city, daysLeft: daysLeft ?? due, path: `/?fill=${l.id}` },
        dedupeKey: `move_out:${l.id}:${due}`,
        appUrl: origin,
      });
      sent++;
    }
    const alerts = await sendRoomAlerts(admin, origin, today);
    res.json({ checked: listings?.length ?? 0, reminders: sent, roomAlerts: alerts });
  });
}

/**
 * "New rooms that match": one digest per renter with alerts on, of rooms published since
 * their last one (at most a day back), matched on Passport logistics (src/find/roomAlerts.ts).
 * Each room links to its public page. Never throws: a failed digest must not fail the cron.
 */
async function sendRoomAlerts(admin: SupabaseClient, origin: string, today: string): Promise<{ renters: number; sent: number }> {
  try {
    // Stamped on each renter after their digest, so nothing published during this run is skipped tomorrow
    const runAt = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // A late or missed cron must not lose rooms: look back to each renter's last digest, up to 3 days
    const windowStart = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const [{ data: renters }, { data: fresh }, { data: blocks }] = await Promise.all([
      admin
        .from("passports")
        .select("user_id, alert_rooms, alert_place, alert_lat, alert_lng, alert_miles, alerts_sent_at, budget_max_cents, move_in_from, stay_length")
        .eq("alert_rooms", true)
        .limit(5000),
      admin
        .from("listings")
        .select("id, owner_id, city, neighborhood, rent_cents, available_from, lease_term, published_at")
        .eq("status", "published")
        .is("hidden_at", null)
        .gte("published_at", windowStart)
        .limit(1000),
      admin.from("blocks").select("blocker_id, blocked_id").limit(10000),
    ]);
    // Like Find: never a room from someone the renter blocked, or who blocked them
    const blockedFor = (userId: string) =>
      new Set(
        (blocks ?? [])
          .filter((b) => b.blocker_id === userId || b.blocked_id === userId)
          .map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id))
      );
    if (!renters?.length || !fresh?.length) return { renters: renters?.length ?? 0, sent: 0 };
    const listings: AlertListing[] = fresh.map((l) => ({
      id: l.id,
      ownerId: l.owner_id,
      city: l.city,
      neighborhood: l.neighborhood,
      rentCents: l.rent_cents,
      availableFrom: l.available_from,
      leaseTerm: l.lease_term,
      publishedAt: l.published_at,
    }));
    const { data: links } = await admin.from("listing_links").select("listing_id, code").eq("channel", "direct").in("listing_id", listings.map((l) => l.id));
    const urlOf = (id: string) => {
      const code = (links ?? []).find((k) => k.listing_id === id)?.code;
      return code ? shareUrl(origin, code) : `${origin}/`;
    };
    let sent = 0;
    for (const row of renters) {
      const prefs = cleanAlertPrefs(row);
      if (!prefs) continue;
      // One digest a day: a second run on the same day leaves the renter (and their window) alone
      if (row.alerts_sent_at && todayIn(new Date(row.alerts_sent_at)) === today) continue;
      const since = row.alerts_sent_at && Date.parse(row.alerts_sent_at) > Date.parse(windowStart) ? row.alerts_sent_at : dayAgo;
      const blocked = blockedFor(prefs.userId);
      const digest = alertDigest(blocked.size ? listings.filter((l) => !blocked.has(l.ownerId)) : listings, prefs, since);
      if (digest.total === 0) continue;
      await notify(
        {
          userId: prefs.userId,
          kind: "new_rooms",
          payload: {
            area: prefs.near?.label ?? "the Bay Area",
            rooms: digest.rooms.map((l) => ({ area: l.neighborhood || l.city || "the Bay Area", rent: formatRentCents(l.rentCents) ?? "", url: urlOf(l.id) })),
            total: digest.total,
            path: "/",
          },
          dedupeKey: `new_rooms:${prefs.userId}:${today}`,
          appUrl: origin,
        },
        admin
      );
      await admin.from("passports").update({ alerts_sent_at: runAt }).eq("user_id", prefs.userId);
      sent++;
    }
    return { renters: renters.length, sent };
  } catch (error) {
    console.error("room alerts:", error instanceof Error ? error.message : error);
    return { renters: 0, sent: 0 };
  }
}
