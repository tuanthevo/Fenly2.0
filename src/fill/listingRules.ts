/**
 * Rules for saving and publishing a listing (pure; the server enforces them).
 */
import { fairHousingIssues } from '../remotion/viral/copy';
import type { LeasePermission } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEASE_PERMISSIONS: LeasePermission[] = ['can_replace', 'leaseholder', 'not_sure'];

export const MIN_RENT_CENTS = 100_00;
export const MAX_RENT_CENTS = 20_000_00;

export type ListingPatch = Partial<{
  lease_permission: LeasePermission;
  title: string | null;
  description: string | null;
  neighborhood: string | null;
  city: string;
  rent_cents: number;
  deposit_cents: number | null;
  available_from: string | null;
  move_out_date: string | null;
  lease_term: string | null;
  beds: number | null;
  baths: number | null;
  amenities: string[];
  house_rules: string | null;
  caption: string | null;
  viral_edit: unknown;
  copy_approved_at: string | null;
}>;

export type PatchResult = { ok: true; patch: ListingPatch } | { ok: false; errors: string[] };

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The day after `date` (YYYY-MM-DD). */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function validRentCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_RENT_CENTS && value <= MAX_RENT_CENTS;
}

function text(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+$/g, '').replace(/^\s+/g, '');
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

/**
 * Turns a request body into a safe update. Unknown keys are dropped; wrong types
 * are errors. Changing the title or description clears the host's approval
 * unless the same request approves again (`copy_approved: true`).
 */
export function sanitizeListingPatch(body: unknown, now: Date = new Date()): PatchResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body must be an object'] };
  const input = body as Record<string, unknown>;
  const patch: ListingPatch = {};
  const errors: string[] = [];

  const setText = (key: keyof ListingPatch, max: number) => {
    if (!(key in input)) return;
    const value = text(input[key], max);
    if (value === undefined) errors.push(`${key} must be text`);
    else (patch as Record<string, unknown>)[key] = value;
  };
  setText('title', 120);
  setText('description', 4000);
  setText('neighborhood', 80);
  setText('lease_term', 40);
  setText('house_rules', 2000);
  setText('caption', 2200);
  if ('city' in input) {
    const city = text(input.city, 80);
    if (!city) errors.push('city is required');
    else patch.city = city;
  }

  if ('lease_permission' in input) {
    if (LEASE_PERMISSIONS.includes(input.lease_permission as LeasePermission)) {
      patch.lease_permission = input.lease_permission as LeasePermission;
    } else errors.push('lease_permission must be can_replace, leaseholder or not_sure');
  }
  if ('rent_cents' in input) {
    if (validRentCents(input.rent_cents)) patch.rent_cents = input.rent_cents;
    else errors.push('rent must be between $100 and $20,000');
  }
  if ('deposit_cents' in input) {
    const v = input.deposit_cents;
    if (v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_RENT_CENTS * 3)) patch.deposit_cents = v;
    else errors.push('deposit_cents is invalid');
  }
  for (const key of ['available_from', 'move_out_date'] as const) {
    if (!(key in input)) continue;
    const v = input[key];
    if (v === null || isIsoDate(v)) patch[key] = v as string | null;
    else errors.push(`${key} must be a date (YYYY-MM-DD)`);
  }
  for (const [key, max, step] of [
    ['beds', 10, 1],
    ['baths', 10, 0.5],
  ] as const) {
    if (!(key in input)) continue;
    const v = input[key];
    if (v === null || (typeof v === 'number' && v >= 0 && v <= max && Number.isInteger(v / step))) patch[key] = v as number | null;
    else errors.push(`${key} is invalid`);
  }
  if ('amenities' in input) {
    const v = input.amenities;
    if (Array.isArray(v) && v.every((a) => typeof a === 'string')) {
      patch.amenities = [...new Set((v as string[]).map((a) => a.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
    } else errors.push('amenities must be a list of text');
  }
  if ('viral_edit' in input) {
    const json = JSON.stringify(input.viral_edit ?? null);
    if (json.length > 200_000) errors.push('viral_edit is too large');
    else patch.viral_edit = input.viral_edit ?? null;
  }

  const copyChanged = 'title' in patch || 'description' in patch;
  if (input.copy_approved === true) patch.copy_approved_at = now.toISOString();
  else if (input.copy_approved === false || copyChanged) patch.copy_approved_at = null;

  return errors.length ? { ok: false, errors } : { ok: true, patch };
}

/** Every string inside a JSON value (for scanning saved edits and callouts). */
export function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out, depth + 1));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out, depth + 1));
  return out;
}

export type FairHousingIssue = { field: string; phrases: string[] };

/** Fair-housing hits per field, for listing text, the video's words and share posts. */
export function listingFairHousingIssues(fields: Record<string, unknown>): FairHousingIssue[] {
  const issues: FairHousingIssue[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const phrases = [...new Set(collectStrings(value).flatMap((s) => fairHousingIssues(s)))];
    if (phrases.length) issues.push({ field, phrases });
  }
  return issues;
}

export type PublishProblem =
  | 'lease_check'
  | 'copy_not_approved'
  | 'missing_title'
  | 'missing_description'
  | 'missing_rent'
  | 'missing_video'
  | 'missing_thumbnail'
  | 'already_filled';

export const PUBLISH_PROBLEM_TEXT: Record<PublishProblem, string> = {
  lease_check: 'Confirm your lease lets you find a replacement (or that you are the leaseholder).',
  copy_not_approved: 'Check the title and description and tick "I checked this text".',
  missing_title: 'Add a title.',
  missing_description: 'Add a description.',
  missing_rent: 'Add the rent for the room.',
  missing_video: 'Make the video tour first.',
  missing_thumbnail: 'The video cover image is missing. Export the video again.',
  already_filled: 'This room is already marked filled.',
};

export function publishProblems(
  listing: {
    status: string;
    lease_permission: string | null;
    copy_approved_at: string | null;
    title: string | null;
    description: string | null;
    rent_cents: number | null;
  },
  mediaKinds: string[]
): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (listing.status === 'filled') problems.push('already_filled');
  if (listing.lease_permission !== 'can_replace' && listing.lease_permission !== 'leaseholder') problems.push('lease_check');
  if (!listing.title?.trim()) problems.push('missing_title');
  if (!listing.description?.trim()) problems.push('missing_description');
  if (!listing.copy_approved_at) problems.push('copy_not_approved');
  if (!validRentCents(listing.rent_cents)) problems.push('missing_rent');
  if (!mediaKinds.includes('video_full')) problems.push('missing_video');
  if (!mediaKinds.includes('thumbnail')) problems.push('missing_thumbnail');
  return problems;
}

export type FillStep = 'start' | 'lease' | 'tour' | 'details' | 'video' | 'publish' | 'share';

/** Where a saved draft picks up again. "Not sure" about the lease brings the host back to the lease check. */
export function resumeStep(
  listing: {
    status: string;
    lease_permission: string | null;
    title: string | null;
    description: string | null;
    copy_approved_at: string | null;
  } | null,
  mediaKinds: string[],
  rawClipCount: number
): FillStep {
  if (!listing) return 'start';
  if (listing.status === 'published' || listing.status === 'filled') return 'share';
  if (!listing.lease_permission || listing.lease_permission === 'not_sure') return 'lease';
  if (rawClipCount < 3) return 'tour';
  if (!listing.copy_approved_at || !listing.title?.trim() || !listing.description?.trim()) return 'details';
  if (!mediaKinds.includes('video_full') || !mediaKinds.includes('thumbnail')) return 'video';
  return 'publish';
}

/** Which step fixes a publish problem. */
export const PROBLEM_STEP: Record<PublishProblem, FillStep> = {
  lease_check: 'lease',
  copy_not_approved: 'details',
  missing_title: 'details',
  missing_description: 'details',
  missing_rent: 'start',
  missing_video: 'video',
  missing_thumbnail: 'video',
  already_filled: 'share',
};

/** Storage path for a raw clip, and the slot number back from a path. */
export function rawClipPath(listingId: string, slotNumber: number, ext: string): string {
  return `${listingId}/raw/slot-${slotNumber}.${ext}`;
}
export function slotFromRawPath(path: string): number | null {
  const match = /\/raw\/slot-([1-5])\.[a-z0-9]+$/.exec(path);
  return match ? Number(match[1]) : null;
}
