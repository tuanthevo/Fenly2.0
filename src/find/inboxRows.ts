/**
 * Inbox rows for renters: each row is a room they applied to, with where the
 * application stands. Pure rules, unit tested (inboxRows.test.ts).
 *
 * Wording is deliberately soft (host's call, Nov 2026): "Not chosen", never
 * "Denied" or "Rejected"; "Chosen", never "Approved" (Fenly doesn't sign leases).
 */
import { formatRentCents } from '../fill/publicListing';

export type StatusTone = 'pending' | 'good' | 'closed';

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  submitted: { label: 'Pending', tone: 'pending' },
  shortlisted: { label: 'Shortlisted', tone: 'good' },
  chosen: { label: 'Chosen', tone: 'good' },
  declined: { label: 'Not chosen', tone: 'closed' },
  withdrawn: { label: 'Withdrawn', tone: 'closed' },
};

export function applicationStatus(status: string): { label: string; tone: StatusTone } {
  return STATUS[status] ?? { label: 'Pending', tone: 'pending' };
}

export type InboxRowThread = {
  applicationId: string;
  role: 'applicant' | 'host' | 'housemate';
  status: string;
  unread: number;
};

/**
 * A renter's closed applications (not chosen, withdrawn) fold into "Past" so the
 * Inbox doesn't become a list of rooms they didn't get. One with an unread
 * message stays on top until it's read. Hosts' conversations are never folded.
 */
export function splitInbox<T extends InboxRowThread>(threads: T[]): { active: T[]; past: T[] } {
  const isPast = (t: T) => t.role === 'applicant' && applicationStatus(t.status).tone === 'closed' && t.unread === 0;
  return { active: threads.filter((t) => !isPast(t)), past: threads.filter(isPast) };
}

/** The public room page (/r/<listing id>) exists for published and filled rooms only. */
export function canViewRoom(listing: { status: string } | null | undefined): boolean {
  return listing?.status === 'published' || listing?.status === 'filled';
}

export function roomLine(listing: { rentCents: number | null; neighborhood: string | null } | null | undefined): string {
  const rent = formatRentCents(listing?.rentCents);
  const place = listing?.neighborhood?.trim();
  return rent ? `${rent}/mo · ${place || 'Bay Area'}` : `Room in ${place || 'the Bay Area'}`;
}
