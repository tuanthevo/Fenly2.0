/**
 * Analytics: track(event, props, ctx) writes one row to the `events` table.
 *
 * Server side only (service role). The browser reports a short list of events
 * through POST /api/events; everything else is tracked where it happens on the
 * server. track() never throws into a request and does nothing when Supabase
 * isn't configured.
 *
 * Props are for counting, not for people: keys that could hold personal data
 * (email, phone, names, addresses, tokens) are dropped, and props are capped.
 */
import { getAdminClient } from "./supabase.js";

export const EVENT_NAMES = [
  // foundation
  "app_open",
  "feed_view",
  "listing_open",
  "sign_in_started",
  "signed_in",
  "apply_gate_shown",
  "publish_gate_shown",
  "menu_feature_opened",
  // Fill loop (next step)
  "fill_started",
  "tour_recorded",
  "listing_published",
  "link_shared",
  "link_opened",
  "application_submitted",
  // Find & Apply
  "listing_saved",
  "shortlisted",
  "chosen",
  "room_filled",
  "id_verified",
  "message_sent",
  "report_submitted",
  "housemate_joined",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Events the browser may send through POST /api/events. */
export const CLIENT_EVENT_NAMES: readonly EventName[] = [
  "app_open",
  "feed_view",
  "listing_open",
  "sign_in_started",
  "signed_in",
  "apply_gate_shown",
  "publish_gate_shown",
  "menu_feature_opened",
  "tour_recorded",
  "link_shared",
];

export type EventContext = { userId?: string | null; anonId?: string | null; listingId?: string | null };

export type EventRow = {
  name: EventName;
  user_id: string | null;
  anon_id: string | null;
  listing_id: string | null;
  props: Record<string, unknown>;
};

export const MAX_PROPS_BYTES = 4096;
const MAX_DEPTH = 3;
const MAX_STRING = 300;
const MAX_KEYS = 40;
const PII_KEY = /(e-?mail|phone|name|address|street|token|password|secret|ssn|dob|birth|card|account|ip_?addr)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_ID = /^[A-Za-z0-9_-]{8,64}$/;

function cleanValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => cleanValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") return cleanProps(value as Record<string, unknown>, depth + 1);
  return undefined; // functions, symbols, bigint, undefined
}

/** Drops PII-looking keys and non-JSON values, limits depth, keys and string length. */
export function cleanProps(props: unknown, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!props || typeof props !== "object" || Array.isArray(props)) return out;
  let kept = 0;
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (kept >= MAX_KEYS) break;
    if (key === "__proto__" || key === "constructor" || PII_KEY.test(key)) continue;
    const cleaned = cleanValue(value, depth);
    if (cleaned === undefined) continue;
    out[key.slice(0, 64)] = cleaned;
    kept++;
  }
  return out;
}

export type BuildResult = { ok: true; row: EventRow } | { ok: false; reason: "unknown_event" };

export function buildEventRow(
  name: string,
  props: unknown,
  ctx: EventContext = {},
  allowed: readonly string[] = EVENT_NAMES
): BuildResult {
  if (!allowed.includes(name)) return { ok: false, reason: "unknown_event" };
  let cleaned = cleanProps(props);
  if (JSON.stringify(cleaned).length > MAX_PROPS_BYTES) cleaned = { truncated: true };
  return {
    ok: true,
    row: {
      name: name as EventName,
      user_id: ctx.userId && UUID.test(ctx.userId) ? ctx.userId : null,
      anon_id: ctx.anonId && ANON_ID.test(ctx.anonId) ? ctx.anonId : null,
      listing_id: ctx.listingId && UUID.test(ctx.listingId) ? ctx.listingId : null,
      props: cleaned,
    },
  };
}

export type EventWriter = (row: EventRow) => Promise<void>;

const supabaseWriter: EventWriter = async (row) => {
  const admin = getAdminClient();
  if (!admin) return; // not configured: analytics off
  const { error } = await admin.from("events").insert(row);
  if (error) throw new Error(error.message);
};

/** Records an event. Resolves false (never throws) when the event is unknown or the write fails. */
export async function track(
  name: EventName | string,
  props: unknown = {},
  ctx: EventContext = {},
  writer: EventWriter = supabaseWriter
): Promise<boolean> {
  const built = buildEventRow(name, props, ctx);
  if (!built.ok) {
    console.warn(`track: unknown event "${String(name).slice(0, 64)}"`);
    return false;
  }
  try {
    await writer(built.row);
    return true;
  } catch (error) {
    console.error("track failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
