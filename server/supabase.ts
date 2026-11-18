/**
 * Server-side Supabase access.
 *
 * - getAdminClient(): uses SUPABASE_SECRET_KEY, which bypasses row-level security.
 *   Server only (track, link visits, verifications, Passport badges). Never import
 *   this file from src/.
 * - publicSupabaseConfig(): the URL and publishable key the browser may see,
 *   served by GET /api/config. It refuses anything that looks like a secret key.
 *
 * Env is read lazily: server.ts loads .env.local after this module is imported.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PublicSupabaseConfig = { url: string; publishableKey: string };

function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** True for keys that must never reach a browser: new secret keys and legacy service_role JWTs. */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

export function publicSupabaseConfig(env: NodeJS.ProcessEnv = process.env): PublicSupabaseConfig | null {
  const url = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey || !isAllowedUrl(url)) return null;
  if (looksLikeSecretKey(publishableKey)) {
    console.error("SUPABASE_PUBLISHABLE_KEY holds a secret key; refusing to send it to the browser.");
    return null;
  }
  return { url: url.replace(/\/+$/, ""), publishableKey };
}

/**
 * A client that acts as the signed-in user (publishable key + their access token),
 * so row-level security applies exactly as in the browser. Use it for anything a
 * user does to their own data; keep the admin client for server-only tables.
 */
export function getUserClient(accessToken: string, env: NodeJS.ProcessEnv = process.env): SupabaseClient | null {
  const config = publicSupabaseConfig(env);
  if (!config) return null;
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

let adminClient: SupabaseClient | null = null;
let adminKeyFingerprint = "";

/** Service-role client, or null when SUPABASE_URL / SUPABASE_SECRET_KEY aren't set. */
export function getAdminClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient | null {
  const url = env.SUPABASE_URL?.trim();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret || !isAllowedUrl(url)) return null;
  const fingerprint = `${url}|${secret.length}|${secret.slice(-6)}`;
  if (!adminClient || fingerprint !== adminKeyFingerprint) {
    adminClient = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    adminKeyFingerprint = fingerprint;
  }
  return adminClient;
}
