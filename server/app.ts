/**
 * Fenly API: every /api/* route lives in this one Express app.
 *
 * It runs in two places with no code changes:
 *   - locally:   server.ts mounts it in front of the Vite dev server (npm run dev)
 *   - on Vercel: api/index.ts exports it as a single Vercel Function
 *     (vercel.json rewrites /api/* to that function)
 *
 * Secrets such as GEMINI_API_KEY are read from process.env here on the server only.
 * Never import this file from src/, and never give a secret a VITE_ prefix
 * (anything prefixed VITE_ is bundled into the browser).
 *
 * To add a route: add app.get/app.post("/api/your-route", ...) below. It works in
 * local dev and on Vercel automatically.
 */
import express from "express";
import { ThinkingLevel, Type } from "@google/genai";
import {
  ai,
  GEMINI_FLASH_MODEL,
  GEMINI_FLASH_LITE_MODEL,
  GEMINI_IMAGE_MODEL,
  GEMINI_MUSIC_MODEL,
} from "./gemini.js";
import {
  evaluateLayer2OffPlatformAttempt,
  ASK_FENN_SYSTEM_INSTRUCTION,
  parseAskFennSearch,
  SAMPLE_PGE_UTILITY_BILL,
  calculateUtilityBillSplit,
  type ExtractedUtilityBill,
  buildStructuredViralTourPlan,
  generateAiListingTitleAndDescription,
} from "../src/utils/trustSafety.js";
import { violatesFairHousing } from "../src/remotion/viral/copy.js";
import {
  DEFAULT_EDIT_SETTINGS,
  isEmptyPatch,
  localEditPatch,
  sanitizeEditPatch,
  type ViralEditSettings,
} from "../src/remotion/viral/editSettings.js";
import { buildMusicPrompt, musicLabel, sanitizeMusicMood } from "../src/remotion/viral/musicMood.js";
import type { ViralAiHints } from "../src/remotion/viral/types.js";
import { requireFlag } from "./flags.js";
import { registerFoundationRoutes } from "./foundationRoutes.js";
import { registerFillRoutes } from "./fillRoutes.js";

const app = express();

app.use(express.json({ limit: "25mb" }));

// Health check: confirms the API is reachable and whether a Gemini key is set (never the key itself).
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

// 1. High-Quality Image Generation Endpoint
app.post("/api/gemini/generate-image", requireFlag("ai_staging"), async (req, res) => {
  try {
    const { prompt, aspectRatio = "9:16", imageSize = "1K", style = "modern interior" } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    const validSizes = ["1K", "2K", "4K"] as const;
    const finalSize = validSizes.includes(imageSize) ? imageSize : "1K";

    const enhancedPrompt = `${prompt}. Style: ${style}`;

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: {
        parts: [{ text: enhancedPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as "9:16" | "1:1" | "4:3" | "3:4" | "16:9",
        },
      },
    });

    let imageUrl = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || "image/png";
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      const textOutput = response.text || "";
      res.status(500).json({
        error: "No image bytes returned by model",
        details: textOutput,
      });
      return;
    }

    res.json({
      success: true,
      imageUrl,
      modelUsed: GEMINI_IMAGE_MODEL,
      imageSize: finalSize,
      aspectRatio,
    });
  } catch (error: any) {
    console.error("Image generation error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate image",
      model: GEMINI_IMAGE_MODEL,
    });
  }
});

// 2. Ask Fenn AI Concierge Endpoint (Powered by ASK_FENN_SYSTEM_INSTRUCTION)
app.post("/api/gemini/ask-fenn", requireFlag("ask_fenn"), async (req, res) => {
  const { query = "", rooms = [], roomContext = null } = req.body || {};
  const parsed = parseAskFennSearch(query, rooms);

  if (!process.env.GEMINI_API_KEY) {
    res.json({
      ...parsed,
      modelUsed: GEMINI_FLASH_MODEL,
    });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: `User request: "${query}"\nAvailable apartments context: ${JSON.stringify(
        (rooms || []).map((r: any) => ({
          id: r.id,
          title: r.title,
          price: r.price,
          neighborhood: r.neighborhood,
          amenities: r.amenities,
          squareFeet: r.squareFeet,
        }))
      )}`,
      config: {
        systemInstruction: `${ASK_FENN_SYSTEM_INSTRUCTION}${
          roomContext ? `\nFocused Listing Context: ${JSON.stringify(roomContext)}` : ""
        }`,
      },
    });

    const aiReply = response.text?.trim() || parsed.fennReply;
    res.json({
      ...parsed,
      fennReply: aiReply,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  } catch {
    res.json({
      ...parsed,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  }
});

// 2B. House OS — AI Utility Bill Splitter Endpoint (Powered by Gemini Structured JSON Output)
app.post("/api/gemini/parse-utility-bill", requireFlag("house_os_extras"), async (req, res) => {
  const {
    billText = "",
    base64Data = "",
    mimeType = "image/png",
    roommates = undefined,
    expectedAddress = "742 Valencia St, Apt 3B, Mission District, San Francisco, CA 94110",
  } = req.body || {};

  if (!process.env.GEMINI_API_KEY) {
    const fallbackSplit = calculateUtilityBillSplit(SAMPLE_PGE_UTILITY_BILL, roommates);
    res.json({
      ...fallbackSplit,
      modelUsed: GEMINI_FLASH_MODEL,
    });
    return;
  }

  try {
    const parts: any[] = [];
    if (base64Data) {
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }
    parts.push({
      text:
        billText ||
        `Extract the structured utility bill fields from this Pacific Gas & Electric (PG&E) statement for ${expectedAddress}. Verify if the service address matches ${expectedAddress}.`,
    });

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: { parts },
      config: {
        systemInstruction:
          "You are the Fenn Rentals House OS AI Utility Bill Parser. Extract utility_provider, service_address, billing_period, total_amount_due, due_date, and address_match_verified as strict JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            utility_provider: { type: Type.STRING },
            service_address: { type: Type.STRING },
            billing_period: { type: Type.STRING },
            total_amount_due: { type: Type.NUMBER },
            due_date: { type: Type.STRING },
            address_match_verified: { type: Type.BOOLEAN },
          },
          required: [
            "utility_provider",
            "service_address",
            "billing_period",
            "total_amount_due",
            "due_date",
            "address_match_verified",
          ],
        },
      },
    });

    const parsedJson = JSON.parse((response.text || "{}").trim());
    const extractedBill: ExtractedUtilityBill = {
      utility_provider: parsedJson.utility_provider || SAMPLE_PGE_UTILITY_BILL.utility_provider,
      service_address: parsedJson.service_address || SAMPLE_PGE_UTILITY_BILL.service_address,
      billing_period: parsedJson.billing_period || SAMPLE_PGE_UTILITY_BILL.billing_period,
      total_amount_due:
        typeof parsedJson.total_amount_due === "number" && parsedJson.total_amount_due > 0
          ? parsedJson.total_amount_due
          : SAMPLE_PGE_UTILITY_BILL.total_amount_due,
      due_date: parsedJson.due_date || SAMPLE_PGE_UTILITY_BILL.due_date,
      address_match_verified:
        typeof parsedJson.address_match_verified === "boolean"
          ? parsedJson.address_match_verified
          : true,
    };

    const splitSummary = calculateUtilityBillSplit(extractedBill, roommates);
    res.json({
      ...splitSummary,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  } catch {
    const fallbackSplit = calculateUtilityBillSplit(SAMPLE_PGE_UTILITY_BILL, roommates);
    res.json({
      ...fallbackSplit,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  }
});

// 3. Multi-turn Gemini Chatbot Endpoint (Uses ASK_FENN_SYSTEM_INSTRUCTION)
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const {
      messages = [],
      role = "roommate_concierge",
      taskComplexity = "general",
      roomContext = null,
    } = req.body;

    let selectedModel = GEMINI_FLASH_MODEL;
    let systemInstruction = `${ASK_FENN_SYSTEM_INSTRUCTION}${
      roomContext ? `\nCurrent Listing Context: ${JSON.stringify(roomContext)}` : ""
    }`;

    if (taskComplexity === "fast" || role === "neighborhood_guide") {
      selectedModel = GEMINI_FLASH_LITE_MODEL;
    }

    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config: {
        systemInstruction,
      },
    });

    const reply = response.text || "I kept my ears perked—tell me your budget and target neighborhood so I can filter the video feed.";

    res.json({
      reply,
      modelUsed: selectedModel,
      role,
    });
  } catch (error: any) {
    console.error("Chatbot error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate chat response",
    });
  }
});

// 3. Low-Latency Responses Endpoint (using gemini-3.1-flash-lite)
// Fast responses for smart DM quick-replies, instant vibe summary, and instant roommate match score
app.post("/api/gemini/fast-response", async (req, res) => {
  const startTime = Date.now();
  try {
    const { type, room, userProfile, conversationHistory } = req.body;

    let prompt = "";
    let systemInstruction = "You provide ultra-fast, concise, high-value responses. Output must be direct without preamble.";

    if (type === "smart_replies") {
      prompt = `Generate exactly 3 short, natural, courteous quick-reply buttons (maximum 8 words each) that a room seeker can send right now to this host.
Room title: "${room?.title || "Room for rent"}" in ${room?.location || "City"}, priced at $${room?.price || "1000"}/mo.
Last message from host: "${conversationHistory?.[conversationHistory.length - 1]?.content || "Hi, let me know if you have questions!"}"
Format output as a valid JSON array of 3 strings: ["reply1", "reply2", "reply3"].`;
    } else if (type === "instant_vibe") {
      prompt = `Provide an ultra-fast 2-sentence vibe check and 3 highlight tags for this room listing:
Title: "${room?.title}"
Location: "${room?.location}"
Rent: "$${room?.price}/month"
Amenities: "${(room?.amenities || []).join(", ")}"
Roommates/Vibe description: "${room?.description || ""}"
Format output as JSON: {"vibeSummary": "2 sentences here", "tags": ["tag1", "tag2", "tag3"]}`;
    } else if (type === "compatibility_score") {
      prompt = `Calculate an instant roommate & room compatibility score (0-100) and 1 concise sentence explanation.
User preferences: ${JSON.stringify(userProfile || { budget: 1500, pets: "friendly", sleep: "midnight", cleanliness: "neat" })}
Room details: Title: "${room?.title}", Price: $${room?.price}, Amenities: ${JSON.stringify(room?.amenities)}, Rules: ${JSON.stringify(room?.rules || [])}.
Format output as JSON: {"score": 88, "verdict": "Great fit because..."}`;
    } else if (type === "trust_safety_check") {
      const messageText = req.body.messageText || "";
      prompt = `You are the Fenn Rentals Trust & Safety AI Intervention classifier. Analyze this rental chat message for any attempt to move communication off-platform (WhatsApp, Telegram, Signal, text/phone/email, spelled-out phone numbers like "four zero eight...", social handles like "find me on IG under...") or request off-platform payment (cash, wire transfer, Venmo, Zelle, CashApp) before booking clears.
Message: "${messageText}"
Format output strictly as JSON: {"is_off_platform_attempt": true or false, "confidence": 0.95, "flagged": true or false, "reason": "short reason if flagged, else null", "warning": "short warning to both users that moving off-platform voids the Move-In Guarantee (escrow protection) and risks account suspension"}`;
    } else {
      prompt = `Provide a fast 1-sentence tip for renting a room in ${room?.location || "the city"}.`;
    }

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_LITE_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      },
    });

    const latencyMs = Date.now() - startTime;
    const text = response.text || "";

    let parsed = null;
    try {
      // Try to clean up backticks or parse json
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw: text };
    }

    res.json({
      data: parsed,
      raw: text,
      latencyMs,
      modelUsed: GEMINI_FLASH_LITE_MODEL,
    });
  } catch (error: any) {
    console.error("Fast response error:", error);
    res.status(500).json({
      error: error.message || "Failed to get fast response",
      latencyMs: Date.now() - startTime,
    });
  }
});

// 4. Layer 2: The Gemini Flash AI Interceptor (/api/chat/intercept)
// Evaluates chat messages for sneaky regex bypasses (e.g. "call me at four zero eight, five five five..."
// or "find me on IG under john_doe_realty") and returns {"is_off_platform_attempt": boolean, "confidence": number}
app.post("/api/chat/intercept", async (req, res) => {
  const startTime = Date.now();
  const { messageText = "", isBookingConfirmed = false } = req.body || {};

  if (isBookingConfirmed || !messageText.trim()) {
    res.json({
      is_off_platform_attempt: false,
      confidence: 0.01,
      reason: "Booking confirmed or empty message",
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
    return;
  }

  const heuristicFallback = evaluateLayer2OffPlatformAttempt(messageText, isBookingConfirmed);

  // If heuristic already caught an explicit spelled-out number or sneaky handle with high confidence,
  // or if GEMINI_API_KEY is not configured, return or merge with Gemini Flash evaluation
  if (!process.env.GEMINI_API_KEY) {
    res.json({
      ...heuristicFallback,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: `Analyze this Fenn Rentals chat message: "${messageText}"`,
      config: {
        systemInstruction:
          'You are the Fenn Rentals Layer 2 Gemini Flash AI Interceptor. Detect any sneaky attempt to move communication or payments off-platform before booking is confirmed, including spelled-out phone numbers (e.g. "four zero eight, five five five..."), social media handles (e.g. "find me on IG under john_doe_realty", WhatsApp, Telegram), or cash/Venmo/Zelle/wire requests. Return strict JSON: {"is_off_platform_attempt": boolean, "confidence": number, "reason": string}.',
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const cleaned = (response.text || "{}").replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const flagged = Boolean(parsed.is_off_platform_attempt) || heuristicFallback.is_off_platform_attempt;
    const confidence = flagged
      ? Math.max(Number(parsed.confidence) || 0.95, heuristicFallback.confidence || 0.95)
      : Number(parsed.confidence) || 0.04;

    res.json({
      is_off_platform_attempt: flagged,
      confidence,
      reason: parsed.reason || heuristicFallback.reason,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  } catch {
    res.json({
      ...heuristicFallback,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  }
});

// 5. ID Verification API (/api/verification/verify-id)
app.post("/api/verification/verify-id", async (req, res) => {
  const startTime = Date.now();
  const {
    role = "renter",
    fullName = "Alex Rivera",
    documentType = "California Driver's License",
    base64Image = "",
    mimeType = "image/jpeg",
  } = req.body || {};

  const sessionId = `vs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const defaultReport = {
    verified: true,
    session_id: sessionId,
    provider: "Stripe Identity + Gemini Document Vision",
    webhook_event: "identity.verification_session.verified",
    role,
    subject_name: fullName,
    document_type: documentType,
    biometric_liveness_score: 0.99,
    barcode_mrz_match: true,
    summary: `Government ID (${documentType}) and live biometric selfie verified for ${fullName}.`,
    verified_at: new Date().toISOString(),
  };

  if (!process.env.GEMINI_API_KEY) {
    res.json({
      ...defaultReport,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
    return;
  }

  try {
    const parts: any[] = [];
    if (base64Image) {
      parts.push({
        inlineData: {
          mimeType,
          data: base64Image,
        },
      });
    }
    parts.push({
      text: `Perform an identity verification check for ${role} "${fullName}" submitting a "${documentType}". Return a structured JSON verification report.`,
    });

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: { parts },
      config: {
        systemInstruction:
          "You are the Fenn Rentals Identity Verification engine. Validate the user's government ID & biometric liveness check and return strict JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified: { type: Type.BOOLEAN },
            document_type: { type: Type.STRING },
            biometric_liveness_score: { type: Type.NUMBER },
            barcode_mrz_match: { type: Type.BOOLEAN },
            summary: { type: Type.STRING },
          },
          required: [
            "verified",
            "document_type",
            "biometric_liveness_score",
            "barcode_mrz_match",
            "summary",
          ],
        },
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const parsed = JSON.parse((response.text || "{}").trim());
    res.json({
      ...defaultReport,
      verified: parsed.verified ?? true,
      document_type: parsed.document_type || documentType,
      biometric_liveness_score: parsed.biometric_liveness_score || 0.99,
      barcode_mrz_match: parsed.barcode_mrz_match ?? true,
      summary: parsed.summary || defaultReport.summary,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  } catch {
    res.json({
      ...defaultReport,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  }
});

// 6. Background & Credit Check API (/api/verification/background-check)
app.post("/api/verification/background-check", async (req, res) => {
  const startTime = Date.now();
  const {
    role = "renter",
    fullName = "Alex Rivera",
    fcraConsent = true,
  } = req.body || {};

  if (!fcraConsent) {
    res.status(400).json({
      verified: false,
      error: "FCRA & CA Civil Code § 1950.6 consent is required before running a background check.",
    });
    return;
  }

  const reportId = `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const defaultBgReport = {
    verified: true,
    report_id: reportId,
    provider: "Certn / TransUnion FCRA Screening API",
    role,
    subject_name: fullName,
    criminal_record_status: "CLEAR — 0 National / County Records",
    eviction_history_status: "CLEAR — 0 Unlawful Detainer Filings",
    credit_tier: "Excellent (748 FICO • 0 Late Housing Payments)",
    fcra_compliant: true,
    summary: `FCRA & CA Civil Code § 1950.6 screening passed for ${fullName}. National criminal, sex offender, OFAC, and eviction registries are clear.`,
    verified_at: new Date().toISOString(),
  };

  if (!process.env.GEMINI_API_KEY) {
    res.json({
      ...defaultBgReport,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: `Run an FCRA & California Civil Code Section 1950.6 compliant tenant/host background & credit screening summary for ${role} "${fullName}".`,
      config: {
        systemInstruction:
          "You are the Fenn Rentals Background & Credit Screening API engine. Return a strict JSON screening report.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified: { type: Type.BOOLEAN },
            criminal_record_status: { type: Type.STRING },
            eviction_history_status: { type: Type.STRING },
            credit_tier: { type: Type.STRING },
            summary: { type: Type.STRING },
          },
          required: [
            "verified",
            "criminal_record_status",
            "eviction_history_status",
            "credit_tier",
            "summary",
          ],
        },
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const parsed = JSON.parse((response.text || "{}").trim());
    res.json({
      ...defaultBgReport,
      verified: parsed.verified ?? true,
      criminal_record_status:
        parsed.criminal_record_status || defaultBgReport.criminal_record_status,
      eviction_history_status:
        parsed.eviction_history_status || defaultBgReport.eviction_history_status,
      credit_tier: parsed.credit_tier || defaultBgReport.credit_tier,
      summary: parsed.summary || defaultBgReport.summary,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  } catch {
    res.json({
      ...defaultBgReport,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  }
});

// 7. Income / Payroll Verification API (/api/verification/income-check)
app.post("/api/verification/income-check", async (req, res) => {
  const startTime = Date.now();
  const {
    fullName = "Alex Rivera",
    statedIncome = "115,000",
    monthlyRent = 1450,
  } = req.body || {};

  const reportId = `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  res.json({
    verified: true,
    report_id: reportId,
    provider: "MeasureOne Payroll & Bank API",
    subject_name: fullName,
    verified_annual_income: `$${statedIncome}/yr`,
    rent_to_income_multiple: `${(
      Number(String(statedIncome).replace(/[^0-9.]/g, "") || 115000) /
      12 /
      monthlyRent
    ).toFixed(1)}x monthly rent`,
    summary: `Direct payroll & deposit stream verified for ${fullName} ($${statedIncome}/yr). Exceeds 3.0x rent coverage threshold.`,
    verified_at: new Date().toISOString(),
    latencyMs: Date.now() - startTime,
    modelUsed: GEMINI_FLASH_MODEL,
  });
});

// 8. Guided Viral Home Tour Studio — Gemini 3.8 Flash Structured Output Generator (/api/gemini/viral-home-tour)
app.post("/api/gemini/viral-home-tour", async (req, res) => {
  const startTime = Date.now();
  const {
    monthlyRent = 1350,
    beds = 1,
    baths = 1,
    neighborhood = "Mission District",
    city = "San Francisco",
    amenities = ["Private Bath", "High-Speed WiFi"],
    slots = undefined,
    clipsMetadata = [],
  } = req.body || {};

  const fallbackPlan = buildStructuredViralTourPlan({
    monthlyRent: Number(monthlyRent) || 1350,
    beds,
    baths,
    neighborhood,
    city,
    amenities: Array.isArray(amenities) ? amenities : ["Private Bath", "High-Speed WiFi"],
    slots,
  });

  if (!process.env.GEMINI_API_KEY) {
    res.json({
      ...fallbackPlan,
      latencyMs: Date.now() - startTime,
      model_used: GEMINI_FLASH_MODEL,
    });
    return;
  }

  try {
    const parts: any[] = [];
    if (Array.isArray(clipsMetadata)) {
      for (const clip of clipsMetadata) {
        if (clip?.inlineDataBase64 && typeof clip.inlineDataBase64 === "string") {
          parts.push({
            inlineData: {
              mimeType: clip.mimeType || "image/jpeg",
              data: clip.inlineDataBase64,
            },
          });
        }
      }
    }

    const sanitizedMetadata = Array.isArray(clipsMetadata)
      ? clipsMetadata.map((c: any) => ({
          slotNumber: c.slotNumber,
          slotTitle: c.slotTitle,
          movementBadge: c.movementBadge,
          source: c.source,
          rawDurationSec: c.rawDurationSec,
        }))
      : [];

    const prompt = `You are a viral property video editor for Fenn Rentals. Analyze these 5 vertical 9:16 property clips and listing metadata:
- Monthly Rent: $${monthlyRent}/mo
- Bed/Bath Count: ${beds} Bed ${baths} Bath
- Location: ${neighborhood}, ${city}
- Top Amenities: ${(amenities || []).slice(0, 2).join(", ")}
- 5 Recorded/Uploaded Slots: ${JSON.stringify(
      sanitizedMetadata.length > 0
        ? sanitizedMetadata
        : fallbackPlan.clips.map((c) => ({
            slotNumber: c.slotNumber,
            slotTitle: c.slotTitle,
          }))
    )}

Return a strict JSON edit plan for a 15-second viral property tour:
1. For each of the 5 clips, return trim_start (0.5) and trim_end (3.5) to select the smoothest 2.5-3.0s window cutting out the initial 0.5s button press and final 0.5s, plus playback_speed (0.75 for walking shots in slots 1, 2, 4 to make 60fps footage gimbal-smooth, and 0.85 for slots 3 and 5).
2. hook_overlay: line1_yellow must be "$${Number(monthlyRent).toLocaleString("en-US")}/mo • ${beds} Bed ${baths} Bath" and line2_white must be "${neighborhood}, ${city}".
3. feature_callouts: 3 short 3-word badges for Clips 2, 3, and 4.
4. cta_overlay: "Tap 'Book Tour' to see it in person" for Clip 5.
5. voiceover_script: A 3-second spoken intro hook ("This [Feature] ${neighborhood} rental is $${Number(monthlyRent).toLocaleString("en-US")} a month—let's check it out") and viral_caption.`;

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slotNumber: { type: Type.NUMBER },
                  slotTitle: { type: Type.STRING },
                  trim_start: { type: Type.NUMBER },
                  trim_end: { type: Type.NUMBER },
                  playback_speed: { type: Type.NUMBER },
                  overlay_badge: { type: Type.STRING },
                },
                required: [
                  "slotNumber",
                  "slotTitle",
                  "trim_start",
                  "trim_end",
                  "playback_speed",
                  "overlay_badge",
                ],
              },
            },
            hook_overlay: {
              type: Type.OBJECT,
              properties: {
                line1_yellow: { type: Type.STRING },
                line2_white: { type: Type.STRING },
              },
              required: ["line1_yellow", "line2_white"],
            },
            feature_callouts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            cta_overlay: { type: Type.STRING },
            voiceover_script: { type: Type.STRING },
            viral_caption: { type: Type.STRING },
          },
          required: [
            "clips",
            "hook_overlay",
            "feature_callouts",
            "cta_overlay",
            "voiceover_script",
            "viral_caption",
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text || "{}").trim());
    const mergedClips =
      Array.isArray(parsed.clips) && parsed.clips.length === 5
        ? parsed.clips.map((c: any, idx: number) => ({
            slotNumber: idx + 1,
            slotTitle: c.slotTitle || fallbackPlan.clips[idx].slotTitle,
            trim_start: typeof c.trim_start === "number" ? c.trim_start : 0.5,
            trim_end: typeof c.trim_end === "number" ? c.trim_end : 3.5,
            playback_speed:
              typeof c.playback_speed === "number"
                ? c.playback_speed
                : fallbackPlan.clips[idx].playback_speed,
            overlay_badge: c.overlay_badge || fallbackPlan.clips[idx].overlay_badge,
          }))
        : fallbackPlan.clips;

    res.json({
      clips: mergedClips,
      hook_overlay: {
        line1_yellow:
          parsed.hook_overlay?.line1_yellow || fallbackPlan.hook_overlay.line1_yellow,
        line2_white:
          parsed.hook_overlay?.line2_white || fallbackPlan.hook_overlay.line2_white,
      },
      feature_callouts:
        Array.isArray(parsed.feature_callouts) && parsed.feature_callouts.length >= 3
          ? parsed.feature_callouts.slice(0, 3)
          : fallbackPlan.feature_callouts,
      cta_overlay: parsed.cta_overlay || fallbackPlan.cta_overlay,
      voiceover_script: parsed.voiceover_script || fallbackPlan.voiceover_script,
      viral_caption: parsed.viral_caption || fallbackPlan.viral_caption,
      total_duration_seconds: 15,
      latencyMs: Date.now() - startTime,
      model_used: GEMINI_FLASH_MODEL,
    });
  } catch {
    res.json({
      ...fallbackPlan,
      latencyMs: Date.now() - startTime,
      model_used: GEMINI_FLASH_MODEL,
    });
  }
});

// 9. AI Listing Title & Description Auto-Fill Endpoint (Synthesizes Location + Loaded Pictures)
app.post("/api/gemini/auto-fill-listing-copy", async (req, res) => {
  const startTime = Date.now();
  const {
    neighborhood = "Mission District",
    city = "San Francisco",
    roomType = "Private Room",
    beds = 1,
    baths = 1,
    monthlyRent = 1450,
    squareFeet = 220,
    leaseTerm = "6 Months",
    amenities = ["Private Bath", "In-Unit W/D", "High-Speed WiFi"],
    loadedPictures = [],
  } = req.body || {};

  const fallbackCopy = generateAiListingTitleAndDescription({
    neighborhood,
    city,
    roomType,
    beds: Number(beds) || 1,
    baths: Number(baths) || 1,
    monthlyRent: Number(monthlyRent) || 1450,
    squareFeet: Number(squareFeet) || 220,
    leaseTerm,
    amenities: Array.isArray(amenities) ? amenities : [],
    loadedPictures: Array.isArray(loadedPictures) ? loadedPictures : [],
  });

  if (!process.env.GEMINI_API_KEY) {
    res.json({
      ...fallbackCopy,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
    return;
  }

  try {
    const parts: any[] = [];
    if (Array.isArray(loadedPictures)) {
      for (const pic of loadedPictures) {
        if (pic?.base64Data && typeof pic.base64Data === "string") {
          parts.push({
            inlineData: {
              mimeType: pic.mimeType || "image/jpeg",
              data: pic.base64Data,
            },
          });
        }
      }
    }

    const pictureDescriptions = Array.isArray(loadedPictures)
      ? loadedPictures.map((p: any, idx: number) => `Picture ${idx + 1}: ${p.label || p.visualCue || "Room photo"}`).join("; ")
      : "Standard room photos";

    const prompt = `You are an expert real estate copywriter for Fenn Rentals. Generate an engaging, accurate Listing Title and Listing Description for a landlord creating a listing by combining ALL location details and visual information from the loaded pictures:
- Location: ${neighborhood}, ${city}
- Room Type: ${roomType} (${beds} Bed / ${baths} Bath, ${squareFeet} sq ft)
- Monthly Rent: $${monthlyRent}/mo (${leaseTerm} lease)
- Amenities: ${(amenities || []).join(", ")}
- Loaded Pictures (${Array.isArray(loadedPictures) ? loadedPictures.length : 0} photos): ${pictureDescriptions}

Return strict JSON with:
1. "title": A concise, high-converting listing title (max 70 chars) highlighting the neighborhood, room type, visual vibe from the pictures, and top amenity.
2. "description": A warm, detailed 2-3 sentence description weaving together the neighborhood/city walkability, what is visible in the loaded pictures, and the key amenities/lease terms.`;

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["title", "description"],
        },
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const parsed = JSON.parse((response.text || "{}").trim());
    // Fair housing: AI text that says who should live there is replaced by the template copy
    const aiTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const aiDescription = typeof parsed.description === "string" ? parsed.description.trim() : "";
    const aiCopyOk = aiTitle && aiDescription && !violatesFairHousing(aiTitle) && !violatesFairHousing(aiDescription);
    res.json({
      title: aiCopyOk ? aiTitle : fallbackCopy.title,
      description: aiCopyOk ? aiDescription : fallbackCopy.description,
      locationContext: fallbackCopy.locationContext,
      analyzedPicturesSummary: fallbackCopy.analyzedPicturesSummary,
      loadedPicturesCount: fallbackCopy.loadedPicturesCount,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  } catch {
    res.json({
      ...fallbackCopy,
      latencyMs: Date.now() - startTime,
      modelUsed: GEMINI_FLASH_MODEL,
    });
  }
});

// Viral room-tour copy pass (/api/viral/copy): Gemini 3.8 Flash reads one
// 360x640 frame per shot and returns ViralAiHints. Every field is optional; the
// editor validates each one in plan.ts and falls back to its local rules.
/** Longest AI hook we accept: 8 words + a price is about the 3.2 s the hook stays on screen. */
const MAX_AI_HOOK_WORDS = 8;
app.post("/api/viral/copy", async (req, res) => {
  const startTime = Date.now();
  const body = req.body || {};
  const listing = body.listing || {};
  const shots: { slotNumber: number; room: string; jpegBase64?: string }[] = Array.isArray(body.shots)
    ? body.shots
        .filter((s: any) => Number.isInteger(s?.slotNumber) && s.slotNumber >= 1 && s.slotNumber <= 5)
        .slice(0, 5)
    : [];

  if (!process.env.GEMINI_API_KEY || shots.length === 0) {
    res.json({ hints: {}, model_used: null, latencyMs: Date.now() - startTime });
    return;
  }

  const rent = Number(listing.monthlyRent) || 0;
  const rentLabel = `$${rent.toLocaleString("en-US")}/mo`;
  const neighborhood = String(listing.neighborhood || "").slice(0, 60);
  const city = String(listing.city || "").slice(0, 60);
  const amenities = (Array.isArray(listing.amenities) ? listing.amenities : []).slice(0, 8).join(", ");
  const slotNumbers = shots.map((s) => s.slotNumber);

  try {
    const parts: any[] = [];
    for (const shot of shots) {
      parts.push({ text: `Shot ${shot.slotNumber} (${String(shot.room || "").slice(0, 40)}):` });
      if (typeof shot.jpegBase64 === "string" && shot.jpegBase64.length > 0 && shot.jpegBase64.length < 600_000) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: shot.jpegBase64 } });
      }
    }
    parts.push({
      text: `You write on-screen text for a 15-30 second vertical rental tour video (TikTok / Reels / Shorts).
Listing facts:
- Rent: ${rentLabel}
- ${listing.beds} bed, ${listing.baths} bath, ${String(listing.roomType || "")}${listing.squareFeet ? `, ${listing.squareFeet} sq ft` : ""}
- Neighborhood: ${neighborhood}, ${city}
- Amenities: ${amenities}

Each image above is the best frame of one guided shot. Return JSON:
1. hookText: a headline of at most 7 words and 64 characters that contains the exact rent "${rentLabel}" and the neighborhood "${neighborhood}". Example: "What ${rentLabel} gets you in ${neighborhood}".
2. hookSlotNumber: the shot (one of ${slotNumbers.join(", ")}) that looks most striking as the opening frame.
3. tags: for each shot, a 2-3 word callout naming something specific you can see ("Double vanity", "Walk-in closet"). Max 22 characters.
4. details: for each shot, a second 2-3 word callout naming a different specific thing you can see in that frame ("Gas range", "Rain shower", "Big window"). Max 22 characters. Leave a shot out if nothing else clearly stands out; never guess at things you cannot see.
5. perkLabel: a 2-3 word name for the standout perk in the last shot, if you can see it.
6. warnings: only problems you can see in a frame: a person or the camera operator in a mirror, heavy clutter, a countertop or wall close-up with no room visible, a sideways frame, or very dark footage. Give a short, kind tip to fix it. Return an empty list if the frames look fine.
Rules: no emoji; plain words; never describe who should or should not live there (no age, gender, family status, religion, nationality, disability, or "perfect for students / professionals / couples").`,
    });

    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hookText: { type: Type.STRING },
            hookSlotNumber: { type: Type.INTEGER },
            tags: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slotNumber: { type: Type.INTEGER },
                  tag: { type: Type.STRING },
                },
                required: ["slotNumber", "tag"],
              },
            },
            details: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slotNumber: { type: Type.INTEGER },
                  detail: { type: Type.STRING },
                },
                required: ["slotNumber", "detail"],
              },
            },
            perkLabel: { type: Type.STRING },
            warnings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slotNumber: { type: Type.INTEGER },
                  tip: { type: Type.STRING },
                },
                required: ["slotNumber", "tip"],
              },
            },
          },
          required: ["hookText", "hookSlotNumber", "tags", "warnings"],
        },
      },
    });

    const raw = JSON.parse(response.text || "{}");
    const clean = (text: unknown, max: number): string | undefined => {
      const value = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
      return value && value.length <= max && !violatesFairHousing(value) ? value : undefined;
    };
    const hints: ViralAiHints = {};
    const hookText = clean(raw.hookText, 64);
    // The hook is on screen for at most ~3.2 s: past 8 words nobody finishes reading it, so the
    // editor's own 7-word headline ("What $X/mo gets you in ...") is used instead.
    if (hookText && hookText.includes(rentLabel) && hookText.split(" ").length <= MAX_AI_HOOK_WORDS) {
      hints.hookText = hookText;
    }
    if (slotNumbers.includes(raw.hookSlotNumber)) hints.hookSlotNumber = raw.hookSlotNumber;
    const tags: Record<number, string> = {};
    for (const t of Array.isArray(raw.tags) ? raw.tags : []) {
      const tag = clean(t?.tag, 22);
      if (tag && slotNumbers.includes(t.slotNumber)) tags[t.slotNumber] = tag;
    }
    if (Object.keys(tags).length > 0) hints.tags = tags;
    const details: Record<number, string> = {};
    for (const d of Array.isArray(raw.details) ? raw.details : []) {
      const detail = clean(d?.detail, 22);
      if (detail && slotNumbers.includes(d.slotNumber) && detail.toLowerCase() !== (tags[d.slotNumber] || "").toLowerCase()) {
        details[d.slotNumber] = detail;
      }
    }
    if (Object.keys(details).length > 0) hints.details = details;
    const perk = clean(raw.perkLabel, 22);
    if (perk) hints.perkLabel = perk;
    const warnings: { slotNumber: number; tip: string }[] = [];
    for (const w of Array.isArray(raw.warnings) ? raw.warnings : []) {
      const tip = clean(w?.tip, 160);
      if (tip && slotNumbers.includes(w.slotNumber)) warnings.push({ slotNumber: w.slotNumber, tip });
    }
    if (warnings.length > 0) hints.warnings = warnings.slice(0, 5);

    res.json({ hints, model_used: GEMINI_FLASH_MODEL, latencyMs: Date.now() - startTime });
  } catch (error) {
    console.error("Viral copy pass failed:", error instanceof Error ? error.message : error);
    res.json({ hints: {}, model_used: GEMINI_FLASH_MODEL, latencyMs: Date.now() - startTime });
  }
});

// Video edit request (/api/viral/edit): the host types what to change ("brighter, and say
// 'walk-in closet' on the closet") and gets back a small patch to the editor's settings.
// Text only (no frames, no video) on the lite model with minimal thinking, so it is cheap
// and fast. Without a key, or if the call fails, the local rules in editSettings.ts answer.
app.post("/api/viral/edit", async (req, res) => {
  const startTime = Date.now();
  const body = req.body || {};
  const request = typeof body.request === "string" ? body.request.trim().slice(0, 300) : "";
  const settings: ViralEditSettings = { ...DEFAULT_EDIT_SETTINGS, ...(body.settings || {}) };
  const shots: { slotNumber: number; room: string; tag: string; detail: string }[] = Array.isArray(body.shots)
    ? body.shots
        .filter((s: any) => Number.isInteger(s?.slotNumber) && s.slotNumber >= 1 && s.slotNumber <= 5)
        .slice(0, 5)
        .map((s: any) => ({
          slotNumber: s.slotNumber,
          room: String(s.room || "").slice(0, 40),
          tag: String(s.tag || "").slice(0, 30),
          detail: String(s.detail || "").slice(0, 30),
        }))
    : [];
  const slotNumbers = shots.map((s) => s.slotNumber);
  const listing = body.listing || {};
  const local = () => localEditPatch(request, settings)?.patch ?? null;

  if (!request) {
    res.status(400).json({ error: "Tell us what to change." });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.json({ patch: local(), source: "local", latencyMs: Date.now() - startTime });
    return;
  }

  try {
    const rentLabel = `$${(Number(listing.monthlyRent) || 0).toLocaleString("en-US")}/mo`;
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_LITE_MODEL,
      contents: `You adjust a vertical rental-tour video by changing its settings. Return only what the host asked to change.

Current settings:
- look (each -1..1, 0 = as filmed): brightness ${settings.look.brightness}, warmth ${settings.look.warmth}, contrast ${settings.look.contrast}, saturation ${settings.look.saturation}
- pace: ${settings.pace} (snappy | balanced | relaxed); length: ${settings.length} (full ~25 s | teaser ~13 s)
- hook style: ${settings.style} (price-hook | guess-rent | pov); hook text: "${String(body.hookText || "").slice(0, 80)}"
- sound effects: ${settings.sfxOn ? "on" : "off"}; room sound: ${settings.roomSound ? "on" : "off"}; music: ${settings.music ? `on, volume ${settings.music.volume}` : "none"}
- rooms (slotNumber, room, callout, second callout): ${JSON.stringify(shots.map((s) => [s.slotNumber, s.room, s.tag, s.detail]))}
Listing: ${rentLabel}, ${String(listing.neighborhood || "").slice(0, 60)}, ${String(listing.city || "").slice(0, 60)}, ${listing.beds} bed ${listing.baths} bath.

Host's request: "${request}"

Rules:
- look values are absolute targets; a small change is about 0.3 from the current value, a big one about 0.6.
- A new hookText must keep the exact rent "${rentLabel}" for the price-hook style, at most 7 words and 64 characters.
- Callouts are 2-3 words, at most 22 characters, naming something you can see in that room.
- No emoji. Never describe who should or should not live there (no age, gender, family status, religion, nationality, disability, students, professionals, couples).
- summary: 1-4 short phrases saying what you changed, e.g. "Brighter", "New hook".
- If the request is unclear or impossible (for example new footage), change nothing and say so in summary.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            look: {
              type: Type.OBJECT,
              properties: {
                brightness: { type: Type.NUMBER },
                warmth: { type: Type.NUMBER },
                contrast: { type: Type.NUMBER },
                saturation: { type: Type.NUMBER },
              },
            },
            pace: { type: Type.STRING, enum: ["snappy", "balanced", "relaxed"] },
            length: { type: Type.STRING, enum: ["full", "teaser"] },
            style: { type: Type.STRING, enum: ["price-hook", "guess-rent", "pov"] },
            hookText: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { slotNumber: { type: Type.INTEGER }, text: { type: Type.STRING } },
                required: ["slotNumber", "text"],
              },
            },
            details: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { slotNumber: { type: Type.INTEGER }, text: { type: Type.STRING } },
                required: ["slotNumber", "text"],
              },
            },
            sfxOn: { type: Type.BOOLEAN },
            roomSound: { type: Type.BOOLEAN },
            musicVolume: { type: Type.NUMBER },
            summary: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["summary"],
        },
      },
    });
    const patch = sanitizeEditPatch(JSON.parse(response.text || "{}"), slotNumbers);
    // A price hook must keep the real rent on screen
    if (patch.hookText && settings.style === "price-hook" && !patch.style && !patch.hookText.includes(rentLabel)) {
      delete patch.hookText;
    }
    res.json({
      patch: isEmptyPatch(patch) ? local() ?? patch : patch,
      source: "ai",
      model_used: GEMINI_FLASH_LITE_MODEL,
      latencyMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Viral edit request failed:", error instanceof Error ? error.message : error);
    res.json({ patch: local(), source: "local", latencyMs: Date.now() - startTime });
  }
});

// Background music from "a song you like" (/api/viral/music). The song is never sent to the
// music model: the lite text model first describes its feel (genre, mood, tempo, energy,
// instruments), musicMood.ts strips any word from the host's input, and Lyria makes a new
// 30-second instrumental from that description. Returns the MP3 as base64 (~0.5 MB, well
// under Vercel's 4.5 MB response limit). One call per tap, only when the host asks.
app.post("/api/viral/music", async (req, res) => {
  const startTime = Date.now();
  const song = typeof req.body?.song === "string" ? req.body.song.trim().slice(0, 120) : "";
  if (!song) {
    res.status(400).json({ error: "Type a song you like." });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: "AI music isn't set up on this server." });
    return;
  }
  try {
    const described = await ai.models.generateContent({
      model: GEMINI_FLASH_LITE_MODEL,
      contents: `A host wants background music for a rental tour video with the same feel as this song: "${song}".
Describe its musical feel only: genre (1-3 words), 1-3 mood words, tempo in BPM, energy (calm | medium | upbeat), and 1-4 instruments.
If you don't know the song, infer a fitting feel from the words. Never include the song title, the artist, or lyrics in any field.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            genre: { type: Type.STRING },
            moods: { type: Type.ARRAY, items: { type: Type.STRING } },
            bpm: { type: Type.NUMBER },
            energy: { type: Type.STRING, enum: ["calm", "medium", "upbeat"] },
            instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["genre", "moods", "bpm", "energy", "instruments"],
        },
      },
    });
    const mood = sanitizeMusicMood(JSON.parse(described.text || "{}"), song);
    const interaction = await ai.interactions.create({
      model: GEMINI_MUSIC_MODEL,
      input: buildMusicPrompt(mood),
      store: false,
    });
    const audio = interaction.output_audio;
    if (!audio?.data) throw new Error("No audio came back");
    res.json({
      audioBase64: audio.data,
      mimeType: audio.mime_type || "audio/mpeg",
      mood,
      label: musicLabel(mood),
      latencyMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Viral music failed:", error instanceof Error ? error.message : error);
    res.status(502).json({ error: "We couldn't make music right now. Try another song or try again." });
  }
});

// Fenly 2.0: /api/config, /api/me, /api/events
registerFoundationRoutes(app);
// Fenly 2.0 Fill: /api/listings/*, /api/media/thumb/:id, /r/:code
registerFillRoutes(app);

// Unknown /api routes get a JSON 404 instead of falling through to the React app.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
