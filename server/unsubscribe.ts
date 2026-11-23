/**
 * One-click email unsubscribe (CAN-SPAM, RFC 8058). Every email carries a
 * signed link that works without signing in: it turns off all Fenly emails
 * for that account (users.notify_email) and the daily room alerts. In-app
 * notifications keep working, and emails can be turned back on in the Passport.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { getAdminClient } from "./supabase.js";
import { isUuid } from "./routeKit.js";

function secret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = (env.FENLY_UNSUBSCRIBE_SECRET || env.CRON_SECRET || env.SUPABASE_SECRET_KEY || "").trim();
  return s.length >= 16 ? s : null;
}

export function unsubscribeToken(userId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const s = secret(env);
  return s ? createHmac("sha256", s).update(`unsubscribe:${userId}`).digest("hex").slice(0, 40) : null;
}

export function validUnsubscribeToken(userId: string, token: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = unsubscribeToken(userId, env);
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/** The link for one user's emails, or null when no signing secret is set. */
export function unsubscribeUrl(appUrl: string, userId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const token = unsubscribeToken(userId, env);
  return token ? `${appUrl.replace(/\/+$/, "")}/api/unsubscribe?u=${userId}&t=${token}` : null;
}

const page = (title: string, line: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>` +
  `<body style="margin:0;background:#F9F7F3;font-family:Helvetica,Arial,sans-serif;color:#2C2724"><div style="max-width:520px;margin:0 auto;padding:48px 20px">` +
  `<div style="font-weight:800;font-size:20px;color:#A9513A;margin-bottom:18px">Fenly</div><h1 style="font-size:20px;margin:0 0 10px">${title}</h1>` +
  `<p style="font-size:15px;line-height:1.5;margin:0 0 18px">${line}</p><p><a href="/" style="color:#A9513A;font-weight:700">Open Fenly</a></p></div></body></html>`;

export function registerUnsubscribeRoutes(app: Express): void {
  // GET: the link in the email footer. POST: mail apps' one-click button (List-Unsubscribe-Post).
  app.all("/api/unsubscribe", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
    const userId = String(req.query.u ?? "");
    const token = String(req.query.t ?? "");
    const admin = getAdminClient();
    if (!admin || !isUuid(userId) || !validUnsubscribeToken(userId, token)) {
      return res.status(400).type("html").send(page("This link didn't work", "Open Fenly and turn emails off in your Passport."));
    }
    const [users, passports] = await Promise.all([
      admin.from("users").update({ notify_email: false }).eq("id", userId),
      admin.from("passports").update({ alert_rooms: false }).eq("user_id", userId),
    ]);
    if (users.error || passports.error) {
      console.error("unsubscribe:", users.error?.message ?? passports.error?.message);
      return res.status(500).type("html").send(page("Something went wrong", "Please try the link again in a minute."));
    }
    res.type("html").send(page("You're unsubscribed", "Fenly won't email you again. You can turn emails back on in your Passport."));
  });
}
