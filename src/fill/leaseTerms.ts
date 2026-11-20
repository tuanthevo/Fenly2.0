/**
 * How long a stay is. One list for both sides: the host's lease term when they
 * post a room (Fill) and the renter's length of stay on their Passport. The
 * values are stored as-is (listings.lease_term, passports.stay_length; the
 * 0005 SQL checks the Passport values against this list).
 */
export const LEASE_TERMS = ['Month-to-month', '3 months', '6 months', '9 months', '12+ months'] as const;
export type LeaseTerm = (typeof LEASE_TERMS)[number];

export const isLeaseTerm = (v: unknown): v is LeaseTerm =>
  typeof v === 'string' && (LEASE_TERMS as readonly string[]).includes(v);

/**
 * The options for a select. A listing saved before the list changed (e.g.
 * "12 months", "Until lease ends") keeps its value as an extra option, so
 * opening it doesn't silently change the term.
 */
export function leaseTermOptions(current: string | null | undefined): string[] {
  const list: string[] = [...LEASE_TERMS];
  return current && !list.includes(current) ? [...list, current] : list;
}
