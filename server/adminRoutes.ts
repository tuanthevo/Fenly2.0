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
import { buildFunnel, median, parseMetricsDays } from "./metrics.js";
import { bayAreaCity } from "../src/geo/bayArea.js";

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
      res.json(
        buildFunnel({
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
        })
      );
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
    res.json({ checked: listings?.length ?? 0, reminders: sent });
  });
}
