/**
 * When to suggest "Add to Home Screen": right after a user's moment of success
 * (they published a room or applied to one), never when already installed, and
 * not again for 14 days after "Not now". Android/Chrome gets the browser's own
 * prompt; iPhone gets a short Share-sheet hint (iOS has no install API).
 */

export type InstallMoment = 'published' | 'applied';
export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallPromptMode = 'native' | 'ios_hint' | null;

export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
/** Fired on window with the moment as `detail` (FillFlow publish, ApplySheet success). */
export const INSTALL_MOMENT_EVENT = 'fenly:install-moment';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS reports a Mac user agent but has touch
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export type InstallState = {
  moment: InstallMoment | null;
  standalone: boolean;
  platform: InstallPlatform;
  /** a deferred `beforeinstallprompt` event is waiting */
  hasNativePrompt: boolean;
  dismissedAt: number | null;
  installed: boolean;
  now: number;
};

export function installPromptMode(s: InstallState): InstallPromptMode {
  if (!s.moment || s.standalone || s.installed) return null;
  if (s.dismissedAt != null && s.now - s.dismissedAt < INSTALL_SNOOZE_MS) return null;
  if (s.hasNativePrompt) return 'native';
  if (s.platform === 'ios') return 'ios_hint';
  return null;
}

export function installHeadline(moment: InstallMoment): string {
  return moment === 'published'
    ? 'Keep Fenn on your home screen to see applicants the moment they apply.'
    : 'Keep Fenn on your home screen to see the host’s reply right away.';
}

/** Lets other screens announce a moment without importing the prompt. */
export function announceInstallMoment(moment: InstallMoment): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(INSTALL_MOMENT_EVENT, { detail: moment }));
}
