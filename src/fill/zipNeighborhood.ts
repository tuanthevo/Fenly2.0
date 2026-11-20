/**
 * ZIP code or typed address -> one of our SF neighborhoods, for the Fill
 * details step. Only the neighborhood is kept; the ZIP or address is never
 * saved. A ZIP that spans several neighborhoods maps to its main one, and the
 * host can still change the pick.
 */
import { SF_NEIGHBORHOODS } from './neighborhoods';

/** SF ZIPs whose main area is one of SF_NEIGHBORHOODS. */
export const SF_ZIP_NEIGHBORHOOD: Record<string, string> = {
  '94102': 'Hayes Valley',
  '94103': 'SoMa',
  '94105': 'SoMa',
  '94107': 'Potrero Hill',
  '94108': 'Nob Hill',
  '94109': 'Nob Hill',
  '94110': 'Mission',
  '94112': 'Excelsior',
  '94114': 'Castro',
  '94115': 'Western Addition',
  '94116': 'Outer Sunset',
  '94117': 'Haight-Ashbury',
  '94118': 'Inner Richmond',
  '94121': 'Outer Richmond',
  '94122': 'Inner Sunset',
  '94123': 'Marina',
  '94131': 'Glen Park',
  '94133': 'North Beach',
};

/** Other San Francisco ZIPs: in the city, but not one of the areas we list yet. */
const OTHER_SF_ZIPS = new Set(['94104', '94111', '94124', '94127', '94129', '94130', '94132', '94134', '94158']);

export type AreaLookup =
  | { kind: 'found'; neighborhood: string; zip: string }
  | { kind: 'sf_unlisted'; zip: string }
  | { kind: 'outside_sf'; zip: string }
  | { kind: 'no_zip' };

/** The last 5-digit ZIP in the text ("94110", "123 Valencia St, SF, CA 94110-1234"). */
export function zipIn(text: string): string | null {
  const all = [...text.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  return all.length ? all[all.length - 1][1] : null;
}

export function neighborhoodFromZip(text: string): AreaLookup {
  const zip = zipIn(text);
  if (!zip) return { kind: 'no_zip' };
  const neighborhood = SF_ZIP_NEIGHBORHOOD[zip];
  if (neighborhood) return { kind: 'found', neighborhood, zip };
  return OTHER_SF_ZIPS.has(zip) ? { kind: 'sf_unlisted', zip } : { kind: 'outside_sf', zip };
}

/** Every mapped name must be one we offer in the picker. */
export const zipTableIsValid = () =>
  Object.values(SF_ZIP_NEIGHBORHOOD).every((n) => SF_NEIGHBORHOODS.some((s) => s.name === n));
