/**
 * Passport lifestyle questions: habits and logistics only, never who someone is.
 * These keys and options are the only lifestyle data matching, cards and AI
 * summaries ever see (see factualApplicant.ts and its fair-housing test).
 */

export const LIFESTYLE_QUESTIONS = [
  { key: 'sleep', label: 'Sleep schedule', options: ['Early bird', 'Night owl', 'Varies'] },
  { key: 'cleanliness', label: 'Shared spaces', options: ['Relaxed', 'Tidy', 'Very tidy'] },
  { key: 'guests', label: 'Guests over', options: ['Rarely', 'Sometimes', 'Often'] },
  { key: 'pets', label: 'Pets', options: ['No pets', 'I have a pet', 'Happy to live with pets'] },
  { key: 'smoking', label: 'Smoking', options: ['Never', 'Outside only', 'Yes'] },
  { key: 'wfh', label: 'Work from home', options: ['Never', 'Some days', 'Most days'] },
] as const;

export type LifestyleKey = (typeof LIFESTYLE_QUESTIONS)[number]['key'];
export type Lifestyle = Partial<Record<LifestyleKey, string>>;

export const LIFESTYLE_KEYS: LifestyleKey[] = LIFESTYLE_QUESTIONS.map((q) => q.key);

/** 1.0 keys that map onto the new ones ("social" has no equivalent and is dropped). */
const LEGACY_KEYS: Record<string, LifestyleKey> = { schedule: 'sleep', tidiness: 'cleanliness' };

/**
 * Keeps only known questions with one of their own options. Old answers
 * (schedule, tidiness) move to their new keys. Anything else is dropped, so
 * free text or unexpected keys can never reach a host or the AI.
 */
export function cleanLifestyle(raw: unknown): Lifestyle {
  const out: Lifestyle = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const source = raw as Record<string, unknown>;
  for (const question of LIFESTYLE_QUESTIONS) {
    const legacy = Object.keys(LEGACY_KEYS).find((k) => LEGACY_KEYS[k] === question.key);
    const value = source[question.key] ?? (legacy ? source[legacy] : undefined);
    if (typeof value === 'string' && (question.options as readonly string[]).includes(value)) {
      out[question.key] = value;
    }
  }
  return out;
}

export function lifestyleComplete(lifestyle: unknown): boolean {
  const clean = cleanLifestyle(lifestyle);
  return LIFESTYLE_KEYS.every((k) => Boolean(clean[k]));
}

export function lifestyleLabel(key: LifestyleKey): string {
  return LIFESTYLE_QUESTIONS.find((q) => q.key === key)?.label ?? key;
}
