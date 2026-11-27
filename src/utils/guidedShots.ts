/**
 * Guided video capture: the shot list, timing and beginner guardrails.
 * Four areas are required (host's rule, Nov 2026): bedroom, kitchen, shared space
 * (living room) and bathroom. The fifth shot, the best perk, is optional.
 * Slot numbers are fixed (they name saved clips); SHOT_ORDER is how they're shown.
 * Pure logic only (no DOM) so it can be unit tested.
 */
import type { ViralTourSlotConfig } from './trustSafety';

export interface GuidedShot {
  slotNumber: 1 | 2 | 3 | 4 | 5;
  name: string;
  instruction: string;
  /** Short beat shown inside the camera while recording */
  movementCue: string;
  sampleThumbnailUrl: string;
}

export const GUIDED_SHOTS: GuidedShot[] = [
  {
    slotNumber: 1,
    name: 'Bedroom',
    instruction:
      'Turn ALL lights on & open blinds. Stand at the bedroom doorway and walk slowly in, about 5 small steps (5-15 sec).',
    movementCue: '5 slow steps in',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 2,
    name: 'Kitchen',
    instruction:
      'Stand at the kitchen entrance and walk slowly toward the island or counter (5-15 sec).',
    movementCue: 'Walk slowly toward the counter',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 3,
    name: 'Bathroom',
    instruction:
      'Step slowly toward the open bathroom door, then hold still—keep yourself out of the mirror (5-15 sec).',
    movementCue: 'Step toward the door • stay out of the mirror',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 4,
    name: 'Shared Space (Living Room)',
    instruction: 'Turn the lights on. Stand at the edge of the living room and walk slowly toward the sofa or the window (5-15 sec).',
    movementCue: 'Walk slowly into the room',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 5,
    name: 'Standout Perk',
    instruction:
      'Walk slowly toward the best perk—closet, in-unit laundry, balcony, parking, or sunny view—then hold on it (5-15 sec).',
    movementCue: 'Walk to the perk, then hold',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80',
  },
];

export const GUIDED_PRE_SHOT_REMINDER = "Lights ON • Walk forward • Don't pan side-to-side";
export const GUIDED_COUNTDOWN_STEP_MS = 1000;
/**
 * 15 s per shot. The host's rule (Nov 2026): with 3+ clips a tour runs 30-50 s
 * (plan.ts MIN_TOUR_TOTAL_SEC / MAX_TOUR_TOTAL_SEC). Real phone clips keep only
 * ~55-70% clean footage (tap-to-record shake, doorways), and 3 clips need ~9 s
 * of it each to reach 30 s; 10 s clips gave ~24 s. Past 50 s the editor plays
 * rooms a little faster rather than cut footage.
 */
export const GUIDED_RECORDING_MS = 15000;
/** Each clip should run 5-15 seconds (host's rule, Nov 2026). Shorter clips are turned away; longer ones are used. */
export const MIN_CLIP_DURATION_SEC = 5;
export const MAX_CLIP_GUIDE_SEC = 15;
export const SHOT_LENGTH_LABEL = `${MIN_CLIP_DURATION_SEC}-${MAX_CLIP_GUIDE_SEC}`;
/** The four areas every tour needs, in the order they're shown: bedroom, kitchen, living room, bathroom */
export const REQUIRED_SHOT_SLOTS: readonly GuidedShot['slotNumber'][] = [1, 2, 4, 3];
export const MIN_SHOTS_TO_PROCEED = REQUIRED_SHOT_SLOTS.length;
/** Display order of every shot: the required four, then the optional perk */
export const SHOT_ORDER: readonly GuidedShot['slotNumber'][] = [1, 2, 4, 3, 5];
const inOrder = (slots: readonly GuidedShot['slotNumber'][]): GuidedShot[] =>
  slots.map((slot) => GUIDED_SHOTS.find((s) => s.slotNumber === slot)!);

/**
 * Slot configs for the 5 guided shots, in the shape the Gemini tour generator
 * and the publish step already use.
 */
export function createGuidedShotSlots(): ViralTourSlotConfig[] {
  return GUIDED_SHOTS.map((shot) => ({
    slotNumber: shot.slotNumber,
    id: `guided-shot-${shot.slotNumber}`,
    title: `Shot ${shot.slotNumber}: ${shot.name}`,
    subtitle: shot.movementCue,
    movementBadge: shot.movementCue,
    cameraCoachingOverlay: shot.instruction,
    pacerType: 'walking',
    supportsSwap: false,
    isSwapped: false,
    sampleThumbnailUrl: shot.sampleThumbnailUrl,
    sampleVideoUrl: '',
  }));
}

export function isLandscape(width: number, height: number): boolean {
  return width > 0 && height > 0 && width > height;
}

export interface CameraRollClipCheck {
  accepted: boolean;
  isLandscape: boolean;
  /** Error shown when the clip is rejected */
  error?: string;
  /** Gentle note shown when the clip is accepted but will be cropped */
  warning?: string;
}

/** Validates an existing clip picked from the camera roll. */
export function checkCameraRollClip(meta: {
  durationSec: number;
  width: number;
  height: number;
}): CameraRollClipCheck {
  const { durationSec, width, height } = meta;
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return {
      accepted: false,
      isLandscape: false,
      error: "We couldn't read this clip. Try another one, or record a guided clip instead.",
    };
  }
  if (durationSec < MIN_CLIP_DURATION_SEC) {
    return {
      accepted: false,
      isLandscape: false,
      error: `This clip is only ${durationSec.toFixed(1)}s. Each clip needs to be ${SHOT_LENGTH_LABEL} seconds long.`,
    };
  }
  const landscape = isLandscape(width, height);
  return {
    accepted: true,
    isLandscape: landscape,
    warning: landscape
      ? "This clip is sideways, so we'll center-crop it to vertical. Filming upright next time keeps more of the room in frame."
      : undefined,
  };
}

/** Counts shots that have a saved clip. */
export function countCompletedShots(media: Record<number, unknown>): number {
  return GUIDED_SHOTS.filter((s) => Boolean(media[s.slotNumber])).length;
}

/** Required areas that still have no clip, in display order. */
export function missingRequiredShots(media: Record<number, unknown>): GuidedShot[] {
  return inOrder(REQUIRED_SHOT_SLOTS).filter((s) => !media[s.slotNumber]);
}

/** All four required areas are filmed (the perk is optional). */
export function canProceedWithShots(media: Record<number, unknown>): boolean {
  return missingRequiredShots(media).length === 0;
}

/** The first shot without a clip (in display order), used to highlight the next card. */
export function nextShotToCapture(media: Record<number, unknown>): number | null {
  const next = inOrder(SHOT_ORDER).find((s) => !media[s.slotNumber]);
  return next ? next.slotNumber : null;
}

/* ---------------- Fenly 2.0 Quick Tour ---------------- */

/**
 * Quick Tour (Fill): the four required areas, plus the optional perk shot.
 * The in-app recorder (computers) stops at 15 s, the top of the 5-15 s range.
 */
export const QUICK_RECORDING_MS = 15000;
export const QUICK_SHOT_SLOTS: readonly GuidedShot['slotNumber'][] = REQUIRED_SHOT_SLOTS;
export const EXTRA_SHOT_SLOTS: readonly GuidedShot['slotNumber'][] = [5];

export type CaptureMode = 'guided' | 'quick';

export function shotsForMode(mode: CaptureMode, includeExtras = false): GuidedShot[] {
  if (mode === 'guided') return inOrder(SHOT_ORDER);
  return inOrder(includeExtras ? [...QUICK_SHOT_SLOTS, ...EXTRA_SHOT_SLOTS] : QUICK_SHOT_SLOTS);
}

export function recordingMsFor(mode: CaptureMode): number {
  return mode === 'quick' ? QUICK_RECORDING_MS : GUIDED_RECORDING_MS;
}

/**
 * The shot's instruction with its clip length set to exactly `seconds`, for the in-app
 * recorder, which stops by itself. The cards show shot.instruction ("5-15 sec").
 */
export function instructionFor(shot: GuidedShot, seconds: number): string {
  return shot.instruction.replace(/\((?:at least )?\d+(?:-\d+)?(?:\.\d+)?\s*sec\)/i, `(${seconds} sec)`);
}
