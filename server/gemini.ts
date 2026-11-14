import { GoogleGenAI } from "@google/genai";

/**
 * Gemini models used by the Fenly API routes. Change a model here and every
 * route (and the `modelUsed` label it reports) follows.
 *
 * gemini-3.8-flash rules (gemini-api-dev migration checklist):
 *   - thinking: use thinkingConfig.thinkingLevel = LOW | MEDIUM (default) | HIGH.
 *     MINIMAL returns an error on 3.8 Flash, and thinkingBudget is replaced by thinkingLevel.
 *   - sampling: don't send temperature, topP or topK (deprecated in Gemini 3), or candidateCount.
 * gemini-3.1-flash-lite still accepts ThinkingLevel.MINIMAL for ultra-fast replies.
 */
export const GEMINI_FLASH_MODEL = "gemini-3.8-flash";
export const GEMINI_FLASH_LITE_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-lite-image";

let client: GoogleGenAI | null = null;

/**
 * Server-side Gemini client. Created on first use so it always sees the key,
 * whether it came from .env.local (local dev) or the Vercel project settings.
 * GEMINI_API_KEY is read only here, on the server; it is never sent to the browser.
 */
export const ai = {
  get models() {
    client ??= new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    return client.models;
  },
};
