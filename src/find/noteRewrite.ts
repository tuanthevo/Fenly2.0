/**
 * "Improve with AI" for the applicant's note to the host (Apply sheet). Gemini
 * only rewords: the prompt forbids new facts, and cleanRewrite() drops any answer
 * that adds a link, phone number or email the applicant didn't write, or that is
 * empty or too long. The applicant always chooses: use it, edit it, or keep theirs.
 */

/** Same limit as the note itself (server/fillRoutes.ts) */
export const NOTE_MAX_CHARS = 1000;
/** Shorter than this there is nothing to rewrite */
export const NOTE_REWRITE_MIN_CHARS = 10;

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const CONTACT_RE = /\b(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{7,}\d/gi;

/**
 * The rewrite prompt. It carries only the note: room details (rent, area) invited the model
 * to write them in, turning "This is a test" into a full inquiry about a $2,200 room.
 */
export function buildNoteRewritePrompt(note: string): string {
  return `Rewrite this short note from someone applying for a room so it reads clearly and warmly to the host.

Rules:
- Keep every fact and keep it in the first person. Do not add any fact, claim, detail, number or promise that isn't in the original note.
- If the note says little (a few words or a test message), only fix spelling and grammar; never pad it out.
- Plain, friendly words; under 600 characters.
- No emoji, no hashtags, no links, no phone numbers or emails.
- Return only the rewritten note.

Original note:
"""${note.slice(0, NOTE_MAX_CHARS)}"""`;
}

/** The contact details (links, emails, phone numbers) in a text, normalized. */
function contacts(text: string): Set<string> {
  return new Set([...text.matchAll(CONTACT_RE)].map((m) => m[0].replace(/[\s().-]/g, '').toLowerCase()));
}

/** A model answer -> the rewrite to offer, or null when it's unusable or adds contact details. */
export function cleanRewrite(raw: unknown, original: string): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(EMOJI_RE, '')
    .replace(/^\s*["“”']+|["“”']+\s*$/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.!?;:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text || text.length > NOTE_MAX_CHARS) return null;
  const mine = contacts(original);
  for (const c of contacts(text)) if (!mine.has(c)) return null;
  // Every number in the rewrite (rent, dates, counts) must already be in the note
  const myNumbers = new Set(original.match(/\d+/g) ?? []);
  if ((text.match(/\d+/g) ?? []).some((n) => !myNumbers.has(n))) return null;
  if (text === original.trim()) return null;
  return text;
}
