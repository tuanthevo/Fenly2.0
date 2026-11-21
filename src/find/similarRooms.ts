/**
 * "This room is taken. 4 similar rooms nearby": within ~2 miles (by area
 * center), rent within ±20%, free within 30 days of the taken room. Same
 * neighborhood first, then the closest.
 */
import { areaCenter } from '../geo/bayArea.js';
import { roomDistanceMiles } from './findFilters.js';

export type SimilarCandidate = {
  id: string;
  city: string | null;
  neighborhood: string | null;
  rentCents: number | null;
  availableFrom: string | null;
  publishedAt?: string | null;
};

/** How far "nearby" reaches from the taken room's area */
export const SIMILAR_MAX_MILES = 2;

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;
const sameText = (a: string | null, b: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export function similarRooms<T extends SimilarCandidate>(taken: SimilarCandidate, candidates: T[], n = 4): T[] {
  const home = areaCenter(taken.city, taken.neighborhood);
  const scored = candidates
    .filter((c) => c.id !== taken.id)
    .map((c) => {
      const sameArea = sameText(c.city, taken.city) && sameText(c.neighborhood, taken.neighborhood);
      const miles = sameArea ? 0 : home ? roomDistanceMiles(c, home) : null;
      if (miles == null || miles > SIMILAR_MAX_MILES) return null;
      if (taken.rentCents != null) {
        if (c.rentCents == null) return null;
        const ratio = c.rentCents / taken.rentCents;
        if (ratio < 0.8 || ratio > 1.2) return null;
      }
      if (taken.availableFrom && c.availableFrom && days(taken.availableFrom, c.availableFrom) > 30) return null;
      return { c, sameArea: sameArea ? 0 : 1, miles };
    })
    .filter((x): x is { c: T; sameArea: number; miles: number } => x !== null);
  scored.sort((a, b) => a.sameArea - b.sameArea || a.miles - b.miles || (b.c.publishedAt ?? '').localeCompare(a.c.publishedAt ?? ''));
  return scored.slice(0, n).map((x) => x.c);
}
