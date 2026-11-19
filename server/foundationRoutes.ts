/**
 * Fenly 2.0 foundation routes: public config + flags, the signed-in user, and
 * client analytics events. Registered from server/app.ts so they run locally
 * and on Vercel.
 */
import type { Express } from "express";
import { currentUser, optionalUser, requireUser } from "./auth.js";
import { getFlags } from "./flags.js";
import { getAdminClient, publicSupabaseConfig } from "./supabase.js";
import { CLIENT_EVENT_NAMES, buildEventRow, track } from "./track.js";
import { isAdminUser } from "./routeKit.js";

const MAX_EVENT_BODY = 8192;

export function registerFoundationRoutes(app: Express): void {
  // What the browser needs before it can do anything: Supabase public config and flags.
  app.get("/api/config", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ supabase: publicSupabaseConfig(), flags: getFlags() });
  });

  // The signed-in user with their profile and Passport.
  app.get("/api/me", requireUser(), async (_req, res) => {
    const user = currentUser(res)!;
    const admin = getAdminClient();
    if (!admin) {
      res.status(503).json({ error: "supabase_not_configured" });
      return;
    }
    const [profile, passport] = await Promise.all([
      admin.from("users").select("id, display_name, first_name, photo_url, bio, notify_email").eq("id", user.id).maybeSingle(),
      admin
        .from("passports")
        .select(
          "level, move_in_from, move_in_to, budget_min_cents, budget_max_cents, lifestyle, phone_verified, id_verified, rent_history_verified"
        )
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (profile.error || passport.error) {
      console.error("/api/me failed:", profile.error?.message ?? passport.error?.message);
      res.status(500).json({ error: "profile_unavailable" });
      return;
    }
    res.json({ user, profile: profile.data, passport: passport.data, isAdmin: isAdminUser(user) });
  });

  // Browser analytics: a short allowlist of events, signed in or not.
  app.post("/api/events", optionalUser(), async (req, res) => {
    const body = req.body ?? {};
    if (JSON.stringify(body).length > MAX_EVENT_BODY) {
      res.status(413).json({ error: "too_large" });
      return;
    }
    const name = typeof body.name === "string" ? body.name : "";
    const ctx = {
      userId: currentUser(res)?.id ?? null,
      anonId: typeof body.anonId === "string" ? body.anonId : null,
      listingId: typeof body.listingId === "string" ? body.listingId : null,
    };
    if (!buildEventRow(name, body.props, ctx, CLIENT_EVENT_NAMES).ok) {
      res.status(400).json({ error: "unknown_event" });
      return;
    }
    await track(name, body.props, ctx);
    res.status(204).end();
  });
}
