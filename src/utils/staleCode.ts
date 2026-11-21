/**
 * After a new deploy, a page opened before it asks for code files that the
 * server no longer has, and lazy loading fails. Each browser words it
 * differently; this spots it so the app can say "reload" instead.
 */
const STALE_CODE_PATTERNS = [
  /Importing a module script failed/i, // Safari
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Unable to preload CSS/i, // Vite preload
];

export function isStaleCodeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return STALE_CODE_PATTERNS.some((p) => p.test(message));
}

export const STALE_CODE_MESSAGE = 'Fenly was just updated. Reload this page, then try again.';
