/**
 * Passport levels. The database computes the stored level with the same rule
 * (0003_find_apply.sql passport_level_for); this copy drives the "finish your
 * Passport" checklist in the browser.
 */
import { lifestyleComplete } from './lifestyle';

export type PassportFacts = {
  phoneVerified: boolean;
  photoUrl: string | null | undefined;
  bio: string | null | undefined;
  moveInFrom: string | null | undefined;
  budgetMaxCents: number | null | undefined;
  lifestyle: unknown;
  idVerified: boolean;
  rentHistoryVerified: boolean;
};

export type Level1Item = 'phone' | 'photo' | 'bio' | 'move_in' | 'budget' | 'lifestyle';

export const LEVEL1_ITEM_TEXT: Record<Level1Item, string> = {
  phone: 'Verify your phone number',
  photo: 'Add a photo',
  bio: 'Write a short bio',
  move_in: 'Set your move-in date',
  budget: 'Set your budget',
  lifestyle: 'Answer the 6 lifestyle questions',
};

const filled = (s: string | null | undefined) => typeof s === 'string' && s.trim() !== '';

/** What's still missing for Level 1, in the order the Passport screen shows it. */
export function level1Missing(p: PassportFacts): Level1Item[] {
  const missing: Level1Item[] = [];
  if (!p.phoneVerified) missing.push('phone');
  if (!filled(p.photoUrl)) missing.push('photo');
  if (!filled(p.bio)) missing.push('bio');
  if (!p.moveInFrom) missing.push('move_in');
  if (p.budgetMaxCents == null) missing.push('budget');
  if (!lifestyleComplete(p.lifestyle)) missing.push('lifestyle');
  return missing;
}

export function passportLevel(p: PassportFacts): 0 | 1 | 2 | 3 {
  if (level1Missing(p).length > 0) return 0;
  if (!p.idVerified) return 1;
  if (!p.rentHistoryVerified) return 2;
  return 3;
}
