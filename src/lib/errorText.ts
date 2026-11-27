/**
 * Plain words for API errors. Routes answer with a code (`not_found`,
 * `database_error`); screens print the error's message, so the code is turned
 * into a sentence here, once, for every screen. A sentence the server sent
 * (`message`, or an `error` that already reads as one) is used as it is.
 */
const TRY_AGAIN = 'Something went wrong on our side. Try again in a moment.';
const SIGN_IN = 'Your sign-in has expired. Sign in again to continue.';

export const ERROR_TEXT: Record<string, string> = {
  not_found: "We couldn't find that. It may have been removed.",
  invalid: 'Some of that looks off. Check the details and try again.',
  feature_off: "That feature isn't available right now.",
  database_error: TRY_AGAIN,
  supabase_not_configured: "Fenn can't reach its database right now. Try again in a moment.",
  auth_unavailable: "Sign-in isn't available right now. Try again in a moment.",
  unavailable: "That isn't available right now. Try again in a moment.",
  profile_unavailable: "We couldn't load that profile. Try again in a moment.",
  wrong_status: "That can't be done at this stage of the application.",
  not_allowed: "You don't have access to that.",
  host_only: 'Only the host of this room can do that.',
  sign_in_required: 'Sign in to continue.',
  invalid_session: SIGN_IN,
  check_failed: "That change isn't allowed for this listing.",
  used: 'That invite link has already been used.',
  too_large: 'That file is too large. Try a smaller one.',
  bad_image: "We couldn't read that image. Try another photo.",
  shortlist_first: 'Shortlist this applicant before you choose them.',
  not_requested: "That hasn't been requested.",
  not_published: "This room isn't live yet.",
  not_open: 'This room is no longer taking applications.',
  not_filled: "This room hasn't been marked as filled.",
  links_failed: "We couldn't make your share links. Try again.",
  delete_failed: "We couldn't delete the listing. Try again.",
  failed: TRY_AGAIN,
  empty: 'Write something first.',
  duplicate: "You've already done that.",
  already_applied: "You've already applied to this room.",
};

const isCode = (text: string) => /^[a-z0-9_]+$/.test(text);

export function errorText(body: { error?: unknown; message?: unknown } | null | undefined, status: number): string {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (message && !isCode(message)) return message;
  const error = typeof body?.error === 'string' ? body.error.trim() : '';
  if (error && !isCode(error)) return error;
  if (error && ERROR_TEXT[error]) return ERROR_TEXT[error];
  if (status === 401) return SIGN_IN;
  if (status === 403) return ERROR_TEXT.not_allowed;
  if (status === 404) return ERROR_TEXT.not_found;
  if (status === 429) return 'Too many tries. Wait a minute, then try again.';
  return TRY_AGAIN;
}
