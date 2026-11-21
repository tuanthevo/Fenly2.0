/**
 * Listing facts as they go into a Gemini prompt: numbers stay numbers and text is
 * short, so a crafted request can't stuff megabytes (or instructions) into the
 * prompt. The model's answers are still validated separately.
 */
export type PromptListing = {
  monthlyRent: number;
  beds: number | string;
  baths: number | string;
  roomType: string;
  squareFeet: number | null;
  neighborhood: string;
  city: string;
  amenities: string[];
};

const text = (value: unknown, max: number) =>
  typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim().slice(0, max) : "";

const num = (value: unknown, lo: number, hi: number): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** "1", 1.5 or "Studio": a count, or a short word. */
const count = (value: unknown): number | string => num(value, 0, 20) ?? text(value, 12);

export function promptListing(raw: unknown): PromptListing {
  const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    monthlyRent: Math.round(num(l.monthlyRent, 0, 100_000) ?? 0),
    beds: count(l.beds),
    baths: count(l.baths),
    roomType: text(l.roomType, 30),
    squareFeet: num(l.squareFeet, 50, 10_000),
    neighborhood: text(l.neighborhood, 60),
    city: text(l.city, 60),
    amenities: (Array.isArray(l.amenities) ? l.amenities : [])
      .filter((a): a is string => typeof a === "string")
      .map((a) => text(a, 30))
      .filter(Boolean)
      .slice(0, 8),
  };
}
