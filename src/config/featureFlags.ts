/**
 * Feature flags for Fenly 2.0: "hide, don't delete".
 *
 * Features outside the core loop (Fill a room -> share link -> Find/Apply -> filled)
 * stay in the codebase but are hidden unless their flag is on. Pure and shared:
 * the server reads FENLY_FLAGS (server/flags.ts) and sends the result to the
 * browser through GET /api/config.
 */

export const FEATURE_FLAGS = [
  'home_extras', // old Home hub: Account/Renter/Landlord switcher, escrow, lease generator, admin
  'scout', // map + neighborhood explorer tab
  'ask_fenn', // AI search chat tab
  'ai_staging', // AI staging studio (image generation)
  'mascots', // Fenn / Wren mascot illustrations and the brand-kit sheet
  'house_os_extras', // House OS: utility bill splitter, Credit Boost
  'demo_listings', // 1.0 mock rooms in the Find feed after the real ones
  'photo_tour', // demo rooms in Find play their photos as a moving tour (Remotion) instead of the slideshow
  'id_check', // Passport Level 2 ID check (demo provider until a vendor is wired in server/idCheck.ts)
  'photo_listings', // Fill: hosts can take guided photos instead of filming (admins see it while the flag is off)
  'intro_video', // 15-second intro video when applying (hidden by the host, Nov 2026; hosts still see intros already sent)
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureFlags = Record<FeatureFlag, boolean>;

/** 2.0 default: everything outside the core loop is hidden. */
export const DEFAULT_FLAGS: Readonly<FeatureFlags> = Object.freeze({
  home_extras: false,
  scout: false,
  ask_fenn: false,
  ai_staging: false,
  mascots: false,
  house_os_extras: false,
  demo_listings: false,
  id_check: false,
  photo_tour: false,
  intro_video: false,
  photo_listings: false,
});

export function isFeatureFlag(value: string): value is FeatureFlag {
  return (FEATURE_FLAGS as readonly string[]).includes(value);
}

/**
 * Parses "scout, ask_fenn,-mascots" into overrides. A leading "-" turns a flag off,
 * "all" turns every flag on. Unknown names are ignored.
 */
export function parseFlagList(input: string | undefined | null): Partial<FeatureFlags> {
  const overrides: Partial<FeatureFlags> = {};
  if (!input) return overrides;
  for (const raw of input.split(/[,\s]+/)) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    const off = token.startsWith('-');
    const name = off ? token.slice(1) : token;
    if (name === 'all') {
      for (const flag of FEATURE_FLAGS) overrides[flag] = !off;
    } else if (isFeatureFlag(name)) {
      overrides[name] = !off;
    }
  }
  return overrides;
}

/** Defaults with overrides applied; only known flags with boolean values survive. */
export function resolveFlags(
  defaults: Readonly<FeatureFlags> = DEFAULT_FLAGS,
  overrides: unknown = {}
): FeatureFlags {
  const result = { ...defaults } as FeatureFlags;
  if (overrides && typeof overrides === 'object') {
    for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
      if (isFeatureFlag(key) && typeof value === 'boolean') result[key] = value;
    }
  }
  return result;
}

export function isEnabled(flags: Partial<FeatureFlags> | null | undefined, flag: FeatureFlag): boolean {
  return flags?.[flag] === true;
}

/**
 * Photo listings are an experiment: while the flag is off only admins (FENLY_ADMIN_EMAILS)
 * can make and see them, and everyone else gets exactly the video-only app.
 */
export function canUsePhotoListings(flags: Partial<FeatureFlags> | null | undefined, isAdmin: boolean): boolean {
  return isEnabled(flags, 'photo_listings') || isAdmin;
}

/** Old tabs reachable from the menu, and the flag that shows each. */
export const MENU_FEATURES = [
  { tab: 'home', flag: 'home_extras', label: 'Home hub' },
  { tab: 'explore', flag: 'scout', label: 'Scout' },
  { tab: 'ask_fenn', flag: 'ask_fenn', label: 'Ask Fenn' },
  { tab: 'house_os', flag: 'house_os_extras', label: 'House OS' },
] as const satisfies readonly { tab: string; flag: FeatureFlag; label: string }[];

export type MenuFeature = (typeof MENU_FEATURES)[number];

export function visibleMenuFeatures(flags: Partial<FeatureFlags> | null | undefined): MenuFeature[] {
  return MENU_FEATURES.filter((item) => isEnabled(flags, item.flag));
}

/** Whether a tab may be shown. Core 2.0 tabs are always allowed; old ones need their flag. */
export function isTabAllowed(tab: string, flags: Partial<FeatureFlags> | null | undefined): boolean {
  const gated = MENU_FEATURES.find((item) => item.tab === tab);
  return gated ? isEnabled(flags, gated.flag) : true;
}

/**
 * Where a request for a hidden tab lands instead: the old Home hub's landlord
 * pages live on in Fill; everything else goes back to the Find feed.
 */
export function fallbackTab<T extends string>(tab: T, flags: Partial<FeatureFlags> | null | undefined): T | 'fill' | 'listings' {
  if (isTabAllowed(tab, flags)) return tab;
  return tab === 'home' ? 'fill' : 'listings';
}
