/**
 * "New rooms that match" alerts: a daily digest of rooms published since the
 * last one that fit a renter's Passport. Logistics only (fair housing): a place
 * and radius, the budget, the move-in date and the length of stay, the same
 * facts and rules as applicant matching (fit.ts). Pure; the daily cron
 * (server/adminRoutes.ts) sends it through notify().
 */
import { DEFAULT_RADIUS_MILES, RADIUS_MILES, inBayAreaBounds } from '../geo/bayArea.js';
import { isLeaseTerm } from '../fill/leaseTerms.js';
import { budgetFit, moveInFit } from './fit.js';
import { cleanPlaceLabel, roomDistanceMiles, type FindNear } from './findFilters.js';

/** Rooms listed in one email; the rest are counted ("and 4 more") */
export const ALERT_DIGEST_MAX = 5;

export type AlertPrefs = {
  userId: string;
  /** A place and radius; null = anywhere in the Bay Area */
  near: FindNear | null;
  budgetMaxCents: number | null;
  /** YYYY-MM-DD */
  moveInFrom: string | null;
  stayLength: string | null;
};

export type AlertListing = {
  id: string;
  ownerId: string;
  city: string | null;
  neighborhood: string | null;
  rentCents: number | null;
  availableFrom: string | null;
  leaseTerm: string | null;
  publishedAt: string | null;
};

/** "Month-to-month" -> 0 (flexible), "6 months" -> 6, "12+ months" -> 12; null when unknown. */
function months(term: string | null): number | null {
  if (!term) return null;
  if (/month.to.month/i.test(term)) return 0;
  const m = /^(\d+)/.exec(term.trim());
  return m ? Number(m[1]) : null;
}

/**
 * The renter's length of stay fits the room's lease: either side is month-to-month,
 * both are a year or more, or they're within 3 months of each other.
 */
export function stayFits(stayLength: string | null, leaseTerm: string | null): boolean {
  const want = months(stayLength);
  const offer = months(leaseTerm);
  if (want == null || offer == null || want === 0 || offer === 0) return true;
  if (want >= 12 && offer >= 12) return true;
  return Math.abs(want - offer) <= 3;
}

export function listingMatchesAlert(l: AlertListing, p: AlertPrefs): boolean {
  if (p.near) {
    const d = roomDistanceMiles({ city: l.city, neighborhood: l.neighborhood }, p.near);
    if (d == null || d > p.near.miles) return false;
  }
  if (budgetFit(l.rentCents, { budgetMaxCents: p.budgetMaxCents }).level === 'off') return false;
  if (moveInFit({ moveInDate: null, moveInFrom: p.moveInFrom, moveInTo: null }, l.availableFrom).level === 'off') return false;
  return stayFits(p.stayLength, l.leaseTerm);
}

/** Rooms published after `sinceIso` that match, never the renter's own, closest (then newest) first. */
export function alertDigest(listings: AlertListing[], p: AlertPrefs, sinceIso: string): { rooms: AlertListing[]; total: number } {
  const since = Date.parse(sinceIso);
  const fresh = listings.filter(
    (l) => l.ownerId !== p.userId && l.publishedAt != null && Date.parse(l.publishedAt) > since && listingMatchesAlert(l, p)
  );
  const dist = (l: AlertListing) => (p.near ? roomDistanceMiles(l, p.near) ?? Infinity : 0);
  fresh.sort((a, b) => dist(a) - dist(b) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  return { rooms: fresh.slice(0, ALERT_DIGEST_MAX), total: fresh.length };
}

/** A passports row -> alert settings, or null when alerts are off. Bad values are dropped, not trusted. */
export function cleanAlertPrefs(row: Record<string, unknown>): AlertPrefs | null {
  if (row.alert_rooms !== true || typeof row.user_id !== 'string') return null;
  const lat = Number(row.alert_lat);
  const lng = Number(row.alert_lng);
  const miles = Number(row.alert_miles);
  const near: FindNear | null =
    row.alert_lat != null && row.alert_lng != null && inBayAreaBounds(lat, lng)
      ? {
          label: cleanPlaceLabel(String(row.alert_place ?? '')) || 'your area',
          lat,
          lng,
          miles: (RADIUS_MILES as readonly number[]).includes(miles) ? miles : DEFAULT_RADIUS_MILES,
        }
      : null;
  const budget = Number(row.budget_max_cents);
  const moveIn = typeof row.move_in_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.move_in_from) ? row.move_in_from : null;
  return {
    userId: row.user_id,
    near,
    budgetMaxCents: row.budget_max_cents != null && Number.isFinite(budget) && budget > 0 ? budget : null,
    moveInFrom: moveIn,
    stayLength: isLeaseTerm(row.stay_length) ? row.stay_length : null,
  };
}
