/**
 * Text the host sends or sees about applicants: the polite decline template and
 * the AI summary request. The AI only ever sees numbered applicants' factual
 * fields, never names, photos, bios or notes.
 */
import type { FactualApplicant } from './factualApplicant';
import { LIFESTYLE_QUESTIONS } from './lifestyle';
import { formatRentCents } from '../fill/publicListing';

export function declineTemplate(firstName: string | null | undefined, listingArea: string): string {
  const hi = firstName?.trim() ? `Hi ${firstName.trim()},` : 'Hi,';
  return `${hi} thanks for applying for the room in ${listingArea} and for taking the time to share your Passport. We've decided to go with another applicant this time. Good luck with your search, and I hope you find a great place soon.`;
}

/** Applicant-facing message when the room is filled by someone else. */
export function roomTakenText(listingArea: string, similarCount: number): string {
  const tail =
    similarCount > 0
      ? ` Here ${similarCount === 1 ? 'is 1 similar room' : `are ${similarCount} similar rooms`} nearby.`
      : ' New rooms in the area show up in Find every week.';
  return `This room in ${listingArea} is taken.${tail}`;
}

export const APPLICANT_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence, at most 90 characters.' },
    applicants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          fit: { type: 'string', enum: ['strong', 'possible', 'weak'] },
          reason: { type: 'string', description: 'At most 80 characters, factual fields only.' },
        },
        required: ['number', 'fit', 'reason'],
      },
    },
  },
  required: ['headline', 'applicants'],
} as const;

export const APPLICANT_SUMMARY_INSTRUCTION =
  'You help a person renting out a room in a shared home compare applicants. ' +
  'Use only the facts given: verification badges, Passport level, move-in timing, budget against rent, ' +
  'lifestyle answers (sleep schedule, shared spaces, guests, pets, smoking, work from home), ' +
  'whether there is an intro video and how long the note is. Do not guess anything else about anyone. ' +
  'Be brief and neutral. Example headline: "3 strong fits: verified ID, move-in matches, budget OK".';

export type SummaryApplicant = { number: number; facts: FactualApplicant };

export function buildApplicantSummaryPrompt(
  listing: { rentCents: number | null; availableFrom: string | null; houseLifestyle?: string | null },
  applicants: SummaryApplicant[]
): string {
  const lines = applicants.map(({ number, facts }) => {
    const life = LIFESTYLE_QUESTIONS.map((q) => (facts.lifestyle[q.key] ? `${q.label}: ${facts.lifestyle[q.key]}` : null))
      .filter(Boolean)
      .join('; ');
    return [
      `Applicant ${number}:`,
      `phone verified ${facts.phoneVerified ? 'yes' : 'no'}, ID verified ${facts.idVerified ? 'yes' : 'no'}, Passport level ${facts.passportLevel}`,
      `move-in ${facts.moveInDate ?? (facts.moveInFrom ? `${facts.moveInFrom} to ${facts.moveInTo ?? facts.moveInFrom}` : 'not given')}`,
      `budget up to ${formatRentCents(facts.budgetMaxCents) ?? 'not given'}`,
      life ? `lifestyle: ${life}` : 'lifestyle: not given',
      `intro video ${facts.hasIntroVideo ? 'yes' : 'no'}, note ${facts.noteLength} characters`,
    ].join(' | ');
  });
  return [
    `Room rent: ${formatRentCents(listing.rentCents) ?? 'not set'} per month. Free from: ${listing.availableFrom ?? 'flexible'}.`,
    ...lines,
  ].join('\n');
}
