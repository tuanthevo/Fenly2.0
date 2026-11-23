/**
 * Photo listings (Fill > "Take photos"): the AI assist.
 *
 * POST /api/photos/assist reads small copies of the host's photos and returns
 * suggestions only: a tour order, two short callouts per photo, facts it can
 * see, and photos that may show a face, mail or personal details. It never
 * edits, stages or generates a picture, and nothing it returns is published
 * until the host has checked it. Every string passes sanitizePhotoAssist
 * (fair housing, length, no emoji).
 *
 * The photos themselves go browser -> Supabase Storage, never through /api.
 */
import type { Express } from "express";
import { ThinkingLevel, Type } from "@google/genai";
import { requireUser } from "./auth.js";
import { requireFlagOrAdmin } from "./flags.js";
import { ai, GEMINI_FLASH_MODEL } from "./gemini.js";
import { promptListing } from "./promptInput.js";
import { createRateLimiter, rateLimit } from "./rateLimit.js";
import { MAX_PHOTOS, PHOTO_SHOTS, isPhotoSlot } from "../src/fill/photoShots.js";
import { PHOTO_PRIVACY_FLAGS, sanitizePhotoAssist } from "../src/fill/photoAssist.js";

/** One 768 px JPEG is roughly 60-150 KB as base64; 12 of them stay far below Vercel's 4.5 MB body cap. */
const MAX_THUMB_BASE64 = 400_000;
const BASE64 = /^[A-Za-z0-9+/=]+$/;

type AssistPhoto = { id: string; slot: string; jpegBase64: string };

function readPhotos(raw: unknown): AssistPhoto[] {
  const seen = new Set<string>();
  const photos: AssistPhoto[] = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_PHOTOS) : []) {
    const p = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (typeof p.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(p.id) || seen.has(p.id)) continue;
    if (typeof p.jpegBase64 !== "string" || p.jpegBase64.length === 0 || p.jpegBase64.length > MAX_THUMB_BASE64 || !BASE64.test(p.jpegBase64)) continue;
    seen.add(p.id);
    photos.push({ id: p.id, slot: isPhotoSlot(p.slot) ? p.slot : "other", jpegBase64: p.jpegBase64 });
  }
  return photos;
}

export function registerPhotoRoutes(app: Express): void {
  app.post(
    "/api/photos/assist",
    requireUser(),
    requireFlagOrAdmin("photo_listings"),
    // A host needs one call per listing, plus a few retries after retakes
    rateLimit(createRateLimiter({ max: 12, windowMs: 10 * 60_000 }), "photo-assist"),
    async (req, res) => {
      const startTime = Date.now();
      const photos = readPhotos(req.body?.photos);
      const ids = photos.map((p) => p.id);
      const empty = () => res.json({ assist: sanitizePhotoAssist(null, ids), model_used: null, latencyMs: Date.now() - startTime });
      if (!process.env.GEMINI_API_KEY || photos.length === 0) return empty();
      const listing = promptListing(req.body?.listing);
      const shotName = (slot: string) => PHOTO_SHOTS.find((s) => s.slot === slot)?.name ?? "Extra photo";

      try {
        const parts: any[] = [
          {
            text: `These are a host's own photos of a room for rent${listing.neighborhood ? ` in ${listing.neighborhood}, ${listing.city}` : ""} (${listing.beds} bed, ${listing.baths} bath). Each photo is labeled with its id and the shot the host was asked to take.

Return JSON:
1. order: every photo id exactly once, in the order of a natural tour: the doorway view of the room first, then the rest of the room, then storage, then shared spaces (kitchen, bathroom, living room), then the building or view.
2. photos: one entry per photo with its id and:
   - tag: 2-3 words naming the main thing clearly visible ("Bright bedroom", "Built-in closet"). Max 22 characters.
   - detail: 2-3 words naming a different specific thing visible in the same photo ("South-facing window", "Hardwood floors"). Max 22 characters. Empty if nothing else clearly stands out.
   - flags: any of "face" (a person or a recognizable face, including in a mirror or a framed photo), "mail" (mail, a package label or a document with readable text), "personal" (a screen with readable content, an ID, a prescription, a family photo). Empty list if none.
3. facts: only what the photos show:
   - squareFeet: your rough estimate of the rented room's floor area in square feet, judged from furniture of known size (a bed, a door). 0 if you cannot tell.
   - furnished: true if the rented room has a bed or main furniture in it, false if it is empty.
   - notes: up to 3 short factual phrases about windows and light, closet or storage ("Two windows", "Built-in closet with shelves").
Rules: describe only what you can see; never guess. No emoji. Never describe who should or should not live there (no age, gender, family status, religion, nationality, disability, or "perfect for students / professionals / couples"). Do not describe or identify any person.`,
          },
        ];
        for (const p of photos) {
          parts.push({ text: `Photo id "${p.id}" (${shotName(p.slot)}):` });
          parts.push({ inlineData: { mimeType: "image/jpeg", data: p.jpegBase64 } });
        }
        const response = await ai.models.generateContent({
          model: GEMINI_FLASH_MODEL,
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                order: { type: Type.ARRAY, items: { type: Type.STRING } },
                photos: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      tag: { type: Type.STRING },
                      detail: { type: Type.STRING },
                      flags: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...PHOTO_PRIVACY_FLAGS] } },
                    },
                    required: ["id", "tag", "flags"],
                  },
                },
                facts: {
                  type: Type.OBJECT,
                  properties: {
                    squareFeet: { type: Type.INTEGER },
                    furnished: { type: Type.BOOLEAN },
                    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ["squareFeet", "furnished", "notes"],
                },
              },
              required: ["order", "photos", "facts"],
            },
          },
        });
        const assist = sanitizePhotoAssist(JSON.parse(response.text || "{}"), ids);
        res.json({ assist, model_used: GEMINI_FLASH_MODEL, latencyMs: Date.now() - startTime });
      } catch (error) {
        // The host can always order and caption the photos by hand
        console.error("photo assist:", error instanceof Error ? error.message : error);
        empty();
      }
    }
  );
}
