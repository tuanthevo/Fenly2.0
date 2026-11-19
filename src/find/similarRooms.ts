/**
 * "This room is taken. 4 similar rooms nearby": same or next-door
 * neighborhood, rent within ±20%, free within 30 days of the taken room.
 */
import { NEARBY_AREAS, launchAreaOf } from './findFilters';

export type SimilarCandidate = {
  id: string;
  neighborhood: string | null;
  rentCents: number | null;
  availableFrom: string | null;
  publishedAt?: string | null;
};

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

export function similarRooms<T extends SimilarCandidate>(taken: SimilarCandidate, candidates: T[], n = 4): T[] {
  const home = launchAreaOf(taken.neighborhood) ?? taken.neighborhood ?? '';
  const nearby = new Set([home, ...(NEARBY_AREAS[home] ?? [])].map((s) => s.toLowerCase()));
  const scored = candidates
    .filter((c) => c.id !== taken.id)
    .map((c) => {
      const area = (launchAreaOf(c.neighborhood) ?? c.neighborhood ?? '').toLowerCase();
      if (!nearby.has(area)) return null;
      if (taken.rentCents != null) {
        if (c.rentCents == null) return null;
        const ratio = c.rentCents / taken.rentCents;
        if (ratio < 0.8 || ratio > 1.2) return null;
      }
      if (taken.availableFrom && c.availableFrom && days(taken.availableFrom, c.availableFrom) > 30) return null;
      const sameArea = area === home.toLowerCase() ? 0 : 1;
      const rentGap = taken.rentCents != null && c.rentCents != null ? Math.abs(c.rentCents - taken.rentCents) : 0;
      return { c, sameArea, rentGap };
    })
    .filter((x): x is { c: T; sameArea: number; rentGap: number } => x !== null);
  scored.sort((a, b) => a.sameArea - b.sameArea || a.rentGap - b.rentGap || (b.c.publishedAt ?? '').localeCompare(a.c.publishedAt ?? ''));
  return scored.slice(0, n).map((x) => x.c);
}
