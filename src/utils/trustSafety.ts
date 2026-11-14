export interface TrustScanResult {
  sanitizedText: string;
  wasRedacted: boolean;
  redactedTypes: ('phone' | 'email' | 'link')[];
  circumventionDetected: boolean;
  flaggedReason: string | null;
  warningBannerText: string | null;
}

export interface GeminiInterceptResult {
  is_off_platform_attempt: boolean;
  confidence: number;
  reason?: string;
  detectedPattern?: string;
}

export const REDACTION_PLACEHOLDER = '[Hidden until booking is confirmed]';

const PHONE_REGEX =
  /(?:\+?1[-.\s]?)?\(?\b[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

const EMAIL_REGEX =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\b/g;

const LINK_REGEX =
  /\b(?:https?:\/\/|www\.)[^\s]+|\b[A-Za-z0-9-]+\.(?:com|net|org|io|co|me|app)(?:\/[^\s]*)?/gi;

const CIRCUMVENTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(whatsapp|telegram|signal|wechat|imessage|ig|instagram|snapchat|fb|facebook)\b/i,
    reason: 'Off-platform messaging or social handle mentioned',
  },
  {
    pattern: /\b(pay\s+(?:me\s+)?in\s+cash|cash\s+only|venmo|zelle|cash\s*app|paypal|wire\s+transfer|wire\s+me|western\s+union|crypto)\b/i,
    reason: 'Off-platform payment method requested',
  },
  {
    pattern: /\b(off[- ]platform|outside\s+the\s+app|bypass\s+the\s+app|skip\s+the\s+fee|save\s+the\s+fee|avoid\s+fees)\b/i,
    reason: 'Attempt to bypass platform protections',
  },
  {
    pattern: /\b(text\s+me|call\s+me|hit\s+me\s+up\s+at|reach\s+me\s+at|email\s+me|dm\s+me|find\s+me\s+on)\b/i,
    reason: 'Direct contact solicitation before booking is confirmed',
  },
];

// Detects spelled-out phone numbers like "four zero eight, five five five..."
const SPELLED_NUMBER_WORDS =
  /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi;

// Detects sneaky social handle sharing like "under john_doe_realty" or "at @john_doe"
const SNEAKY_HANDLE_REGEX =
  /\b(?:under|handle|user(?:name)?|ig|insta(?:gram)?|telegram|snap(?:chat)?|venmo|zelle)\s+(?:is\s+)?[@a-z0-9_.-]{3,}\b/i;

export const DEFAULT_WARNING_BANNER =
  '⚠️ AI Safety Intervention: Moving conversations or payments off-platform voids the Fenn Rentals Move-In Guarantee (Escrow & Fraud Protection), forfeits free Landlord Admin & Verification tools, and risks immediate account suspension.';

/**
 * Layer 1: Deterministic Regex Masking (Free & Instant)
 * Detects 10-digit phone numbers, @ email formats, and .com links,
 * replacing them with [Hidden until booking is confirmed] when booking/escrow is not confirmed.
 */
export function maskAndScanMessage(
  rawText: string,
  isBookingConfirmed: boolean = false
): TrustScanResult {
  if (isBookingConfirmed) {
    return {
      sanitizedText: rawText,
      wasRedacted: false,
      redactedTypes: [],
      circumventionDetected: false,
      flaggedReason: null,
      warningBannerText: null,
    };
  }

  let sanitizedText = rawText;
  const redactedTypes: ('phone' | 'email' | 'link')[] = [];

  if (EMAIL_REGEX.test(sanitizedText)) {
    redactedTypes.push('email');
    sanitizedText = sanitizedText.replace(EMAIL_REGEX, REDACTION_PLACEHOLDER);
  }

  if (LINK_REGEX.test(sanitizedText)) {
    redactedTypes.push('link');
    sanitizedText = sanitizedText.replace(LINK_REGEX, REDACTION_PLACEHOLDER);
  }

  if (PHONE_REGEX.test(sanitizedText)) {
    redactedTypes.push('phone');
    sanitizedText = sanitizedText.replace(PHONE_REGEX, REDACTION_PLACEHOLDER);
  }

  let flaggedReason: string | null = null;
  for (const item of CIRCUMVENTION_PATTERNS) {
    if (item.pattern.test(rawText)) {
      flaggedReason = item.reason;
      break;
    }
  }

  const spelledMatches = rawText.match(SPELLED_NUMBER_WORDS);
  if (!flaggedReason && spelledMatches && spelledMatches.length >= 4) {
    flaggedReason = 'Spelled-out phone number bypass detected';
  }

  if (!flaggedReason && SNEAKY_HANDLE_REGEX.test(rawText)) {
    flaggedReason = 'Social handle off-platform bypass detected';
  }

  if (!flaggedReason && redactedTypes.length > 0) {
    flaggedReason = 'Contact information masked until booking is confirmed';
  }

  const circumventionDetected = Boolean(flaggedReason) || redactedTypes.length > 0;

  return {
    sanitizedText,
    wasRedacted: redactedTypes.length > 0,
    redactedTypes,
    circumventionDetected,
    flaggedReason,
    warningBannerText: circumventionDetected ? DEFAULT_WARNING_BANNER : null,
  };
}

/**
 * Layer 2: Deterministic & Heuristic Analyzer backing the Gemini Flash Interceptor
 * Evaluates sneaky regex bypass attempts such as "call me at four zero eight, five five five..."
 * or "find me on IG under john_doe_realty" or "pay me in cash / wire transfer".
 * Returns the exact JSON contract: { is_off_platform_attempt: boolean, confidence: number, reason?: string }
 */
export function evaluateLayer2OffPlatformAttempt(
  rawText: string,
  isBookingConfirmed: boolean = false
): GeminiInterceptResult {
  if (isBookingConfirmed) {
    return {
      is_off_platform_attempt: false,
      confidence: 0.02,
      reason: 'Booking is confirmed; contact sharing is unlocked.',
    };
  }

  const spelledMatches = rawText.match(SPELLED_NUMBER_WORDS) || [];
  if (spelledMatches.length >= 4) {
    return {
      is_off_platform_attempt: true,
      confidence: 0.97,
      reason: 'Detected spelled-out phone digits attempting to bypass Layer 1 regex masking.',
      detectedPattern: 'spelled_phone_number',
    };
  }

  if (SNEAKY_HANDLE_REGEX.test(rawText)) {
    return {
      is_off_platform_attempt: true,
      confidence: 0.96,
      reason: 'Detected social media handle solicitation ("find me on IG / social handle") to move chat off-platform.',
      detectedPattern: 'social_handle_bypass',
    };
  }

  for (const item of CIRCUMVENTION_PATTERNS) {
    if (item.pattern.test(rawText)) {
      // Only block via Layer 2 if it's a sneaky evasion or explicit off-platform app/payment solicitation
      // while letting pure Layer 1 masked contact strings demonstrate [Hidden until booking is confirmed]
      const hasRawContactOnly =
        (PHONE_REGEX.test(rawText) || EMAIL_REGEX.test(rawText) || LINK_REGEX.test(rawText)) &&
        !/\b(whatsapp|telegram|signal|wechat|ig|instagram|snapchat|cash|venmo|zelle|wire|off[- ]platform|bypass|skip\s+the\s+fee)\b/i.test(
          rawText
        );
      if (!hasRawContactOnly) {
        return {
          is_off_platform_attempt: true,
          confidence: 0.95,
          reason: item.reason,
          detectedPattern: 'off_platform_solicitation',
        };
      }
    }
  }

  return {
    is_off_platform_attempt: false,
    confidence: 0.04,
    reason: 'Clean on-platform rental inquiry.',
  };
}

export interface StripeConnectEscrowBreakdown {
  totalHeldAmount: number;
  landlordTransferAmount: number; // 90%
  platformFeeAmount: number; // 10% to Aspiring Venture LLC
  platformEntityName: string;
  moveInWindowHours: number;
  badgeText: string;
  moveInTimestampIso: string;
}

/**
 * Pillar 2: Stripe Connect "Separate Charges and Transfers" Escrow Calculation
 * Holds funds via PaymentIntent, displays [ ✓ $1,200 Held Safely by Wren Rental ],
 * and after the 24-hour move-in window fires stripe.transfers.create routing
 * 90% to the landlord and 10% to Aspiring Venture LLC.
 */
export function calculateStripeConnectSplit(
  amountDollars: number = 1200,
  moveInTimestampIso: string = '2026-11-01T14:00:00Z'
): StripeConnectEscrowBreakdown {
  const landlordTransferAmount = Math.round(amountDollars * 0.9 * 100) / 100;
  const platformFeeAmount = Math.round((amountDollars - landlordTransferAmount) * 100) / 100;
  const formattedAmount = amountDollars.toLocaleString('en-US');

  return {
    totalHeldAmount: amountDollars,
    landlordTransferAmount,
    platformFeeAmount,
    platformEntityName: 'Aspiring Venture LLC',
    moveInWindowHours: 24,
    badgeText: `[ ✓ $${formattedAmount} Held Safely by Fenn Rentals ]`,
    moveInTimestampIso,
  };
}

export interface MoveInGuaranteeSummary {
  monthlyRent: number;
  securityDeposit: number;
  totalEscrowProtected: number;
  releaseRule: string;
}

export function calculateMoveInGuarantee(
  monthlyRent: number,
  securityDeposit: number
): MoveInGuaranteeSummary {
  return {
    monthlyRent,
    securityDeposit,
    totalEscrowProtected: monthlyRent + securityDeposit,
    releaseRule:
      'Processed via Stripe Connect Separate Charges & Transfers: funds sit safely in the Fenn Rentals Connect balance until 24 hours after your move_in_timestamp.',
  };
}

export interface CaliforniaLeaseTemplateVars {
  landlord_name: string;
  tenant_name: string;
  monthly_rent: number;
  security_deposit?: number;
  room_address?: string;
  move_in_date?: string;
  quiet_hours: string;
  guest_policy: string;
  smoking_policy?: string;
  utilities_split?: string;
}

/**
 * Pillar 3 (Part A): Dynamic California Room Rental Agreement Generator
 * Injects {{landlord_name}}, {{tenant_name}}, {{monthly_rent}}, {{quiet_hours}},
 * and {{guest_policy}} into a state-compliant California Room Rental & Roommate Agreement.
 */
export function generateCaliforniaRoomLease(vars: CaliforniaLeaseTemplateVars): string {
  const deposit = vars.security_deposit ?? 1000;
  const address = vars.room_address ?? 'Mission Dolores, San Francisco, CA';
  const moveIn = vars.move_in_date ?? '2026-11-01';
  const smoking = vars.smoking_policy ?? 'Strictly 100% smoke-free & vape-free indoors';
  const utilities = vars.utilities_split ?? 'High-speed Fiber Wi-Fi included; PG&E split evenly';

  return [
    'CALIFORNIA RESIDENTIAL ROOM RENTAL & ROOMMATE AGREEMENT',
    'Compliant with California Civil Code § 1940 et seq. & § 1950.5',
    '----------------------------------------------------------------',
    `1. PARTIES & PREMISES`,
    `   • Landlord / Master Tenant ({{landlord_name}}): ${vars.landlord_name}`,
    `   • Incoming Roommate / Tenant ({{tenant_name}}): ${vars.tenant_name}`,
    `   • Premises Address: ${address}`,
    `   • Target Move-In Date: ${moveIn}`,
    '',
    `2. RENT & STRIPE CONNECT ESCROW TERMS`,
    `   • Monthly Rent ({{monthly_rent}}): $${vars.monthly_rent.toLocaleString('en-US')}/month`,
    `   • Security Deposit: $${deposit.toLocaleString('en-US')} (Held via Fenn Rentals Stripe Connect PaymentIntent)`,
    `   • Escrow Release: Released 24 hours after move_in_timestamp via stripe.transfers.create (90% Landlord / 10% Aspiring Venture LLC).`,
    '',
    `3. HOUSEHOLD RULES & COLIVING CLAUSES (DYNAMICALLY INJECTED)`,
    `   • Quiet Hours ({{quiet_hours}}): ${vars.quiet_hours}`,
    `   • Overnight Guest Policy ({{guest_policy}}): ${vars.guest_policy}`,
    `   • Smoking & Substance Policy: ${smoking}`,
    `   • Utilities & Shared Amenities: ${utilities}`,
    '',
    `4. SCREENING & ELECTRONIC SIGNATURE COMPLIANCE`,
    `   • Identity Verified via Stripe Identity (identity.verification_session.verified)`,
    `   • Background & Income Screened per FCRA & CA Civil Code § 1950.6`,
    `   • Executed via Dropbox Sign (HelloSign) Embedded Signing (ESIGN / UETA Audit Trail)`,
  ].join('\n');
}

export interface LandlordBenefitItem {
  id: 'stripe_identity' | 'fcra_screening' | 'hybrid_california_lease' | 'stripe_connect_escrow';
  title: string;
  providerBadge: string;
  onPlatformCost: string;
  offPlatformPain: string;
  description: string;
}

export const LANDLORD_INCLUDED_BENEFITS: LandlordBenefitItem[] = [
  {
    id: 'stripe_identity',
    title: 'Stripe Identity Biometric ID Check',
    providerBadge: 'Stripe Identity (~$1.50)',
    onPlatformCost: 'Included Free',
    offPlatformPain: 'Manual ID check & fake license risk',
    description:
      'Native camera modal scans driver’s license + live selfie and fires identity.verification_session.verified webhook.',
  },
  {
    id: 'fcra_screening',
    title: 'Certn / MeasureOne / TransUnion Screening',
    providerBadge: 'FCRA + CA § 1950.6',
    onPlatformCost: '$0 to Landlord ($40 Tenant Fee)',
    offPlatformPain: '$40 out-of-pocket & manual credit chasing',
    description:
      'Compliant credit, criminal, eviction & payroll income check ($35 base + $5 markup) with instant Pass/Fail summary.',
  },
  {
    id: 'hybrid_california_lease',
    title: 'Hybrid CA Room Lease + Dropbox Sign',
    providerBadge: 'Dropbox Sign API',
    onPlatformCost: 'Included Free',
    offPlatformPain: '2+ hrs drafting & chasing signatures',
    description:
      'Dynamic California Room Rental Agreement generator paired with in-app Dropbox Sign (sign_url) finger signature.',
  },
  {
    id: 'stripe_connect_escrow',
    title: 'Stripe Connect Escrow & Rent Payouts',
    providerBadge: 'Stripe Connect',
    onPlatformCost: 'Automated 90/10 Split',
    offPlatformPain: 'Chasing tenants on Venmo every month',
    description:
      'Separate Charges & Transfers holds deposit for 24h move-in window, then auto-routes 90% to your bank via stripe.transfers.create.',
  },
];

export interface WrenFeedHandoffResult {
  wrenReply: string;
  extractedMaxPrice: number;
  extractedSearchQuery: string;
  utilitiesIncludedOnly: boolean;
  petFriendlyDetected: boolean;
  noCarpetDetected: boolean;
}

/**
 * Flow 1: The "Chat-to-Feed" Handoff ("Tell Wren what you're looking for")
 * Parses natural-language requests like "Need a 1-bed under $2,800, dog-friendly, hate carpet"
 * into filter criteria and Wren's signature insider-friend reply.
 */
export function parseWrenChatToFeedQuery(rawPrompt: string): WrenFeedHandoffResult {
  const lower = rawPrompt.toLowerCase();
  const priceMatch = rawPrompt.match(/\$?\s*([1-9]\d{0,1},\d{3}|[1-9]\d{2,3})/);
  const parsedPrice = priceMatch
    ? parseInt(priceMatch[1].replace(/,/g, ''), 10)
    : 2800;
  const extractedMaxPrice = Math.min(Math.max(parsedPrice, 800), 3500);

  const petFriendlyDetected = /\b(dog|pup|pet|cat|furry)\b/i.test(lower);
  const noCarpetDetected = /\b(carpet|hardwood|wood\s+floor)\b/i.test(lower);
  const utilitiesIncludedOnly = /\b(utilities|wifi\s+included|bills\s+included)\b/i.test(lower);

  let cityOrHood = '';
  if (lower.includes('mission') || lower.includes('sf') || lower.includes('san francisco')) {
    cityOrHood = 'Mission';
  } else if (lower.includes('williamsburg') || lower.includes('brooklyn') || lower.includes('nyc')) {
    cityOrHood = 'Williamsburg';
  } else if (lower.includes('austin') || lower.includes('congress')) {
    cityOrHood = 'South Congress';
  } else if (lower.includes('silver lake') || lower.includes('la') || lower.includes('los angeles')) {
    cityOrHood = 'Silver Lake';
  }

  const traits: string[] = [];
  if (noCarpetDetected) traits.push('No carpet');
  if (petFriendlyDetected) traits.push('room for the pup');
  if (utilitiesIncludedOnly) traits.push('utilities included');
  if (cityOrHood) traits.push(`in ${cityOrHood}`);

  const summaryPhrase =
    traits.length > 0
      ? `${traits.join(', ')} under $${extractedMaxPrice.toLocaleString('en-US')}.`
      : `Under $${extractedMaxPrice.toLocaleString('en-US')} with actual closet space.`;

  const wrenReply = `Got it. ${summaryPhrase} Ears perked—let's look at three spots I pulled for you.`;

  return {
    wrenReply,
    extractedMaxPrice,
    extractedSearchQuery: cityOrHood,
    utilitiesIncludedOnly,
    petFriendlyDetected,
    noCarpetDetected,
  };
}

export interface WrenCoWatcherCallout {
  id: string;
  type: 'context_callout' | 'red_flag_radar' | 'hot_spot';
  badgeLabel: string;
  text: string;
}

/**
 * Flow 2: The "Co-Watcher" on the Video Feed
 * Generates Wren's Context-Aware Callouts, Red-Flag Radar, and Insider Hot-Spot alerts for a room.
 */
export function getWrenCoWatcherCallouts(room: {
  id?: string;
  title?: string;
  price?: number;
  location?: string;
  amenities?: string[];
}): WrenCoWatcherCallout[] {
  const amenitiesStr = (room.amenities || []).join(' ').toLowerCase();
  const hasUtilities = amenitiesStr.includes('utilities');
  const hasLaundry = amenitiesStr.includes('laundry') || amenitiesStr.includes('washer');
  const loc = room.location || 'this block';

  const contextText = hasUtilities
    ? `Psst—that's a gas stove, and utilities are included here in ${loc}.`
    : hasLaundry
    ? `Psst—in-unit laundry is tucked right behind that hallway door, and natural light hits all afternoon.`
    : `Psst—hardwood floors throughout and actual closet space in ${loc}.`;

  const redFlagText =
    room.id === 'room-2'
      ? `4th floor walk-up—great calves, no elevator. Worth it for that skylight though!`
      : `Gorgeous light, right? Just a heads up: street parking on ${loc.split(',')[0]} gets tight after 7 PM.`;

  return [
    {
      id: 'callout-context',
      type: 'context_callout',
      badgeLabel: 'Fenn Co-Watcher',
      text: contextText,
    },
    {
      id: 'callout-red-flag',
      type: 'red_flag_radar',
      badgeLabel: 'Red-Flag Radar',
      text: redFlagText,
    },
    {
      id: 'callout-hotspot',
      type: 'hot_spot',
      badgeLabel: 'Fenn Drop Alert',
      text: `Heads up, this spot is getting lots of eyes today. Want me to grab a tour slot for you?`,
    },
  ];
}

/**
 * Flow 2 (Instant Pivot): Evaluates if the user has swiped past 3 videos and should see Wren's Instant Pivot prompt.
 */
export function shouldTriggerWrenInstantPivot(rapidSwipeCount: number): {
  triggered: boolean;
  promptText: string;
} {
  if (rapidSwipeCount >= 3) {
    return {
      triggered: true,
      promptText:
        "Not feeling the industrial loft vibe? Tap here and tell me what's bugging you, I'll reshuffle the deck.",
    };
  }
  return {
    triggered: false,
    promptText: '',
  };
}

/**
 * Fenn Rentals — Official "Ask Fenn" AI Concierge System Instructions
 */
export const ASK_FENN_SYSTEM_INSTRUCTION = `You are Fenn, the savvy, sharp-eared apartment scout inside the Fenn Rentals app. Your job is to help renters discover apartments, decode neighborhood vibes, and filter video tours without sounding like a pushy real estate broker.

Personality & Tone:
- Warm, street-smart, concise, and observant. You have "big ears on the street"—you catch details in listings that normal renters miss (like whether "cozy" actually means "no closet" or if a unit gets natural afternoon light).
- Never use cheesy fox puns (do not say "pawsome" or "barking up the wrong tree"). Keep the mascot nod subtle: you may occasionally refer to a user's saved apartments as their "Den" or mention "keeping my ears perked" for a price drop.
- Keep responses punchy and mobile-friendly (2–4 sentences max unless comparing neighborhoods).

Core Tasks:
- Translate casual user requests (e.g., "I need a bright 1BR near good coffee under $2,800 with in-unit laundry") into structured search filters.
- Highlight pros, cons, and potential red flags when a user asks about a specific listing.
- Recommend specific video tours to watch based on layout, natural light, and kitchen/bath finishes.`;

export interface StructuredFennFilters {
  maxPrice: number;
  bedBathLabel: string;
  neighborhood: string;
  amenities: string[];
  naturalLight: boolean;
  nearCoffee: boolean;
  petFriendly: boolean;
}

export interface ListingFennAudit {
  roomId: string;
  pros: string[];
  cons: string[];
  redFlag: string;
  finishHighlight: string;
}

export interface AskFennSearchResult {
  fennReply: string;
  structuredFilters: StructuredFennFilters;
  matchedRoomIds: string[];
  earsPerked: boolean;
  audits: ListingFennAudit[];
}

/**
 * Formats a clean Bed/Bath badge for transparent video overlay tags on the Feed (Watch) screen
 */
export function getRoomBedBathTag(room: {
  id?: string;
  roomType?: string;
  amenities?: string[];
}): string {
  const hasPrivateBath = (room.amenities || []).some((a) =>
    /private bath|en-suite/i.test(a)
  );
  if (room.roomType === 'Entire Place' || room.roomType === 'Studio Sublet') {
    return room.id === 'room-6' ? '1BR • 1BA' : 'Studio • 1BA';
  }
  if (room.roomType === 'Master Suite') {
    return '1BR Suite • 1BA';
  }
  return hasPrivateBath ? '1BR • 1BA' : '1BR • Shared BA';
}

/**
 * Evaluates a specific listing for Pros, Cons, and subtle Red Flags ("big ears on the street")
 */
export function evaluateListingWithFenn(room: {
  id: string;
  title: string;
  price: number;
  neighborhood?: string;
  location?: string;
  squareFeet?: number;
  amenities?: string[];
  description?: string;
}): ListingFennAudit {
  const amenities = room.amenities || [];
  const hasLaundry = amenities.some((a) => /w\/d|laundry/i.test(a));
  const hasPrivateBath = amenities.some((a) => /private bath/i.test(a));
  const hasUtilities = amenities.some((a) => /utilities included/i.test(a));
  const hasBalcony = amenities.some((a) => /balcony|patio|deck/i.test(a));

  const pros: string[] = [];
  if (hasLaundry) pros.push('In-unit W/D (no coin-laundry basement trips)');
  if (hasPrivateBath) pros.push('Dedicated en-suite bath with strong water pressure');
  if (hasUtilities) pros.push('Utilities & gigabit fiber bundled into base rent');
  if (hasBalcony) pros.push('Direct outdoor balcony/deck access with afternoon sun');
  if (pros.length < 2) {
    pros.push('South/west window exposure with steady natural afternoon light');
  }

  const cons: string[] = [];
  if ((room.squareFeet || 220) < 225) {
    cons.push('Compact footprint—measure if you have a wide standing desk');
  } else {
    cons.push('Street parking fills up quickly after 7 PM on weeknights');
  }

  const redFlag =
    room.id === 'room-2'
      ? '4th-floor walk-up with no elevator—great skyline light, but factor that in on move-in day.'
      : room.id === 'room-3'
      ? 'Weekend foot traffic near South Congress cafes can add daytime street buzz.'
      : 'Check closet rod depth during the video tour—"cozy alcove" spots sometimes fit a dresser better than a full wardrobe.';

  const finishHighlight =
    room.id === 'room-1'
      ? 'South-facing bay windows, gas range kitchen, and walk-in closet.'
      : room.id === 'room-2'
      ? 'Exposed brick, 12ft loft ceilings, and stainless espresso bar kitchen.'
      : 'Hardwood floors, modern tiled bath, and direct neighborhood cafe access.';

  return {
    roomId: room.id,
    pros: pros.slice(0, 3),
    cons,
    redFlag,
    finishHighlight,
  };
}

/**
 * Translates casual user requests (e.g., "I need a bright 1BR near good coffee under $2,800 with in-unit laundry")
 * into structured search filters, matches video tours, and perks Fenn's radar ears when matches are found.
 */
export function parseAskFennSearch(
  rawQuery: string,
  allRooms: {
    id: string;
    title: string;
    price: number;
    neighborhood?: string;
    location?: string;
    city?: string;
    squareFeet?: number;
    amenities?: string[];
    description?: string;
  }[] = []
): AskFennSearchResult {
  const lower = rawQuery.toLowerCase();

  const priceMatch = rawQuery.match(/\$?\s*([1-9]\d{0,1},\d{3}|[1-9]\d{2,3})/);
  const parsedPrice = priceMatch
    ? parseInt(priceMatch[1].replace(/,/g, ''), 10)
    : 2800;
  const maxPrice = Math.min(Math.max(parsedPrice, 800), 4500);

  const bedBathLabel = /\b(studio)\b/i.test(lower)
    ? 'Studio • 1BA'
    : /\b(2\s*br|2\s*bed|two\s*bed)\b/i.test(lower)
    ? '2BR • 2BA'
    : '1BR • 1BA';

  const amenities: string[] = [];
  if (/\b(laundry|w\/d|washer)\b/i.test(lower)) {
    amenities.push('In-Unit W/D');
  }
  if (/\b(private\s+bath|en-suite|ensuite)\b/i.test(lower)) {
    amenities.push('Private Bath');
  }
  if (/\b(pet|dog|cat)\b/i.test(lower)) {
    amenities.push('Pet Friendly');
  }
  if (/\b(utilities|wifi)\b/i.test(lower)) {
    amenities.push('Utilities Included');
  }
  if (/\b(balcony|patio|rooftop|yard)\b/i.test(lower)) {
    amenities.push('Balcony');
  }

  const naturalLight = /\b(bright|sun|sunny|light|window)\b/i.test(lower);
  const nearCoffee = /\b(coffee|cafe|espresso|walkable)\b/i.test(lower);
  const petFriendly = amenities.includes('Pet Friendly');

  let neighborhood = '';
  if (lower.includes('hayes')) {
    neighborhood = 'Hayes Valley';
  } else if (lower.includes('marina') || lower.includes('crissy')) {
    neighborhood = 'Marina District';
  } else if (lower.includes('dolores') || lower.includes('castro')) {
    neighborhood = 'Dolores Heights';
  } else if (lower.includes('north beach') || lower.includes('coit')) {
    neighborhood = 'North Beach';
  } else if (lower.includes('nopa') || lower.includes('alamo')) {
    neighborhood = 'NoPa';
  } else if (lower.includes('mission')) {
    neighborhood = 'Mission District';
  } else if (/\b(sf|san francisco)\b/i.test(lower)) {
    neighborhood = 'San Francisco';
  } else if (lower.includes('williamsburg') || lower.includes('brooklyn')) {
    neighborhood = 'Williamsburg';
  } else if (lower.includes('south congress') || lower.includes('austin')) {
    neighborhood = 'South Congress';
  } else if (lower.includes('capitol hill') || lower.includes('seattle')) {
    neighborhood = 'Capitol Hill';
  } else if (lower.includes('logan square') || lower.includes('chicago')) {
    neighborhood = 'Logan Square';
  } else if (/\b(silver lake|los angeles|la)\b/i.test(lower)) {
    neighborhood = 'Silver Lake';
  }

  const matchedRooms = allRooms.filter((r) => {
    if (r.price > maxPrice) return false;
    if (
      neighborhood &&
      !(r.neighborhood || '').toLowerCase().includes(neighborhood.toLowerCase()) &&
      !(r.location || '').toLowerCase().includes(neighborhood.toLowerCase()) &&
      !(r.city || '').toLowerCase().includes(neighborhood.toLowerCase())
    ) {
      return false;
    }
    if (amenities.includes('In-Unit W/D')) {
      const hasWD = (r.amenities || []).some((a) => /w\/d|laundry/i.test(a));
      if (!hasWD) return false;
    }
    if (amenities.includes('Pet Friendly')) {
      const hasPet = (r.amenities || []).some((a) => /pet/i.test(a));
      if (!hasPet) return false;
    }
    return true;
  });

  const finalMatches = matchedRooms.length > 0 ? matchedRooms : allRooms.slice(0, 3);
  const earsPerked = finalMatches.length > 0;
  const audits = finalMatches.slice(0, 3).map((r) => evaluateListingWithFenn(r));

  const filterSummaryParts: string[] = [`under $${maxPrice.toLocaleString('en-US')}`];
  if (naturalLight) filterSummaryParts.push('strong afternoon light');
  if (nearCoffee) filterSummaryParts.push('walkable coffee spots');
  if (amenities.length > 0) filterSummaryParts.push(amenities.join(' + '));
  if (neighborhood) filterSummaryParts.push(`in ${neighborhood}`);

  const topMatchTitle = finalMatches[0]?.title || 'the Mission Loft Suite';
  const fennReply = `I kept my ears perked and filtered for ${bedBathLabel} spots ${filterSummaryParts.join(', ')}. Watch "${topMatchTitle}" first—actual south-facing windows, real closet depth, and in-unit laundry without broker markup. Save your favorites to your Den before evening tour slots fill up.`;

  return {
    fennReply,
    structuredFilters: {
      maxPrice,
      bedBathLabel,
      neighborhood: neighborhood || 'All Prime Neighborhoods',
      amenities,
      naturalLight,
      nearCoffee,
      petFriendly,
    },
    matchedRoomIds: finalMatches.map((r) => r.id),
    earsPerked,
    audits,
  };
}

/**
 * House OS — AI Utility Bill Extraction Schema & Pure Calculation Logic
 */
export interface ExtractedUtilityBill {
  utility_provider: string;
  service_address: string;
  billing_period: string;
  total_amount_due: number;
  due_date: string;
  address_match_verified: boolean;
}

export interface RoommateUtilitySplit {
  roommateName: string;
  roomLabel: string;
  baseRent: number;
  utilityShare: number;
  combinedStripePull: number;
}

export interface UtilityBillSplitSummary {
  bill: ExtractedUtilityBill;
  roommateCount: number;
  perRoommateShare: number;
  splits: RoommateUtilitySplit[];
}

export const SAMPLE_PGE_UTILITY_BILL: ExtractedUtilityBill = {
  utility_provider: 'Pacific Gas & Electric (PG&E)',
  service_address: '742 Valencia St, Apt 3B, Mission District, San Francisco, CA 94110',
  billing_period: 'Oct 01, 2026 – Oct 31, 2026',
  total_amount_due: 228.6,
  due_date: 'Nov 15, 2026',
  address_match_verified: true,
};

/**
 * Divides an extracted utility bill total evenly across roommates and computes
 * each roommate's combined Base Rent + Utility Share for next month's automated Stripe rent pull.
 */
export function calculateUtilityBillSplit(
  bill: ExtractedUtilityBill,
  roommates: { name: string; roomLabel: string; baseRent: number }[] = [
    { name: 'Alex Rivera (You)', roomLabel: 'Room 1 • Master Suite', baseRent: 1450 },
    { name: 'Sarah Miller (Host)', roomLabel: 'Room 2 • South Studio', baseRent: 1400 },
    { name: 'Mateo Cruz', roomLabel: 'Room 3 • Garden Room', baseRent: 1350 },
  ]
): UtilityBillSplitSummary {
  const count = Math.max(roommates.length, 1);
  const perRoommateShare = Number((bill.total_amount_due / count).toFixed(2));

  const splits: RoommateUtilitySplit[] = roommates.map((rm) => ({
    roommateName: rm.name,
    roomLabel: rm.roomLabel,
    baseRent: rm.baseRent,
    utilityShare: perRoommateShare,
    combinedStripePull: Number((rm.baseRent + perRoommateShare).toFixed(2)),
  }));

  return {
    bill,
    roommateCount: count,
    perRoommateShare,
    splits,
  };
}

export interface CreditBureauLogEntry {
  id: string;
  monthLabel: string;
  amountReported: number;
  bureaus: string;
  status: 'Furnished & Verified' | 'Scheduled';
  scoreDelta: string;
}

export const INITIAL_CREDIT_BOOST_LOGS: CreditBureauLogEntry[] = [
  {
    id: 'cb-oct',
    monthLabel: 'October 2026',
    amountReported: 1450,
    bureaus: 'Equifax & TransUnion',
    status: 'Furnished & Verified',
    scoreDelta: '+6 pts',
  },
  {
    id: 'cb-sep',
    monthLabel: 'September 2026',
    amountReported: 1450,
    bureaus: 'Equifax & TransUnion',
    status: 'Furnished & Verified',
    scoreDelta: '+5 pts',
  },
  {
    id: 'cb-aug',
    monthLabel: 'August 2026',
    amountReported: 1450,
    bureaus: 'Equifax & TransUnion',
    status: 'Furnished & Verified',
    scoreDelta: '+6 pts',
  },
  {
    id: 'cb-jul',
    monthLabel: 'July 2026',
    amountReported: 1450,
    bureaus: 'Equifax & TransUnion',
    status: 'Furnished & Verified',
    scoreDelta: '+6 pts',
  },
  {
    id: 'cb-jun',
    monthLabel: 'June 2026',
    amountReported: 1450,
    bureaus: 'Equifax & TransUnion',
    status: 'Furnished & Verified',
    scoreDelta: '+5 pts',
  },
];

export function formatFennEscrowStatus(amount: number = 1200): string {
  return `$${amount.toLocaleString('en-US')} Held Safely by Fenn — Releases to Host 24h after Move-In`;
}

export interface FennChatMessage {
  id: string;
  sender: 'user' | 'fenn';
  text: string;
  timestamp: string;
}

export interface AskFennChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: FennChatMessage[];
  searchResult: AskFennSearchResult;
}

export function createFreshAskFennSession(
  allRooms: {
    id: string;
    title: string;
    price: number;
    neighborhood?: string;
    location?: string;
    city?: string;
    squareFeet?: number;
    amenities?: string[];
    description?: string;
  }[] = [],
  sessionId: string = `fenn-chat-${Date.now()}`,
  createdAt: string = 'Just now'
): AskFennChatSession {
  const defaultSearch = parseAskFennSearch(
    'I need a bright 1BR in San Francisco near good coffee under $2,800 with in-unit laundry',
    allRooms
  );
  return {
    id: sessionId,
    title: 'New Scout Chat',
    createdAt,
    messages: [
      {
        id: `fenn-welcome-${sessionId}`,
        sender: 'fenn',
        text: "My ears are perked. Drop your casual wish list—budget, light, coffee walkability, or laundry—and I'll translate it into structured filters, flag hidden catches, and pull the best video tours.",
        timestamp: createdAt,
      },
    ],
    searchResult: defaultSearch,
  };
}

export function createInitialAskFennHistory(
  allRooms: {
    id: string;
    title: string;
    price: number;
    neighborhood?: string;
    location?: string;
    city?: string;
    squareFeet?: number;
    amenities?: string[];
    description?: string;
  }[] = []
): AskFennChatSession[] {
  const q1 = 'I need a bright 1BR in San Francisco near good coffee under $1,800 with in-unit laundry';
  const s1 = parseAskFennSearch(q1, allRooms);
  const q2 = 'Find a pet-friendly Mission District spot under $1,600 with utilities included';
  const s2 = parseAskFennSearch(q2, allRooms);

  return [
    createFreshAskFennSession(allRooms, 'fenn-chat-fresh-init', 'Just now'),
    {
      id: 'fenn-chat-hist-1',
      title: 'San Francisco 1BR near coffee ≤ $1,800',
      createdAt: 'Earlier today',
      messages: [
        {
          id: 'h1-w',
          sender: 'fenn',
          text: "My ears are perked. Drop your casual wish list—budget, light, coffee walkability, or laundry—and I'll translate it into structured filters, flag hidden catches, and pull the best video tours.",
          timestamp: 'Earlier today',
        },
        {
          id: 'h1-u',
          sender: 'user',
          text: q1,
          timestamp: 'Earlier today',
        },
        {
          id: 'h1-f',
          sender: 'fenn',
          text: s1.fennReply,
          timestamp: 'Earlier today',
        },
      ],
      searchResult: s1,
    },
    {
      id: 'fenn-chat-hist-2',
      title: 'Pet-friendly Mission spot ≤ $1,600',
      createdAt: 'Yesterday',
      messages: [
        {
          id: 'h2-w',
          sender: 'fenn',
          text: "My ears are perked. Drop your casual wish list—budget, light, coffee walkability, or laundry—and I'll translate it into structured filters, flag hidden catches, and pull the best video tours.",
          timestamp: 'Yesterday',
        },
        {
          id: 'h2-u',
          sender: 'user',
          text: q2,
          timestamp: 'Yesterday',
        },
        {
          id: 'h2-f',
          sender: 'fenn',
          text: s2.fennReply,
          timestamp: 'Yesterday',
        },
      ],
      searchResult: s2,
    },
  ];
}

export function startNewAskFennChatAndSaveHistory(
  existingSessions: AskFennChatSession[],
  allRooms: {
    id: string;
    title: string;
    price: number;
    neighborhood?: string;
    location?: string;
    city?: string;
    squareFeet?: number;
    amenities?: string[];
    description?: string;
  }[] = [],
  newSessionId: string = `fenn-chat-${Date.now()}`,
  createdAt: string = 'Just now'
): { sessions: AskFennChatSession[]; activeSessionId: string } {
  // Keep all sessions that have at least one user message (saved historical chats)
  const savedHistory = existingSessions.filter((s) =>
    s.messages.some((m) => m.sender === 'user')
  );
  const freshSession = createFreshAskFennSession(allRooms, newSessionId, createdAt);
  return {
    sessions: [freshSession, ...savedHistory],
    activeSessionId: freshSession.id,
  };
}

/**
 * Guided Viral Home Tour Studio — 5-Slot Storyboard, Alignment Gate & Gemini Structured Output Logic
 */
export type ViralSlotPacerType = 'walking' | 'counter_glide' | 'doorway_reveal';

export interface ViralTourSlotConfig {
  slotNumber: 1 | 2 | 3 | 4 | 5;
  id: string;
  title: string;
  subtitle: string;
  movementBadge: string;
  cameraCoachingOverlay: string;
  pacerType: ViralSlotPacerType;
  supportsSwap: boolean;
  isSwapped: boolean;
  alternateTitle?: string;
  alternateSubtitle?: string;
  alternateMovementBadge?: string;
  alternateCameraCoachingOverlay?: string;
  sampleThumbnailUrl: string;
  sampleVideoUrl: string;
}

export interface EntranceColumnDetectionResult {
  leftColumnDetected: boolean;
  rightColumnDetected: boolean;
  centerEntranceClear: boolean;
  leftColumnConfidence: number;
  rightColumnConfidence: number;
  entranceIdentified: boolean;
}

export interface AlignmentGateEvaluation {
  pitchDeg: number;
  rollDeg: number;
  isPitchAligned: boolean;
  isRollAligned: boolean;
  entranceColumnsDetected?: boolean;
  isAligned: boolean;
  boxColor: 'yellow' | 'green';
  coachingText: string;
}

export interface GeminiViralClipInstruction {
  slotNumber: number;
  slotTitle: string;
  trim_start: number;
  trim_end: number;
  playback_speed: number;
  overlay_badge: string;
}

export interface GeminiViralTourPlan {
  clips: GeminiViralClipInstruction[];
  hook_overlay: {
    line1_yellow: string;
    line2_white: string;
  };
  feature_callouts: string[];
  cta_overlay: string;
  voiceover_script: string;
  viral_caption: string;
  total_duration_seconds: number;
  model_used?: string;
}

export const PRE_FLIGHT_CHECKLIST_BANNER_TEXT =
  'Turn on all lights, open blinds, and close toilet lids.';

export const SLOW_COUNTDOWN_STEP_MS = 1500; // 1.5s per beat (4.5s total for 3-2-1 countdown)
export const SLOW_RECORDING_DURATION_MS = 7500; // 7.5s total recording window (slowed down from 3s/4.5s)

export function createInitialViralTourSlots(): ViralTourSlotConfig[] {
  return [
    {
      slotNumber: 1,
      id: 'slot-1',
      title: 'Video 1: The Hook Shot',
      subtitle: 'Exterior, Front Door, or Best View',
      movementBadge: '3-Step Walk-In',
      cameraCoachingOverlay:
        '0.5x Fish-Eye Lens: Frame entrance with 1 column on each side (Left & Right) to lock Green, then walk 3 slow steps forward',
      pacerType: 'walking',
      supportsSwap: false,
      isSwapped: false,
      sampleThumbnailUrl:
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80',
      sampleVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-sunlight-through-the-windows-of-a-modern-apartment-41547-large.mp4',
    },
    {
      slotNumber: 2,
      id: 'slot-2',
      title: 'Video 2: Kitchen Wide',
      subtitle: 'Main Selling Point',
      movementBadge: '3-Step Corner Push-In',
      cameraCoachingOverlay:
        '0.5x Fish-Eye Lens: Frame kitchen doorway with 1 column on each side, then walk 3 slow steps toward the island',
      pacerType: 'walking',
      supportsSwap: false,
      isSwapped: false,
      sampleThumbnailUrl:
        'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80',
      sampleVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-modern-kitchen-with-sunlight-coming-through-window-41544-large.mp4',
    },
    {
      slotNumber: 3,
      id: 'slot-3',
      title: 'Video 3: Kitchen Counter Glide',
      subtitle: 'Detail Shot',
      movementBadge: 'Zero-Walk Countertop Slide (Left to Right)',
      cameraCoachingOverlay:
        'Rest phone base on countertop, lock wrists, and glide smoothly left to right at an easy, unhurried pace',
      pacerType: 'counter_glide',
      supportsSwap: true,
      isSwapped: false,
      alternateTitle: 'Video 3: Living Room Pullback',
      alternateSubtitle: 'Alternate Angle (Swapped)',
      alternateMovementBadge: '3-Step Corner Pullback',
      alternateCameraCoachingOverlay:
        'Stand near window corner, hold phone flat against your chest, and take 3 slow pullback steps to reveal the room',
      sampleThumbnailUrl:
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80',
      sampleVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-modern-bathroom-with-mirror-and-sink-41549-large.mp4',
    },
    {
      slotNumber: 4,
      id: 'slot-4',
      title: 'Video 4: Living Room Open',
      subtitle: 'Light & Space',
      movementBadge: '3-Step Walk Toward Windows',
      cameraCoachingOverlay:
        '0.5x Fish-Eye Lens: Frame living room entrance with 1 column on each side, then walk 3 slow steps toward the windows',
      pacerType: 'walking',
      supportsSwap: false,
      isSwapped: false,
      sampleThumbnailUrl:
        'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
      sampleVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-living-room-of-a-modern-apartment-41546-large.mp4',
    },
    {
      slotNumber: 5,
      id: 'slot-5',
      title: 'Video 5: Doorway Reveal',
      subtitle: 'Primary Bedroom or Balcony',
      movementBadge: 'Plant Feet & Lean Arms Through Doorframe',
      cameraCoachingOverlay:
        '0.5x Fish-Eye Lens: Frame doorway with 1 column on each side, keep feet planted, and slowly lean arms forward',
      pacerType: 'doorway_reveal',
      supportsSwap: true,
      isSwapped: false,
      alternateTitle: 'Video 5: Amenity Highlight',
      alternateSubtitle: 'In-Unit Laundry, Patio, or En-Suite Bath',
      alternateMovementBadge: 'Slow Push-In Reveal',
      alternateCameraCoachingOverlay:
        'Keep feet planted outside the amenity alcove and slowly lean your arms forward for the reveal',
      sampleThumbnailUrl:
        'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=900&q=80',
      sampleVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-bedroom-with-a-large-bed-and-a-window-41545-large.mp4',
    },
  ];
}

export function toggleViralSlotSwap(
  slots: ViralTourSlotConfig[],
  slotNumber: number
): ViralTourSlotConfig[] {
  return slots.map((slot) => {
    if (slot.slotNumber !== slotNumber || !slot.supportsSwap) return slot;
    const nextSwapped = !slot.isSwapped;
    return {
      ...slot,
      isSwapped: nextSwapped,
    };
  });
}

/**
 * Evaluates whether an entrance is framed by 1 column on the left side and 1 column on the right side.
 */
export function detectEntranceFromSideColumns(params: {
  leftColumnScore: number;
  centerOpeningScore: number;
  rightColumnScore: number;
}): EntranceColumnDetectionResult {
  const leftConfidence = Math.max(0, Math.min(100, Math.round(params.leftColumnScore)));
  const rightConfidence = Math.max(0, Math.min(100, Math.round(params.rightColumnScore)));
  const leftColumnDetected = leftConfidence >= 18;
  const rightColumnDetected = rightConfidence >= 18;
  const centerEntranceClear = params.centerOpeningScore >= 10;
  const entranceIdentified =
    leftColumnDetected && rightColumnDetected && centerEntranceClear;

  return {
    leftColumnDetected,
    rightColumnDetected,
    centerEntranceClear,
    leftColumnConfidence: leftConfidence,
    rightColumnConfidence: rightConfidence,
    entranceIdentified,
  };
}

/**
 * Evaluates the "Green Box" Alignment Gate:
 * Turns GREEN when:
 * - Entrance sensor identifies an entrance from 1 column on each side (left column + right column), OR
 * - Desktop sensor simulation lock is enabled, OR
 * - Pitch (beta) is between 85° and 95° upright AND Roll (gamma) is within ±4°.
 */
export function evaluateCameraAlignmentGate(
  pitchBeta: number,
  rollGamma: number,
  desktopSimulationLock: boolean = false,
  entranceColumnsDetected: boolean = false
): AlignmentGateEvaluation {
  if (desktopSimulationLock) {
    return {
      pitchDeg: 90,
      rollDeg: 0,
      isPitchAligned: true,
      isRollAligned: true,
      entranceColumnsDetected: true,
      isAligned: true,
      boxColor: 'green',
      coachingText: '90° Sensor Lock Active — Hold steady for slow 3-2-1 countdown',
    };
  }

  if (entranceColumnsDetected) {
    return {
      pitchDeg: Math.round(pitchBeta * 10) / 10,
      rollDeg: Math.round(rollGamma * 10) / 10,
      isPitchAligned: true,
      isRollAligned: true,
      entranceColumnsDetected: true,
      isAligned: true,
      boxColor: 'green',
      coachingText:
        'Entrance Identified (1 Column on Each Side) — Green Sensor Locked!',
    };
  }

  const isPitchAligned = pitchBeta >= 85 && pitchBeta <= 95;
  const isRollAligned = rollGamma >= -4 && rollGamma <= 4;
  const isAligned = isPitchAligned && isRollAligned;

  let coachingText =
    'Frame entrance with 1 column on each side (Left & Right) or hold phone at 90°';
  if (!isPitchAligned && pitchBeta < 85) {
    coachingText =
      'Align Left & Right Entrance Columns in the side guides (or tilt phone up to 90°)';
  } else if (!isPitchAligned && pitchBeta > 95) {
    coachingText =
      'Align Left & Right Entrance Columns in the side guides (or tilt phone down to 90°)';
  } else if (!isRollAligned) {
    coachingText =
      'Align Left & Right Entrance Columns in the side guides & level horizon';
  } else if (isAligned) {
    coachingText = 'Locked at 90°! Keep holding steady...';
  }

  return {
    pitchDeg: Math.round(pitchBeta * 10) / 10,
    rollDeg: Math.round(rollGamma * 10) / 10,
    isPitchAligned,
    isRollAligned,
    entranceColumnsDetected: false,
    isAligned,
    boxColor: isAligned ? 'green' : 'yellow',
    coachingText,
  };
}

/**
 * Computes the rhythmic on-screen pacer prompt during the slowed-down 7.5-second recording window.
 */
export function getRecordingPacerCue(
  pacerType: ViralSlotPacerType,
  elapsedMs: number,
  totalDurationMs: number = SLOW_RECORDING_DURATION_MS
): { label: string; progressPercent: number; stepIndex: number } {
  const safeTotal = Math.max(4500, totalDurationMs);
  const clampedMs = Math.max(0, Math.min(elapsedMs, safeTotal));
  const progressPercent = Math.round((clampedMs / safeTotal) * 100);
  const beatDuration = safeTotal / 3;

  if (pacerType === 'counter_glide') {
    const step =
      clampedMs < beatDuration ? 1 : clampedMs < beatDuration * 2 ? 2 : 3;
    return {
      label: `Rest phone on counter & slide right slowly: 1... 2... 3 (Beat ${step}/3)`,
      progressPercent,
      stepIndex: step,
    };
  }

  if (pacerType === 'doorway_reveal') {
    const step =
      clampedMs < beatDuration ? 1 : clampedMs < beatDuration * 2 ? 2 : 3;
    return {
      label: `Keep feet planted — slowly lean arms through doorway: 1... 2... 3 (Beat ${step}/3)`,
      progressPercent,
      stepIndex: step,
    };
  }

  // Slowed-down Walking shots (Videos 1, 2, 4): "Hold... Step 1... Step 2... Step 3... Hold!"
  // Over 7500ms:
  // 0 - 1000ms: Hold...
  // 1000 - 3000ms (2.0s): Step 1...
  // 3000 - 5000ms (2.0s): Step 2...
  // 5000 - 6800ms (1.8s): Step 3...
  // 6800 - 7500ms: Hold!
  if (clampedMs < 1000) {
    return { label: 'Hold...', progressPercent, stepIndex: 0 };
  }
  if (clampedMs < 3000) {
    return { label: 'Step 1...', progressPercent, stepIndex: 1 };
  }
  if (clampedMs < 5000) {
    return { label: 'Step 2...', progressPercent, stepIndex: 2 };
  }
  if (clampedMs < 6800) {
    return { label: 'Step 3...', progressPercent, stepIndex: 3 };
  }
  return { label: 'Hold!', progressPercent, stepIndex: 4 };
}

/**
 * Builds the deterministic / fallback structured Gemini Viral Tour Plan for 5 clips
 */
export function buildStructuredViralTourPlan(params: {
  monthlyRent: number;
  beds: number | string;
  baths: number | string;
  neighborhood: string;
  city: string;
  amenities: string[];
  slots?: ViralTourSlotConfig[];
}): GeminiViralTourPlan {
  const rentFormatted = Number(params.monthlyRent || 1350).toLocaleString('en-US');
  const bedsLabel = String(params.beds ?? 1);
  const bathsLabel = String(params.baths ?? 1);
  const hood = (params.neighborhood || 'Mission District').trim();
  const city = (params.city || 'San Francisco').trim();
  const topAmenities = (params.amenities || []).slice(0, 2);
  const primaryFeature = (topAmenities[0] || 'Sunlit').toLowerCase();

  const badge2 = topAmenities[0]
    ? topAmenities[0].split(/\s+/).slice(0, 3).join(' ')
    : 'Sunlit Chef Kitchen';
  const badge3 = topAmenities[1]
    ? topAmenities[1].split(/\s+/).slice(0, 3).join(' ')
    : 'Quartz Counter Finishes';
  const badge4 = 'Bright Open Living';
  const ctaOverlay = "Tap 'Book Tour' to see it in person";

  const line1Yellow = `$${rentFormatted}/mo • ${bedsLabel} Bed ${bathsLabel} Bath`;
  const line2White = `${hood}, ${city}`;

  const voiceoverScript = `This ${primaryFeature} ${hood} rental is $${rentFormatted} a month—let's check it out`;
  const viralCaption = `${line1Yellow} in ${line2White} ✨ Includes ${(params.amenities || ['Private Bath', 'High-Speed WiFi']).slice(0, 3).join(' • ')}. ${ctaOverlay}! #FennRentals #${city.replace(/\s+/g, '')}Apartments #HomeTour`;

  const slotList = params.slots || createInitialViralTourSlots();

  const clips: GeminiViralClipInstruction[] = slotList.map((s) => {
    const activeTitle = s.isSwapped && s.alternateTitle ? s.alternateTitle : s.title;
    const isWalkingShot = s.pacerType === 'walking';
    let badge = line1Yellow;
    if (s.slotNumber === 2) badge = badge2;
    if (s.slotNumber === 3) badge = badge3;
    if (s.slotNumber === 4) badge = badge4;
    if (s.slotNumber === 5) badge = ctaOverlay;

    return {
      slotNumber: s.slotNumber,
      slotTitle: activeTitle,
      trim_start: 0.5,
      trim_end: 3.5,
      playback_speed: isWalkingShot ? 0.75 : 0.85,
      overlay_badge: badge,
    };
  });

  return {
    clips,
    hook_overlay: {
      line1_yellow: line1Yellow,
      line2_white: line2White,
    },
    feature_callouts: [badge2, badge3, badge4],
    cta_overlay: ctaOverlay,
    voiceover_script: voiceoverScript,
    viral_caption: viralCaption,
    total_duration_seconds: 15,
    model_used: 'gemini-3.8-flash',
  };
}

const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/**
 * Normalizes a listing's availableDate string (e.g., "Immediately", "Nov 1, 2026", "2026-11-15")
 * into a comparable YYYY-MM-DD ISO date string.
 */
export function parseRoomAvailableDateToIso(
  availableDateStr: string | undefined,
  referenceTodayIso: string = '2026-10-28'
): string {
  if (!availableDateStr) return referenceTodayIso;
  const trimmed = availableDateStr.trim();
  if (!trimmed) return referenceTodayIso;

  const lower = trimmed.toLowerCase();
  if (
    lower.includes('immediately') ||
    lower === 'now' ||
    lower.includes('available now') ||
    lower.includes('today')
  ) {
    return referenceTodayIso;
  }

  // Match YYYY-MM-DD directly
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Match "Nov 1, 2026" or "November 15, 2026" or "Dec 1 2026"
  const humanMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (humanMatch) {
    const monthKey = humanMatch[1].toLowerCase();
    const monthNum = MONTH_NAME_TO_NUMBER[monthKey];
    const dayPadded = humanMatch[2].padStart(2, '0');
    const year = humanMatch[3];
    if (monthNum) {
      return `${year}-${monthNum}-${dayPadded}`;
    }
  }

  // Fallback Date.parse
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return referenceTodayIso;
}

/**
 * Determines whether a listing is currently available (<= referenceTodayIso or "Immediately")
 * OR will be available at the target move-in date or prior (<= targetMoveInDateIso).
 */
export function isRoomAvailableOnOrBeforeMoveIn(
  availableDateStr: string | undefined,
  targetMoveInDateIso?: string,
  referenceTodayIso: string = '2026-10-28'
): boolean {
  const listingAvailableIso = parseRoomAvailableDateToIso(
    availableDateStr,
    referenceTodayIso
  );

  // If the listing is currently available now (on or before today), it is always shown
  if (listingAvailableIso <= referenceTodayIso) {
    return true;
  }

  // If a target move-in date is provided, show the listing if it is available on or before that move-in date
  if (targetMoveInDateIso && targetMoveInDateIso.trim() !== '') {
    const targetIso = parseRoomAvailableDateToIso(
      targetMoveInDateIso,
      referenceTodayIso
    );
    return listingAvailableIso <= targetIso;
  }

  // If no move-in date filter is specified, only show listings currently available
  return false;
}

export interface MasterLeaseConfig {
  landlordName: string;
  tenantName: string;
  monthlyRent: number;
  securityDeposit: number;
  leaseTerm: string;
  earliestMoveInDate: string;
  ruleMax2OvernightGuests: boolean;
  ruleQuietHoursWeekdays: boolean;
  ruleNoSmokingIndoors: boolean;
  quietHoursClause?: string;
  guestPolicyClause?: string;
  smokingAndPetsClause?: string;
  utilitiesSplitClause?: string;
}

export interface LeaseDropdownOption {
  value: string;
  label: string;
  isMasterLeaseDefault?: boolean;
}

export interface PrepopulatedRoommateLeaseOptions {
  landlordOrMasterTenantName: string;
  premisesAddress: string;
  monthlyRent: number;
  securityDeposit: number;
  defaultMoveInDate: string;
  moveInDateOptions: LeaseDropdownOption[];
  defaultLeaseTerm: string;
  leaseTermOptions: LeaseDropdownOption[];
  defaultQuietHours: string;
  quietHoursOptions: LeaseDropdownOption[];
  defaultGuestPolicy: string;
  guestPolicyOptions: LeaseDropdownOption[];
  defaultUtilitiesSplit: string;
  utilitiesSplitOptions: LeaseDropdownOption[];
  defaultSmokingAndPets: string;
  smokingAndPetsOptions: LeaseDropdownOption[];
}

function deduplicateLeaseOptions(
  primaryValue: string,
  primaryLabel: string,
  additionalOptions: { value: string; label: string }[]
): LeaseDropdownOption[] {
  const result: LeaseDropdownOption[] = [
    {
      value: primaryValue,
      label: primaryLabel,
      isMasterLeaseDefault: true,
    },
  ];

  for (const opt of additionalOptions) {
    if (
      !result.some(
        (existing) =>
          existing.value.trim().toLowerCase() === opt.value.trim().toLowerCase()
      )
    ) {
      result.push({
        value: opt.value,
        label: opt.label,
        isMasterLeaseDefault: false,
      });
    }
  }
  return result;
}

/**
 * Prepopulates all dropdown options and default selections for the Renter's
 * Interactive Roommate Lease Generator based on the Landlord / Master Tenant lease
 * and the room listing's house rules, lease term, availability, and amenities.
 */
export function buildPrepopulatedRoommateLeaseOptions(
  room?: {
    title?: string;
    price?: number;
    deposit?: number;
    location?: string;
    leaseTerm?: string;
    availableDate?: string;
    amenities?: string[];
    houseRules?: string[];
    host?: { name?: string };
  } | null,
  masterLease?: Partial<MasterLeaseConfig> | null
): PrepopulatedRoommateLeaseOptions {
  const landlordOrMasterTenantName =
    room?.host?.name || masterLease?.landlordName || 'Sarah Miller';
  const premisesAddress =
    room?.location || 'Mission District, San Francisco, CA';
  const monthlyRent = room?.price ?? masterLease?.monthlyRent ?? 1450;
  const securityDeposit = room?.deposit ?? masterLease?.securityDeposit ?? 1200;

  const rules = room?.houseRules || [];
  const amenities = room?.amenities || [];

  // 1. Move-In Date Dropdown Options (prepopulated from Landlord/Master Tenant availableDate)
  const rawAvail = room?.availableDate || masterLease?.earliestMoveInDate || 'Nov 1, 2026';
  const isImmediate = rawAvail.toLowerCase().includes('immediately');
  const earliestIso = isImmediate
    ? masterLease?.earliestMoveInDate || '2026-11-01'
    : parseRoomAvailableDateToIso(rawAvail, '2026-10-28');

  const primaryMoveInLabel = isImmediate
    ? `${earliestIso} (Master Lease Default • Available Immediately)`
    : `${earliestIso} (Master Lease Default • Available ${rawAvail})`;

  const candidateMoveInDates = [
    { value: '2026-10-28', label: '2026-10-28 (Immediate Move-In)' },
    { value: '2026-11-01', label: '2026-11-01 (Nov 1 Move-In)' },
    { value: '2026-11-15', label: '2026-11-15 (Mid-November Move-In)' },
    { value: '2026-12-01', label: '2026-12-01 (Dec 1 Move-In)' },
    { value: '2027-01-01', label: '2027-01-01 (Jan 1 Move-In)' },
  ].filter((d) => isImmediate || d.value >= earliestIso);

  const moveInDateOptions = deduplicateLeaseOptions(
    earliestIso,
    primaryMoveInLabel,
    candidateMoveInDates
  );

  // 2. Lease Term Dropdown Options (prepopulated from Master Lease term)
  const defaultLeaseTerm =
    room?.leaseTerm || masterLease?.leaseTerm || '6 Months';
  const leaseTermOptions = deduplicateLeaseOptions(
    defaultLeaseTerm,
    `${defaultLeaseTerm} (Master Lease Default)`,
    [
      { value: '6 Months', label: '6 Months (Standard Roommate Term)' },
      { value: '12+ Months', label: '12+ Months (Full Master Lease Term)' },
      { value: '3 Months', label: '3 Months (Quarterly Sublease)' },
      { value: 'Month-to-month', label: 'Month-to-month (Flexible Extension)' },
    ]
  );

  // 3. Quiet Hours Clause Dropdown Options (prepopulated from Master Lease & houseRules)
  const roomQuietRule = rules.find((r) => /quiet|noise|night|10|pm/i.test(r));
  const masterQuietClause =
    masterLease?.quietHoursClause ||
    (masterLease?.ruleQuietHoursWeekdays === false
      ? 'Flexible respectful hours agreed by housemates'
      : roomQuietRule || '10:00 PM – 8:00 AM Sun–Thu, 11:30 PM – 9:00 AM Fri–Sat');

  const quietHoursOptions = deduplicateLeaseOptions(
    masterQuietClause,
    `${masterQuietClause} (Master Lease Default)`,
    [
      {
        value: '10:00 PM – 8:00 AM Sun–Thu, 11:30 PM – 9:00 AM Fri–Sat',
        label: '10:00 PM – 8:00 AM Sun–Thu, 11:30 PM – 9:00 AM Fri–Sat',
      },
      {
        value: '10:00 PM – 7:30 AM Weeknights',
        label: '10:00 PM – 7:30 AM Weeknights',
      },
      {
        value: '11:00 PM – 8:00 AM Daily',
        label: '11:00 PM – 8:00 AM Daily',
      },
      {
        value: 'Flexible respectful hours agreed by housemates',
        label: 'Flexible respectful hours agreed by housemates',
      },
    ]
  );

  // 4. Overnight Guest Policy Dropdown Options (prepopulated from Master Lease & houseRules)
  const roomGuestRule = rules.find((r) => /guest|overnight|visitor/i.test(r));
  const masterGuestClause =
    masterLease?.guestPolicyClause ||
    roomGuestRule ||
    (masterLease?.ruleMax2OvernightGuests === false
      ? 'Overnight guests permitted with 24-hour heads-up in house chat'
      : 'No overnight guests more than 2 nights a week without prior notice');

  const guestPolicyOptions = deduplicateLeaseOptions(
    masterGuestClause,
    `${masterGuestClause} (Master Lease Default)`,
    [
      {
        value: 'No overnight guests more than 2 nights a week without prior notice',
        label: 'Max 2 nights/week without prior notice',
      },
      {
        value: 'Up to 2 nights/week with 24h heads-up',
        label: 'Up to 2 nights/week with 24h heads-up',
      },
      {
        value: 'Overnight guests permitted with 24-hour heads-up in house chat',
        label: 'Permitted with 24h heads-up in house chat',
      },
      {
        value: 'Weekends welcome with roommate notice',
        label: 'Weekends welcome with roommate notice',
      },
      {
        value: 'No overnight guests without prior approval',
        label: 'No overnight guests without prior approval',
      },
    ]
  );

  // 5. Utilities Split Mode Dropdown Options (prepopulated from Master Lease & room amenities)
  const hasUtilitiesIncluded =
    amenities.some((a) => a.toLowerCase().includes('utilities')) ||
    rules.some((r) => r.toLowerCase().includes('utilities'));

  const masterUtilitiesClause =
    masterLease?.utilitiesSplitClause ||
    (hasUtilitiesIncluded
      ? '100% Utilities & Gigabit Fiber Included in Base Monthly Rent'
      : 'Split 3-ways automatically via House OS AI Bill Splitter');

  const utilitiesSplitOptions = deduplicateLeaseOptions(
    masterUtilitiesClause,
    `${masterUtilitiesClause} (Master Lease Default)`,
    [
      {
        value: 'Split 3-ways automatically via House OS AI Bill Splitter',
        label: 'Split 3-ways automatically via House OS AI Bill Splitter',
      },
      {
        value: '100% Utilities & Gigabit Fiber Included in Base Monthly Rent',
        label: '100% Utilities & Gigabit Fiber Included in Base Monthly Rent',
      },
      {
        value: 'High-speed Fiber Wi-Fi included; PG&E split evenly',
        label: 'High-speed Fiber Wi-Fi included; PG&E split evenly',
      },
    ]
  );

  // 6. Smoking, Pets & House Rule Addendum Dropdown Options (prepopulated from Master Lease & houseRules)
  const roomSmokeRule = rules.find((r) => /smok|vape/i.test(r));
  const roomPetRule =
    rules.find((r) => /pet|dog|cat/i.test(r)) ||
    (amenities.some((a) => a.toLowerCase().includes('pet'))
      ? 'Friendly cats or small dogs welcome'
      : undefined);

  const combinedMasterSmokePet = [
    masterLease?.ruleNoSmokingIndoors === false
      ? 'Outdoor patio smoking only'
      : roomSmokeRule || 'Strictly 100% smoke-free & vape-free indoors',
    roomPetRule,
  ]
    .filter(Boolean)
    .join(' • ');

  const masterSmokingAndPets =
    masterLease?.smokingAndPetsClause ||
    combinedMasterSmokePet ||
    'Strictly 100% smoke-free & vape-free indoors';

  const smokingAndPetsOptions = deduplicateLeaseOptions(
    masterSmokingAndPets,
    `${masterSmokingAndPets} (Master Lease Default)`,
    [
      {
        value: 'Strictly 100% smoke-free & vape-free indoors',
        label: 'Strictly 100% smoke-free & vape-free indoors',
      },
      {
        value:
          'No indoor smoking or vaping • Friendly cats or hypoallergenic small dogs welcome',
        label: 'Smoke-free indoors • Friendly cats/small dogs welcome',
      },
      {
        value: 'Outdoor patio smoking only • Pet-free common areas',
        label: 'Outdoor patio smoking only • Pet-free common areas',
      },
    ]
  );

  return {
    landlordOrMasterTenantName,
    premisesAddress,
    monthlyRent,
    securityDeposit,
    defaultMoveInDate: earliestIso,
    moveInDateOptions,
    defaultLeaseTerm,
    leaseTermOptions,
    defaultQuietHours: masterQuietClause,
    quietHoursOptions,
    defaultGuestPolicy: masterGuestClause,
    guestPolicyOptions,
    defaultUtilitiesSplit: masterUtilitiesClause,
    utilitiesSplitOptions,
    defaultSmokingAndPets: masterSmokingAndPets,
    smokingAndPetsOptions,
  };
}

export interface AiLoadedPictureInfo {
  id?: string;
  label: string;
  url?: string;
  visualCue?: string;
  base64Data?: string;
  mimeType?: string;
}

export interface AiListingCopyInput {
  neighborhood: string;
  city: string;
  roomType: string;
  beds: number;
  baths: number;
  monthlyRent: number;
  squareFeet: number;
  leaseTerm: string;
  amenities: string[];
  loadedPictures?: AiLoadedPictureInfo[];
}

export interface AiListingCopyOutput {
  title: string;
  description: string;
  locationContext: string;
  analyzedPicturesSummary: string;
  loadedPicturesCount: number;
}

const CITY_VIBE_DESCRIPTIONS: Record<string, string> = {
  'San Francisco':
    'steps from sunny neighborhood cafes, artisanal bakeries, BART/Muni transit corridors, and local parks',
  'New York':
    'minutes from subway express lines, neighborhood coffee roasters, tree-lined blocks, and local dining',
  Austin:
    'close to greenbelt trails, local food trucks, live music venues, and walkable neighborhood coffee shops',
  Seattle:
    'near Link light rail, indie espresso bars, neighborhood farmers markets, and lush city parks',
  Chicago:
    'blocks from the L train, historic boulevard parks, neighborhood cafes, and vibrant dining spots',
  'Los Angeles':
    'surrounded by palm-lined streets, indoor-outdoor cafes, local markets, and sunny West Coast living',
};

/**
 * Synthesizes location details (neighborhood, city, transit/walkability) and visual
 * cues from the loaded pictures into an AI auto-filled Listing Title and Description.
 */
export function generateAiListingTitleAndDescription(
  input: AiListingCopyInput
): AiListingCopyOutput {
  const neighborhood = (input.neighborhood || 'Mission District').trim();
  const city = (input.city || 'San Francisco').trim();
  const roomType = (input.roomType || 'Private Room').trim();
  const beds = Number(input.beds) || 1;
  const baths = Number(input.baths) || 1;
  const monthlyRent = Number(input.monthlyRent) || 1450;
  const squareFeet = Number(input.squareFeet) || 220;
  const leaseTerm = (input.leaseTerm || '6 Months').trim();
  const amenities =
    Array.isArray(input.amenities) && input.amenities.length > 0
      ? input.amenities
      : ['Private Bath', 'In-Unit W/D', 'High-Speed WiFi'];
  const pictures = Array.isArray(input.loadedPictures) ? input.loadedPictures : [];

  const topTwoAmenities = amenities.slice(0, 2);
  const amenityHighlight =
    topTwoAmenities.length > 0 ? topTwoAmenities.join(' & ') : 'Modern Finishes';

  const pictureLabels = pictures
    .map((p) => p.visualCue || p.label)
    .filter(Boolean);

  const hasKitchenPic = pictureLabels.some((l) => /kitchen|counter|island|chef/i.test(l));
  const hasLightOrLivingPic = pictureLabels.some((l) =>
    /light|window|living|sun|hook|exterior|view/i.test(l)
  );
  const hasBedroomOrDoorwayPic = pictureLabels.some((l) =>
    /bedroom|balcony|doorway|suite|patio/i.test(l)
  );

  const visualAdjective = hasLightOrLivingPic
    ? 'Sunlit'
    : hasKitchenPic
    ? 'Chef-Ready'
    : 'Bright';

  const title = `${visualAdjective} ${neighborhood} ${roomType} • ${amenityHighlight}`;

  const cityVibe =
    CITY_VIBE_DESCRIPTIONS[city] ||
    'conveniently located near walkable cafes, local markets, and daily transit';

  const pictureHighlightsText =
    pictureLabels.length > 0
      ? `Visual highlights from the ${pictureLabels.length} loaded listing photos showcase ${pictureLabels
          .slice(0, 4)
          .join(', ')}${
          hasBedroomOrDoorwayPic
            ? ' with inviting natural light and clean architectural lines'
            : ' with warm hardwood tones and modern finishes'
        }.`
      : 'Loaded property visuals showcase abundant natural light, modern kitchen finishes, and spacious living areas.';

  const description = `Welcome to this ${visualAdjective.toLowerCase()} ${squareFeet} sq ft ${roomType.toLowerCase()} (${beds} Bed / ${baths} Bath) in the heart of ${neighborhood}, ${city}—${cityVibe}. ${pictureHighlightsText} Offered at $${monthlyRent.toLocaleString(
    'en-US'
  )}/mo on a ${leaseTerm} lease, featuring ${amenities.join(', ')}.`;

  return {
    title,
    description,
    locationContext: `${neighborhood}, ${city}`,
    analyzedPicturesSummary:
      pictureLabels.length > 0
        ? `Analyzed ${pictureLabels.length} loaded pictures (${pictureLabels.slice(0, 3).join(', ')})`
        : 'Analyzed default room tour visuals',
    loadedPicturesCount: pictures.length,
  };
}


