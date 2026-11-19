/**
 * Passport: Level 2 ID check (demo provider, behind the `id_check` flag) and
 * the email setting. Badges only: the ID image is never stored, and hosts
 * never see a document.
 */
import type { Express } from "express";
import { currentUser, requireUser } from "./auth.js";
import { requireFlag } from "./flags.js";
import { track } from "./track.js";
import { runIdCheck, validIdImage } from "./idCheck.js";
import { adminDb, dbError, userDb } from "./routeKit.js";

export function registerPassportRoutes(app: Express): void {
  // Open ID-check requests from hosts who shortlisted me.
  app.get("/api/passport/id-requests", requireUser(), async (_req, res) => {
    const user = currentUser(res)!;
    const admin = adminDb(res);
    if (!admin) return;
    const [{ data: apps }, { data: passport }] = await Promise.all([
      admin.from("applications").select("id, listing_id, id_check_requested_at").eq("applicant_id", user.id).in("status", ["shortlisted", "chosen"]).not("id_check_requested_at", "is", null),
      admin.from("passports").select("id_verified").eq("user_id", user.id).maybeSingle(),
    ]);
    if (passport?.id_verified || !apps?.length) return res.json({ requests: [], idVerified: passport?.id_verified === true });
    const { data: listings } = await admin.from("listings").select("id, neighborhood, title").in("id", apps.map((a) => a.listing_id));
    res.json({
      idVerified: false,
      requests: apps.map((a) => {
        const l = (listings ?? []).find((x) => x.id === a.listing_id);
        return { applicationId: a.id, area: l?.neighborhood ?? null, title: l?.title ?? null, requestedAt: a.id_check_requested_at };
      }),
    });
  });

  app.post("/api/passport/verify-id", requireFlag("id_check"), requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    const admin = adminDb(res);
    if (!admin) return;
    const { data: requested } = await admin
      .from("applications")
      .select("id")
      .eq("applicant_id", user.id)
      .in("status", ["shortlisted", "chosen"])
      .not("id_check_requested_at", "is", null)
      .limit(1);
    if (!requested?.length) {
      return res.status(403).json({ error: "not_requested", message: "An ID check opens once a host shortlists you and asks for one." });
    }
    const image = validIdImage(req.body?.imageBase64, req.body?.mimeType);
    if (!image) return res.status(400).json({ error: "bad_image", message: "Use a clear JPEG or PNG photo under 3 MB." });
    const result = await runIdCheck(image);
    if (!result.ok) {
      return res.status(503).json({ error: result.error, message: "ID checks aren't available right now. Try again later." });
    }
    const now = new Date().toISOString();
    const inserted = await admin.from("verifications").insert({
      user_id: user.id,
      kind: "government_id",
      status: result.verified ? "verified" : "failed",
      provider: result.provider,
      verified_at: result.verified ? now : null,
    });
    if (inserted.error) return dbError(res, inserted.error, "save verification");
    if (result.verified) {
      const updated = await admin.from("passports").update({ id_verified: true }).eq("user_id", user.id);
      if (updated.error) return dbError(res, updated.error, "set id badge");
      await track("id_verified", { provider: result.provider }, { userId: user.id });
    }
    res.json({ verified: result.verified, message: result.reason, provider: result.provider });
  });

  app.patch("/api/me/settings", requireUser(), async (req, res) => {
    const user = currentUser(res)!;
    if (typeof req.body?.notifyEmail !== "boolean") return res.status(400).json({ error: "invalid" });
    const db = userDb(res);
    if (!db) return;
    const { error } = await db.from("users").update({ notify_email: req.body.notifyEmail }).eq("id", user.id);
    if (error) return dbError(res, error, "settings");
    res.json({ notifyEmail: req.body.notifyEmail });
  });
}
