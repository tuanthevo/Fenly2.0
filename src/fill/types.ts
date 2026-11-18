/** Shared shapes for the Fenly 2.0 Fill flow (browser + server). */

export const SHARE_CHANNELS = ['facebook', 'reddit', 'tiktok', 'instagram', 'group_chat', 'direct'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export type LeasePermission = 'can_replace' | 'leaseholder' | 'not_sure';
export type ListingStatus = 'draft' | 'published' | 'filled' | 'archived';

/** What the share posts, public page and status math need about a listing. */
export interface FillListingInfo {
  id: string;
  title: string | null;
  description: string | null;
  neighborhood: string | null;
  city: string;
  rentCents: number | null;
  /** YYYY-MM-DD */
  availableFrom: string | null;
  /** YYYY-MM-DD */
  moveOutDate: string | null;
  beds: number | null;
  baths: number | null;
  amenities: string[];
  leaseTerm: string | null;
  caption?: string | null;
}

export interface ListingLinkRow {
  id: string;
  channel: ShareChannel;
  code: string;
}

export function isShareChannel(value: unknown): value is ShareChannel {
  return typeof value === 'string' && (SHARE_CHANNELS as readonly string[]).includes(value);
}
