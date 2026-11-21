/**
 * Applicant fit for the host's inbox: move-in timing and budget, plus a short
 * factual summary. Takes FactualApplicant only (see factualApplicant.ts).
 */
import type { FactualApplicant } from './factualApplicant.js';
import { formatRentCents } from '../fill/publicListing.js';

export type FitLevel = 'great' | 'ok' | 'off' | 'unknown';
export type Fit = { level: FitLevel; text: string };

const DAY_MS = 86_400_000;
const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * How the applicant's move-in (a date, or else their window) lines up with the
 * room's available date. Within a week is great, within two weeks is OK.
 */
export function moveInFit(
  applicant: Pick<FactualApplicant, 'moveInDate' | 'moveInFrom' | 'moveInTo'>,
  availableFrom: string | null
): Fit {
  if (!availableFrom) return { level: 'ok', text: 'Room has no set move-in date' };
  const avail = toDay(availableFrom);
  let gap: number | null = null;
  if (applicant.moveInDate) {
    gap = toDay(applicant.moveInDate) - avail;
  } else if (applicant.moveInFrom) {
    const from = toDay(applicant.moveInFrom);
    const to = applicant.moveInTo ? toDay(applicant.moveInTo) : from;
    gap = avail < from ? from - avail : avail > to ? to - avail : 0;
  }
  if (gap == null) return { level: 'unknown', text: 'No move-in date yet' };
  const abs = Math.abs(gap);
  if (abs <= 7) return { level: 'great', text: 'Move-in matches' };
  const when = gap > 0 ? `${plural(abs, 'day')} after it's free` : `${plural(abs, 'day')} before it's free`;
  return { level: abs <= 14 ? 'ok' : 'off', text: `Moves in ${when}` };
}

/** Rent against the applicant's budget. Up to 10% over is "OK". */
export function budgetFit(rentCents: number | null, applicant: Pick<FactualApplicant, 'budgetMaxCents'>): Fit {
  if (rentCents == null) return { level: 'ok', text: 'No rent set' };
  const max = applicant.budgetMaxCents;
  if (max == null) return { level: 'unknown', text: 'No budget yet' };
  if (rentCents <= max) return { level: 'great', text: 'Budget OK' };
  const over = rentCents - max;
  return {
    level: over <= max * 0.1 ? 'ok' : 'off',
    text: `${formatRentCents(over)}/mo over budget`,
  };
}

export type ScoredApplicant = {
  id: string;
  status: string;
  createdAt: string;
  facts: FactualApplicant;
  moveIn: Fit;
  budget: Fit;
  strong: boolean;
};

export function isStrongFit(facts: FactualApplicant, moveIn: Fit, budget: Fit): boolean {
  return facts.phoneVerified && moveIn.level !== 'off' && moveIn.level !== 'unknown' && budget.level === 'great';
}

export function scoreApplicant(
  a: { id: string; status: string; createdAt: string; facts: FactualApplicant },
  listing: { rentCents: number | null; availableFrom: string | null }
): ScoredApplicant {
  const moveIn = moveInFit(a.facts, listing.availableFrom);
  const budget = budgetFit(listing.rentCents, a.facts);
  return { ...a, moveIn, budget, strong: isStrongFit(a.facts, moveIn, budget) };
}

const STATUS_ORDER: Record<string, number> = { chosen: 0, shortlisted: 1, submitted: 2, declined: 3, withdrawn: 4 };

/** Chosen, then shortlisted, then strong fits, higher Passport level, earliest first. */
export function compareApplicants(a: ScoredApplicant, b: ScoredApplicant): number {
  return (
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
    Number(b.strong) - Number(a.strong) ||
    b.facts.passportLevel - a.facts.passportLevel ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/** "3 strong fits: verified ID, move-in matches, budget OK" (factual, no AI). */
export function summarizeApplicants(applicants: ScoredApplicant[]): string {
  const open = applicants.filter((a) => a.status === 'submitted' || a.status === 'shortlisted');
  if (open.length === 0) return 'No open applications yet.';
  const strong = open.filter((a) => a.strong);
  if (strong.length === 0) {
    const inBudget = open.filter((a) => a.budget.level === 'great').length;
    return `${plural(open.length, 'applicant')}, no strong fits yet: ${inBudget} within budget.`;
  }
  const reasons: string[] = [];
  const idCount = strong.filter((a) => a.facts.idVerified).length;
  if (idCount === strong.length) reasons.push('verified ID');
  else reasons.push('verified phone');
  reasons.push('move-in matches', 'budget OK');
  const head = `${strong.length} strong fit${strong.length === 1 ? '' : 's'}: ${reasons.join(', ')}`;
  const others = open.length - strong.length;
  return others > 0 ? `${head}. ${plural(others, 'other applicant')}.` : `${head}.`;
}
