/**
 * Passport Level 2 ID check.
 *
 * DEMO PROVIDER: this asks Gemini to look at the photo of the document, like
 * the 1.0 /api/verification/verify-id route. It is not a real identity check.
 * It sits behind the `id_check` flag, records provider "demo", and fails
 * (never passes) when Gemini isn't configured. To go live, replace runIdCheck
 * with a vendor such as Stripe Identity or Persona (hosted flow + webhook) and
 * keep the same result shape.
 *
 * The image is held in memory for this one call: never stored, never logged.
 */
import { ThinkingLevel } from "@google/genai";
import { ai, GEMINI_FLASH_MODEL } from "./gemini.js";

export const ID_CHECK_PROVIDER = "demo";
export const MAX_ID_IMAGE_BYTES = 3_000_000;

export type IdCheckResult =
  | { ok: true; verified: boolean; provider: string; reason: string }
  | { ok: false; error: "unavailable" | "bad_image" | "failed" };

const ID_SCHEMA = {
  type: "object",
  properties: {
    looks_like_government_id: { type: "boolean" },
    readable: { type: "boolean" },
    expired: { type: "boolean" },
    reason: { type: "string", description: "At most 100 characters. Do not repeat any personal details from the document." },
  },
  required: ["looks_like_government_id", "readable", "expired", "reason"],
};

export function validIdImage(base64: unknown, mimeType: unknown): { data: string; mimeType: string } | null {
  if (typeof base64 !== "string" || typeof mimeType !== "string") return null;
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return null;
  if ((base64.length * 3) / 4 > MAX_ID_IMAGE_BYTES || base64.length < 1000) return null;
  return { data: base64, mimeType };
}

export async function runIdCheck(image: { data: string; mimeType: string }): Promise<IdCheckResult> {
  if (!process.env.GEMINI_API_KEY) return { ok: false, error: "unavailable" };
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: "Is this a photo of a current, readable government-issued photo ID (driver's license, state ID or passport)? Return JSON only." },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: ID_SCHEMA,
      },
    });
    const parsed = JSON.parse((response.text || "{}").trim());
    const verified = parsed.looks_like_government_id === true && parsed.readable === true && parsed.expired !== true;
    return {
      ok: true,
      verified,
      provider: ID_CHECK_PROVIDER,
      reason: verified ? "ID accepted" : parsed.expired === true ? "That ID looks expired." : "We couldn't read a government ID in that photo.",
    };
  } catch (error) {
    console.error("ID check failed:", error instanceof Error ? error.message : "error");
    return { ok: false, error: "failed" };
  }
}
