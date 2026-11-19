/**
 * Housemate invite links: /?house=<token>. Only the SHA-256 hash is stored, so a
 * database leak can't be turned into working invites. Single use, 7 days.
 */
import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newInviteToken(bytes: (n: number) => Buffer = randomBytes): string {
  return bytes(24).toString("base64url");
}

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteRow = { expires_at: string; used_by: string | null };

export function inviteProblem(invite: InviteRow | null, now: number): "not_found" | "used" | "expired" | null {
  if (!invite) return "not_found";
  if (invite.used_by) return "used";
  if (Date.parse(invite.expires_at) <= now) return "expired";
  return null;
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/?house=${encodeURIComponent(token)}`;
}
