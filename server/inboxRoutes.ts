/**
 * Inbox: one thread per application between the applicant and the listing's
 * host / housemates. Messages are checked for scams and fair-housing problems
 * before they're saved; flagged ones are still delivered with a warning and
 * queued for review. Also: report and block.
 */
import type { Express } from "express";
import { currentUser, requireUser } from "./auth.js";
import { track } from "./track.js";
import { checkText, recordFlags } from "./moderation.js";
import { adminDb, clip, dbError, isUuid, signedUrls, userDb } from "./routeKit.js";
import { maskAndScanMessage } from "../src/utils/trustSafety.js";
import { warningFor, type ModerationCategory } from "../src/find/moderation.js";

type Row = Record<string, any>;

const REPORT_REASONS = ["scam", "fair_housing", "harassment", "fake_listing", "inappropriate", "other"] as const;
const REPORT_CATEGORY: Record<string, ModerationCategory> = {
  scam: "scam",
  fake_listing: "scam",
  fair_housing: "fair_housing",
  harassment: "harassment",
  inappropriate: "other",
  other: "other",
};

export function registerInboxRoutes(app: Express): void {
  // Threads: my applications, and applications to rooms I host or live in.
  app.get("/api/inbox", requireUser(), async (_req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    const admin = adminDb(res);
    if (!db || !admin) return;
    const { data: apps, error } = await db
      .from("applications")
      .select("id, listing_id, applicant_id, status, decline_reason, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return dbError(res, error, "inbox");
    const rows = (apps ?? []) as Row[];
    if (rows.length === 0) return res.json({ threads: [] });
    const listingIds = [...new Set(rows.map((a) => a.listing_id))];
    const [listings, messages, taken] = await Promise.all([
      admin.from("listings").select("id, owner_id, title, neighborhood, city, status, rent_cents").in("id", listingIds),
      db.from("messages").select("application_id, sender_id, recipient_id, body, read_at, flagged, created_at").in("application_id", rows.map((a) => a.id)).is("hidden_at", null).order("created_at", { ascending: false }),
      admin.from("notifications").select("listing_id, payload").eq("user_id", user.id).eq("kind", "room_taken"),
    ]);
    const listingOf = (id: string) => (listings.data ?? []).find((l) => l.id === id);
    const otherIds = rows.map((a) => {
      const l = listingOf(a.listing_id);
      return a.applicant_id === user.id ? l?.owner_id : a.applicant_id;
    });
    const { data: people } = await admin.from("users").select("id, first_name, photo_url").in("id", [...new Set(otherIds.filter(Boolean))]);
    const photos = await signedUrls(admin, "profile-photos", (people ?? []).map((p) => p.photo_url).filter((p: string | null) => p && !/^https?:/.test(p)));
    const threads = rows.map((a, i) => {
      const l = listingOf(a.listing_id);
      const other = (people ?? []).find((p) => p.id === otherIds[i]);
      const msgs = (messages.data ?? []).filter((m) => m.application_id === a.id);
      const role = a.applicant_id === user.id ? "applicant" : l?.owner_id === user.id ? "host" : "housemate";
      const similar = a.decline_reason === "room_filled" ? (taken.data ?? []).find((n) => n.listing_id === a.listing_id)?.payload?.similar ?? [] : [];
      return {
        applicationId: a.id,
        listing: l ? { id: l.id, title: l.title, neighborhood: l.neighborhood || l.city, status: l.status, rentCents: l.rent_cents } : null, // the city where there's no neighborhood list
        role,
        status: a.status,
        declineReason: a.decline_reason,
        other: other
          ? { id: other.id, firstName: other.first_name, photoUrl: other.photo_url ? (/^https?:/.test(other.photo_url) ? other.photo_url : photos.get(other.photo_url) ?? null) : null }
          : null,
        lastMessage: msgs[0] ? { body: msgs[0].body.slice(0, 140), at: msgs[0].created_at, fromMe: msgs[0].sender_id === user.id } : null,
        unread: msgs.filter((m) => m.recipient_id === user.id && !m.read_at).length,
        similar,
        updatedAt: msgs[0]?.created_at ?? a.updated_at,
      };
    });
    threads.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    res.json({ threads });
  });

  app.get("/api/applications/:id/messages", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    if (!db) return;
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "not_found" });
    const { data: application } = await db.from("applications").select("id, applicant_id, listing_id, status").eq("id", req.params.id).maybeSingle();
    if (!application) return res.status(404).json({ error: "not_found" });
    const { data, error } = await db
      .from("messages")
      .select("id, sender_id, recipient_id, body, flagged, flag_reason, read_at, created_at")
      .eq("application_id", application.id)
      .is("hidden_at", null)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) return dbError(res, error, "messages");
    const unread = (data ?? []).filter((m) => m.recipient_id === user.id && !m.read_at).map((m) => m.id);
    if (unread.length) await db.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    res.json({
      status: application.status,
      messages: (data ?? []).map((m) => ({
        id: m.id,
        fromMe: m.sender_id === user.id,
        senderId: m.sender_id,
        body: m.body,
        // Only the recipient sees the warning; the sender sees their own text.
        warning: m.recipient_id === user.id && m.flagged ? m.flag_reason : null,
        at: m.created_at,
      })),
    });
  });

  app.post("/api/applications/:id/messages", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    const admin = adminDb(res);
    if (!db || !admin) return;
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "not_found" });
    const raw = clip(req.body?.body, 4000);
    if (!raw) return res.status(400).json({ error: "empty" });
    const { data: application } = await db.from("applications").select("id, applicant_id, listing_id, status").eq("id", req.params.id).maybeSingle();
    if (!application) return res.status(404).json({ error: "not_found" });
    const { data: listing } = await admin.from("listings").select("owner_id").eq("id", application.listing_id).maybeSingle();
    if (!listing) return res.status(404).json({ error: "not_found" });
    const recipient = application.applicant_id === user.id ? listing.owner_id : application.applicant_id;

    const check = await checkText(raw, "message");
    // Contact details stay hidden until the host chooses this applicant.
    const body = application.status === "chosen" ? raw : maskAndScanMessage(raw, false).sanitizedText;
    const warning = warningFor(check.flags);
    const { data, error } = await db
      .from("messages")
      .insert({ application_id: application.id, sender_id: user.id, recipient_id: recipient, body, flagged: check.flags.length > 0, flag_reason: warning })
      .select("id, created_at")
      .single();
    if (error) {
      if (error.code === "42501") return res.status(403).json({ error: "not_allowed", message: "You can't message this person." });
      return dbError(res, error, "send message");
    }
    await recordFlags(admin, "message", data.id, check.flags.filter((f) => f.category !== "off_platform" || f.severity !== "low"));
    await track("message_sent", { flagged: check.flags.length > 0 }, { userId: user.id, listingId: application.listing_id });
    res.status(201).json({ id: data.id, body, at: data.created_at, masked: body !== raw });
  });

  app.post("/api/reports", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const db = userDb(res);
    const admin = adminDb(res);
    if (!db || !admin) return;
    const { targetType, targetId, reason } = req.body ?? {};
    if (!["listing", "user", "message"].includes(targetType) || !isUuid(targetId) || !REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ error: "invalid" });
    }
    const details = clip(req.body?.details, 1000);
    const { error } = await db.from("reports").insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason, details });
    if (error && error.code !== "23505") return dbError(res, error, "report");
    if (!error) {
      await recordFlags(admin, targetType, targetId, [
        {
          category: REPORT_CATEGORY[reason],
          severity: reason === "scam" || reason === "harassment" ? "high" : "medium",
          source: "report",
          reason: `User report: ${reason}${details ? `: ${details}` : ""}`,
        },
      ]);
      await track("report_submitted", { targetType, reason }, { userId: user.id, listingId: targetType === "listing" ? targetId : null });
    }
    res.status(201).json({ reported: true });
  });

  app.get("/api/blocks", requireUser(), async (_req, res) => {
    const db = userDb(res);
    if (!db) return;
    const { data, error } = await db.from("blocks").select("blocked_id");
    if (error) return dbError(res, error, "blocks");
    res.json({ blocked: (data ?? []).map((b) => b.blocked_id) });
  });

  app.post("/api/blocks/:userId", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    if (!isUuid(req.params.userId) || req.params.userId === user.id) return res.status(400).json({ error: "invalid" });
    const db = userDb(res);
    if (!db) return;
    const { error } = await db.from("blocks").insert({ blocker_id: user.id, blocked_id: req.params.userId });
    if (error && error.code !== "23505") return dbError(res, error, "block");
    res.status(201).json({ blocked: true });
  });

  app.delete("/api/blocks/:userId", requireUser(), async (req, res) => {
    if (!isUuid(req.params.userId)) return res.status(400).json({ error: "invalid" });
    const db = userDb(res);
    if (!db) return;
    const { error } = await db.from("blocks").delete().eq("blocked_id", req.params.userId);
    if (error) return dbError(res, error, "unblock");
    res.status(204).end();
  });
}
