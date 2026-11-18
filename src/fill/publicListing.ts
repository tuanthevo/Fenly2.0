/**
 * Pure helpers for the public listing page (/r/<code>) and its link previews.
 * Area only, never an exact address.
 */
import type { FillListingInfo } from './types';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-12-01" -> "Dec 1"; on or before `today` -> "now". Invalid -> null. */
export function formatMoveIn(date: string | null | undefined, today?: string): string | null {
  const match = date ? ISO_DATE.exec(date) : null;
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (today && ISO_DATE.test(today) && date! <= today) return 'now';
  return `${MONTHS[month - 1]} ${day}`;
}

export function formatRentCents(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export function areaLabel(listing: Pick<FillListingInfo, 'neighborhood' | 'city'>): string {
  return (listing.neighborhood || listing.city || 'San Francisco').trim();
}

/** "Room in Mission · $1,450/mo" */
export function listingHeadline(listing: FillListingInfo): string {
  const rent = formatRentCents(listing.rentCents);
  return [`Room in ${areaLabel(listing)}`, rent ? `${rent}/mo` : null].filter(Boolean).join(' · ');
}

/** "$1,450/mo · Move in Dec 1 · Mission, San Francisco" */
export function listingSummary(listing: FillListingInfo, today?: string): string {
  const rent = formatRentCents(listing.rentCents);
  const moveIn = formatMoveIn(listing.availableFrom, today);
  const area = listing.neighborhood ? `${listing.neighborhood}, ${listing.city}` : listing.city;
  return [rent ? `${rent}/mo` : null, moveIn ? (moveIn === 'now' ? 'Move in now' : `Move in ${moveIn}`) : null, area]
    .filter(Boolean)
    .join(' · ');
}

/** Open Graph + Twitter tags for a listing, HTML-escaped. */
export function buildListingMeta(
  listing: FillListingInfo,
  opts: { url: string; imageUrl?: string | null; today?: string }
): string {
  const title = listing.title?.trim() || listingHeadline(listing);
  const description = listingSummary(listing, opts.today);
  const tags: [string, string, string][] = [
    ['name', 'description', description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Fenn'],
    ['property', 'og:title', `${title} · ${formatRentCents(listing.rentCents) ?? ''}`.replace(/ · $/, '')],
    ['property', 'og:description', description],
    ['property', 'og:url', opts.url],
    ['name', 'twitter:card', opts.imageUrl ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
  ];
  if (opts.imageUrl) {
    tags.push(
      ['property', 'og:image', opts.imageUrl],
      ['property', 'og:image:width', '1080'],
      ['property', 'og:image:height', '1920'],
      ['property', 'og:image:alt', `Video tour of a room in ${areaLabel(listing)}`],
      ['name', 'twitter:image', opts.imageUrl]
    );
  }
  return tags.map(([attr, key, value]) => `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`).join('\n');
}

/** Link-preview crawlers and search bots: they get the page but don't count as views. */
const BOT_UA =
  /(facebookexternalhit|facebot|meta-externalagent|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|redditbot|applebot|googlebot|bingbot|duckduckbot|yandex|baiduspider|embedly|pinterest|skypeuripreview|vkshare|bot\b|crawler|spider|preview)/i;

export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // no UA: not a phone browser
  return BOT_UA.test(userAgent);
}

export const VISIT_DEDUPE_MS = 30 * 60 * 1000;

/** One view per browser per link per 30 minutes. */
export function shouldCountVisit(lastVisitAt: number | null | undefined, now: number): boolean {
  return lastVisitAt == null || now - lastVisitAt >= VISIT_DEDUPE_MS || lastVisitAt > now;
}
