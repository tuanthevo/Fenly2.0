/**
 * Small helpers shared by the Find & Apply route modules.
 */
import type { Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentAccessToken, type AuthedUser } from "./auth.js";
import { getAdminClient, getUserClient } from "./supabase.js";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** A Supabase client acting as the signed-in user (RLS applies), or null after sending 503. */
export function userDb(res: Response): SupabaseClient | null {
  const token = currentAccessToken(res);
  const db = token ? getUserClient(token) : null;
  if (!db) res.status(503).json({ error: "supabase_not_configured" });
  return db;
}

/** The service-role client, or null after sending 503. Server-only reads and writes. */
export function adminDb(res: Response): SupabaseClient | null {
  const db = getAdminClient();
  if (!db) res.status(503).json({ error: "supabase_not_configured" });
  return db;
}

export function dbError(res: Response, error: { code?: string; message: string }, context: string) {
  if (error.code === "23505") return res.status(409).json({ error: "duplicate" });
  if (error.code === "23514") return res.status(409).json({ error: "check_failed" });
  if (error.code === "42501") return res.status(403).json({ error: "not_allowed" });
  console.error(`${context}:`, error.message);
  return res.status(500).json({ error: "database_error" });
}

/** Signed read URLs for private files (1 hour). Missing or failed paths map to null. */
export async function signedUrls(
  admin: SupabaseClient,
  bucket: string,
  paths: (string | null | undefined)[],
  expiresIn = 3600
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(unique, expiresIn);
  if (error) {
    console.error(`sign ${bucket}:`, error.message);
    return out;
  }
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

/** Comma-separated FENLY_ADMIN_EMAILS (server env). */
export function isAdminUser(user: Pick<AuthedUser, "email"> | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return (env.FENLY_ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

export const clip = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
