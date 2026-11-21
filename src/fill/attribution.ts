/**
 * Which tracked link brought an applicant. Stored in the browser (localStorage)
 * when a /r/<code> link opens the app, so it survives sign-in and a few days of
 * thinking it over.
 *
 * Rule: the most recent non-direct link within 7 days wins; a direct visit never
 * overwrites a channel that is still fresh.
 */
import type { ShareChannel } from './types.js';
import { isLinkCode } from './linkCodes.js';

export const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredVia = { code: string; listingId: string; at: number; direct?: boolean };

export function rememberVia(
  stored: StoredVia | null | undefined,
  incoming: { code: string | null | undefined; listingId: string; direct?: boolean },
  now: number
): StoredVia | null {
  const fresh = stored && now - stored.at <= ATTRIBUTION_WINDOW_MS && stored.at <= now ? stored : null;
  if (!incoming.code || !isLinkCode(incoming.code)) return fresh;
  const next: StoredVia = { code: incoming.code, listingId: incoming.listingId, at: now, direct: incoming.direct || undefined };
  if (incoming.direct && fresh && !fresh.direct && fresh.listingId === incoming.listingId) return fresh;
  return next;
}

/** The code to send with an application for `listingId`, if one is still fresh. */
export function viaForListing(stored: StoredVia | null | undefined, listingId: string, now: number): string | null {
  if (!stored || stored.listingId !== listingId) return null;
  if (now - stored.at > ATTRIBUTION_WINDOW_MS || stored.at > now) return null;
  return stored.code;
}

export function parseStoredVia(raw: string | null): StoredVia | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value && isLinkCode(value.code) && typeof value.listingId === 'string' && Number.isFinite(value.at)) {
      return { code: value.code, listingId: value.listingId, at: value.at, direct: value.direct === true || undefined };
    }
  } catch {
    // ignore
  }
  return null;
}

const LABELS: Record<ShareChannel, string> = {
  facebook: 'Facebook group',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  group_chat: 'Group chat',
  direct: 'Direct link',
};

export function channelLabel(channel: ShareChannel | null | undefined): string {
  return channel ? LABELS[channel] : 'Unknown';
}
