/**
 * Moderation decisions: combine the local heuristics (contact/payment
 * detection in utils/trustSafety, the fair-housing phrase list) with the AI
 * check into flags for the review queue. Flags never silently drop content:
 * messages are still delivered (with a warning), listings stay reachable by link.
 */

export type ModerationCategory = 'scam' | 'fair_housing' | 'off_platform' | 'harassment' | 'other';
export type Severity = 'low' | 'medium' | 'high';

export type AiVerdict = {
  scam: boolean;
  fairHousing: boolean;
  harassment: boolean;
  confidence: number;
  reason: string;
};

export type HeuristicSignals = {
  /** contact details or off-platform payment asks found by maskAndScanMessage / Layer 2 */
  offPlatform: boolean;
  offPlatformReason?: string;
  /** fair-housing phrases found in the text */
  fairHousingPhrases: string[];
  /** wire/gift card/deposit-before-viewing patterns */
  scamPhrases: string[];
};

export type FlagDecision = { category: ModerationCategory; severity: Severity; source: 'ai' | 'heuristic' | 'report'; reason: string };

const SCAM_PATTERNS: [RegExp, string][] = [
  [/\b(wire|western union|moneygram)\b/i, 'asks for a wire transfer'],
  [/\bgift ?cards?\b/i, 'mentions gift cards'],
  [/\b(crypto|bitcoin|usdt)\b/i, 'asks for crypto'],
  [/\b(zelle|venmo|cash ?app|paypal)\b.*\b(deposit|first month|hold|reserve)\b|\b(deposit|first month|hold|reserve)\b.*\b(zelle|venmo|cash ?app|paypal)\b/i, 'asks for a deposit by app'],
  [/\b(out of (the )?(country|town)|overseas|abroad)\b.*\b(keys?|mail)\b|\bmail (you )?the keys?\b/i, '"I\'m away, I\'ll mail the keys"'],
  [/\b(before|without) (a )?(viewing|seeing|tour)\b/i, 'pay before viewing'],
];

/** Common rental-scam phrases (deterministic, so they work without the AI). */
export function scamPhrases(text: string): string[] {
  return SCAM_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

/** Turns the signals into review-queue flags. Highest severity first. */
export function moderationFlags(h: HeuristicSignals, ai: AiVerdict | null): FlagDecision[] {
  const flags: FlagDecision[] = [];
  if (h.scamPhrases.length) {
    flags.push({ category: 'scam', severity: h.scamPhrases.length > 1 ? 'high' : 'medium', source: 'heuristic', reason: h.scamPhrases.join('; ') });
  }
  if (h.fairHousingPhrases.length) {
    flags.push({ category: 'fair_housing', severity: 'medium', source: 'heuristic', reason: `Phrases: ${h.fairHousingPhrases.join(', ')}` });
  }
  if (h.offPlatform) {
    flags.push({ category: 'off_platform', severity: 'low', source: 'heuristic', reason: h.offPlatformReason || 'Contact or payment details' });
  }
  if (ai) {
    const sev: Severity = ai.confidence >= 0.85 ? 'high' : ai.confidence >= 0.6 ? 'medium' : 'low';
    if (ai.scam && !flags.some((f) => f.category === 'scam')) flags.push({ category: 'scam', severity: sev, source: 'ai', reason: ai.reason });
    if (ai.fairHousing && !flags.some((f) => f.category === 'fair_housing')) flags.push({ category: 'fair_housing', severity: sev, source: 'ai', reason: ai.reason });
    if (ai.harassment) flags.push({ category: 'harassment', severity: sev, source: 'ai', reason: ai.reason });
  }
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** A listing with an open high-severity scam flag leaves the Find feed until reviewed. */
export function shouldHideListing(flags: FlagDecision[]): boolean {
  return flags.some((f) => f.category === 'scam' && f.severity === 'high');
}

/** The warning a message recipient sees (null when the message is fine). */
export function warningFor(flags: FlagDecision[]): string | null {
  const top = flags.find((f) => f.category === 'scam' || f.category === 'off_platform');
  if (!top) return null;
  return top.category === 'scam'
    ? 'This message looks like a common rental scam. Never pay a deposit before you have seen the room and signed with the leaseholder.'
    : 'Keep payments in Fenly until the room is confirmed. Never send a deposit by app or wire to someone you have not met.';
}
