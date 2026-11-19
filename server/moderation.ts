/**
 * Scam and fair-housing checks on listings and messages. Local heuristics
 * always run; Gemini (flash-lite, structured JSON) adds a second opinion when a
 * key is set. Results become moderation_flags rows for the review queue.
 * Never throws: a failed AI call just means heuristics only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ThinkingLevel } from "@google/genai";
import { ai, GEMINI_FLASH_LITE_MODEL } from "./gemini.js";
import { evaluateLayer2OffPlatformAttempt, maskAndScanMessage } from "../src/utils/trustSafety.js";
import { fairHousingIssues } from "../src/remotion/viral/copy.js";
import { moderationFlags, scamPhrases, type AiVerdict, type FlagDecision, type HeuristicSignals } from "../src/find/moderation.js";

const MODERATION_SCHEMA = {
  type: "object",
  properties: {
    scam: { type: "boolean", description: "Signs of a rental scam: pay before viewing, wire/gift card/crypto, owner abroad, too-good-to-be-true pressure." },
    fair_housing: {
      type: "boolean",
      description: "Says who may or may not live there based on a protected trait (race, religion, sex, family status, disability, national origin, age and similar).",
    },
    harassment: { type: "boolean", description: "Threats, slurs or sexual harassment." },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", description: "At most 120 characters." },
  },
  required: ["scam", "fair_housing", "harassment", "confidence", "reason"],
};

export function heuristicSignals(text: string): HeuristicSignals {
  const masked = maskAndScanMessage(text, false);
  const layer2 = evaluateLayer2OffPlatformAttempt(text, false);
  return {
    offPlatform: masked.wasRedacted || masked.circumventionDetected || layer2.is_off_platform_attempt,
    offPlatformReason: masked.flaggedReason ?? layer2.reason,
    fairHousingPhrases: fairHousingIssues(text),
    scamPhrases: scamPhrases(text),
  };
}

async function aiVerdict(text: string, kind: "listing" | "message"): Promise<AiVerdict | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_LITE_MODEL,
      contents: `Check this ${kind === "listing" ? "room listing" : "message between a room host and an applicant"} on a room-rental app. Return JSON only.\n\n"""${text.slice(0, 4000)}"""`,
      config: {
        systemInstruction:
          "You review user content on a shared-housing app for rental scams, fair-housing violations and harassment. Be precise: ordinary questions about rent, move-in dates, house rules, pets or smoking are fine.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseJsonSchema: MODERATION_SCHEMA,
      },
    });
    const parsed = JSON.parse((response.text || "{}").trim());
    return {
      scam: parsed.scam === true,
      fairHousing: parsed.fair_housing === true,
      harassment: parsed.harassment === true,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: String(parsed.reason ?? "").slice(0, 200),
    };
  } catch (error) {
    console.error("moderation AI check failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export type TextCheck = { flags: FlagDecision[]; signals: HeuristicSignals };

export async function checkText(text: string, kind: "listing" | "message"): Promise<TextCheck> {
  const signals = heuristicSignals(text);
  const verdict = await aiVerdict(text, kind);
  return { flags: moderationFlags(signals, verdict), signals };
}

/** Saves flags for review. Never throws. */
export async function recordFlags(
  admin: SupabaseClient | null,
  targetType: "listing" | "user" | "message",
  targetId: string,
  flags: FlagDecision[]
): Promise<void> {
  if (!admin || flags.length === 0) return;
  const { error } = await admin.from("moderation_flags").insert(
    flags.map((f) => ({ target_type: targetType, target_id: targetId, source: f.source, category: f.category, severity: f.severity, reason: f.reason.slice(0, 500) }))
  );
  if (error) console.error("record flags:", error.message);
}
