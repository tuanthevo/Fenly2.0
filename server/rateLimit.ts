/**
 * Small in-memory rate limiter for the AI routes (Gemini, Lyria). These routes
 * stay open to signed-out hosts (sign-in is only asked at Apply, Publish and
 * Message), so without a limit anyone could run up the Gemini bill.
 *
 * Best effort: on Vercel each function instance keeps its own counts, so the real
 * ceiling is a few times `max`. That still stops a script hammering one route.
 */
import type { Request, RequestHandler } from "express";

export type RateLimiter = {
  hit(key: string): { ok: true } | { ok: false; retryAfterSec: number };
  size(): number;
};

export function createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let lastSweep = now();
  const sweep = (t: number) => {
    if (t - lastSweep < opts.windowMs) return;
    lastSweep = t;
    for (const [key, times] of hits) {
      if (times[times.length - 1] <= t - opts.windowMs) hits.delete(key);
    }
  };
  return {
    hit(key) {
      const t = now();
      sweep(t);
      const recent = (hits.get(key) ?? []).filter((at) => at > t - opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + opts.windowMs - t) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true };
    },
    size: () => hits.size,
  };
}

/** The caller's address: Vercel puts the real client first in x-forwarded-for. */
export function clientKey(req: Pick<Request, "headers" | "socket">): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}

/** Express middleware: 429 with Retry-After once a client passes the limit. */
export function rateLimit(limiter: RateLimiter, scope: string): RequestHandler {
  return (req, res, next) => {
    const result = limiter.hit(`${scope}:${clientKey(req)}`);
    if (result.ok) return next();
    res.setHeader("Retry-After", String(result.retryAfterSec));
    res.status(429).json({ error: "Too many requests. Try again in a minute." });
  };
}
