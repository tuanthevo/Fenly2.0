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
