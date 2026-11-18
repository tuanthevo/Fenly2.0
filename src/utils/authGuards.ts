/**
 * Pure auth rules shared by the browser and the server (no Supabase imports here).
 *
 * Fenly 2.0 works signed out until it matters: anyone can browse, watch and open
 * a listing; signing in is asked for at Apply, Publish and Message, and only
 * when Supabase is configured (otherwise the app runs as the local demo).
 */

export const USER_ACTIONS = ['browse', 'watch', 'open_listing', 'apply', 'publish', 'message'] as const;
export type UserAction = (typeof USER_ACTIONS)[number];

const SIGN_IN_ACTIONS: ReadonlySet<UserAction> = new Set(['apply', 'publish', 'message']);

export function actionRequiresAccount(action: UserAction): boolean {
  return SIGN_IN_ACTIONS.has(action);
}

/** True when the app should show the sign-in sheet before doing `action`. */
export function needsSignIn(
  action: UserAction,
  state: { configured: boolean; signedIn: boolean }
): boolean {
  return state.configured && !state.signedIn && actionRequiresAccount(action);
}

const MAX_TOKEN_LENGTH = 8192;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/** "Bearer <jwt>" -> "<jwt>"; anything else (missing, other scheme, not JWT-shaped) -> null. */
export function parseBearerToken(header: string | string[] | undefined | null): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer[ ]+(\S+)[ ]*$/i.exec(header);
  if (!match) return null;
  const token = match[1];
  if (token.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(token)) return null;
  return token;
}

/**
 * Where to land after a magic link / OAuth round trip. Only same-site paths are
 * allowed ("/r/abc?x=1"); full URLs, "//host" and "/\host" fall back to "/".
 */
export function safeRedirectPath(input: string | null | undefined, fallback = '/'): string {
  if (!input || typeof input !== 'string' || input.length > 512) return fallback;
  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(input)) return fallback;
  return input;
}

/** E.164-ish normalization for US numbers typed by hand: "(415) 555-0100" -> "+14155550100". */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Turns Supabase Auth errors into short, plain messages for the sign-in sheet. */
export function friendlyAuthError(message: string | null | undefined, method: 'email' | 'google' | 'phone'): string {
  const text = (message ?? '').toLowerCase();
  if (/phone provider|sms provider|unsupported phone|phone.*(disabled|not enabled)|phone_provider_disabled/.test(text)) {
    return "Phone sign-in isn't set up yet. Use email or Google for now.";
  }
  if (/provider is not enabled|unsupported provider|validation_failed.*provider/.test(text)) {
    return method === 'google'
      ? "Google sign-in isn't set up yet. Use email for now."
      : "This sign-in option isn't set up yet.";
  }
  if (/rate limit|too many|security purposes|over_email_send_rate_limit|over_sms_send_rate_limit/.test(text)) {
    return 'Too many tries. Wait a minute and try again.';
  }
  if (/token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/.test(text)) {
    return "That code didn't work or has expired. Send a new one.";
  }
  if (/invalid.*(email|phone)|unable to validate email/.test(text)) {
    return method === 'phone' ? 'Check the phone number.' : 'Check the email address.';
  }
  if (/fetch|network|failed to fetch/.test(text)) return "Can't reach the server. Check your connection.";
  return 'Something went wrong. Try again.';
}

export function isPlausibleEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim()) && input.trim().length <= 254;
}
