/**
 * Fair-housing guard for everything that judges or sorts applicants.
 *
 * Matching, Find filters, applicant cards' fit math and the AI summary only
 * ever receive a FactualApplicant: an allowlist of logistics and verification
 * facts. Names, photos, bios and notes are shown to the host as the applicant
 * wrote them, but never scored, sorted or sent to the AI, because they can
 * reveal protected traits. factualApplicant.test.ts fails if a protected-trait
 * term shows up in any of these shapes.
 */
import { cleanLifestyle, type Lifestyle } from './lifestyle';

export const FACTUAL_FIELDS = [
  'phoneVerified',
  'idVerified',
  'rentHistoryVerified',
  'passportLevel',
  'moveInDate',
  'moveInFrom',
  'moveInTo',
  'budgetMinCents',
  'budgetMaxCents',
  'lifestyle',
  'hasIntroVideo',
  'noteLength',
] as const;

export type FactualApplicant = {
  phoneVerified: boolean;
  idVerified: boolean;
  rentHistoryVerified: boolean;
  passportLevel: number;
  /** YYYY-MM-DD */
  moveInDate: string | null;
  moveInFrom: string | null;
  moveInTo: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  lifestyle: Lifestyle;
  hasIntroVideo: boolean;
  noteLength: number;
};

/**
 * Federal Fair Housing Act and California FEHA protected classes, plus common
 * stand-ins for them. Matched as whole words against identifiers and text.
 */
export const PROTECTED_TRAIT_TERMS = [
  'race', 'racial', 'ethnicity', 'ethnic', 'color', 'colour', 'skin',
  'religion', 'religious', 'faith', 'church', 'mosque', 'synagogue',
  'sex', 'gender', 'pronouns', 'pregnant', 'pregnancy',
  'sexual orientation', 'orientation', 'gay', 'lesbian', 'straight', 'transgender',
  'national origin', 'nationality', 'ancestry', 'citizenship', 'citizen', 'immigration', 'immigrant', 'visa',
  'familial status', 'family status', 'children', 'kids', 'marital', 'married', 'spouse',
  'disability', 'disabled', 'handicap', 'wheelchair', 'medical', 'health',
  'age', 'birthdate', 'birthday', 'dob', 'young', 'old', 'senior', 'student',
  'source of income', 'section 8', 'voucher', 'welfare',
  'military', 'veteran', 'genetic', 'language', 'accent',
] as const;

/** Splits camelCase, snake_case and punctuation into lowercase words. */
export function toWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The protected-trait terms found in `text` (identifiers or prose). */
export function protectedTermsIn(text: string): string[] {
  const words = toWords(text);
  const joined = ` ${words.join(' ')} `;
  return PROTECTED_TRAIT_TERMS.filter((term) => joined.includes(` ${term} `));
}

const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** Copies only the allowlisted facts. Anything else on `raw` is dropped. */
export function toFactualApplicant(raw: Record<string, unknown>): FactualApplicant {
  return {
    phoneVerified: raw.phoneVerified === true,
    idVerified: raw.idVerified === true,
    rentHistoryVerified: raw.rentHistoryVerified === true,
    passportLevel: typeof raw.passportLevel === 'number' ? Math.max(0, Math.min(3, Math.round(raw.passportLevel))) : 0,
    moveInDate: isoDate(raw.moveInDate),
    moveInFrom: isoDate(raw.moveInFrom),
    moveInTo: isoDate(raw.moveInTo),
    budgetMinCents: cents(raw.budgetMinCents),
    budgetMaxCents: cents(raw.budgetMaxCents),
    lifestyle: cleanLifestyle(raw.lifestyle),
    hasIntroVideo: raw.hasIntroVideo === true,
    noteLength: typeof raw.noteLength === 'number' && raw.noteLength > 0 ? Math.round(raw.noteLength) : 0,
  };
}
