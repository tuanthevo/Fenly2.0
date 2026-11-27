/**
 * Guided 5-Shot Video Capture — shot list, timing and beginner guardrails.
 * Pure logic only (no DOM) so it can be unit tested.
 */
import type { ViralTourSlotConfig } from './trustSafety';

export interface GuidedShot {
  slotNumber: 1 | 2 | 3 | 4 | 5;
  name: string;
  instruction: string;
  /** One slow move made standing still (arms or hips); neighbouring shots differ so the video never repeats one */
  move: 'slide' | 'push' | 'turn';
  /** Short beat shown inside the camera while recording */
  movementCue: string;
  sampleThumbnailUrl: string;
}

export const GUIDED_SHOTS: GuidedShot[] = [
  {
    slotNumber: 1,
    name: 'Bedroom Hook',
    move: 'slide',
    instruction:
      'Turn ALL lights on & open blinds. Stand in the bedroom doorway, feet planted, and slide the phone slowly left to right (at least 10 sec).',
    movementCue: 'Feet planted • slide slowly left to right',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 2,
    name: 'Kitchen & Shared Space',
    move: 'turn',
    instruction: 'Stand in one spot at the kitchen entrance and turn slowly from the hips, left to right (at least 10 sec).',
    movementCue: 'Stay in one spot • turn slowly',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 3,
    name: 'Bathroom Peek',
    move: 'push',
    instruction:
      'Stand at the open bathroom door and reach the phone slowly forward. Keep yourself out of the mirror (at least 10 sec).',
    movementCue: 'Reach the phone slowly forward • stay out of the mirror',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 4,
    name: 'Closet & Storage',
    move: 'slide',
    instruction: 'Open the closet doors wide. Feet planted, slide the phone slowly right to left (at least 10 sec).',
    movementCue: 'Feet planted • slide slowly right to left',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 5,
    name: 'Standout Perk',
    move: 'push',
    instruction:
      'Stand close to the best perk (in-unit laundry, balcony, parking or a sunny view). Reach the phone slowly toward it, then hold (at least 10 sec).',
    movementCue: 'Reach slowly toward it, then hold',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80',
  },
];

/** Hosts film standing still: walking shakes the camera (host's rule, Nov 2026). */
export const GUIDED_PRE_SHOT_REMINDER = 'Lights on • Feet planted • One slow move';
export const GUIDED_COUNTDOWN_STEP_MS = 1000;
/**
 * 15 s per shot; hosts are told "at least 10 sec" (SHOT_GUIDE_SEC). The Fenn edit keeps the
 * steadiest 3-5 s of each clip, and a clip with 8.5 s+ of clean footage gives its room two shots.
 * The older full tour needs the length: with 3+ clips it runs 30-50 s (plan.ts).
 */
export const GUIDED_RECORDING_MS = 15000;
export const MIN_CLIP_DURATION_SEC = 2;
/** What hosts are told to film per shot (host's call, Nov 2026); longer is welcome, the editor uses it */
export const SHOT_GUIDE_SEC = 10;
export const MIN_SHOTS_TO_PROCEED = 3;

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
      error: `This clip is only ${durationSec.toFixed(1)}s. Pick one that's at least ${MIN_CLIP_DURATION_SEC} seconds long.`,
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

export function canProceedWithShots(media: Record<number, unknown>): boolean {
  return countCompletedShots(media) >= MIN_SHOTS_TO_PROCEED;
}

/** The first shot without a clip, used to highlight the next card. */
export function nextShotToCapture(media: Record<number, unknown>): number | null {
  const next = GUIDED_SHOTS.find((s) => !media[s.slotNumber]);
  return next ? next.slotNumber : null;
}

/* ---------------- Fenly 2.0 Quick Tour ---------------- */

/**
 * Quick Tour: 3 shots of 15 s (room, shared space, bathroom); 2 optional extras for the full tour.
 * 15 s like the guided tour, so 3 shots alone reach the 30 s minimum (see GUIDED_RECORDING_MS).
 */
export const QUICK_RECORDING_MS = 15000;
export const QUICK_SHOT_SLOTS: readonly GuidedShot['slotNumber'][] = [1, 2, 3];
export const EXTRA_SHOT_SLOTS: readonly GuidedShot['slotNumber'][] = [4, 5];

export type CaptureMode = 'guided' | 'quick';

export function shotsForMode(mode: CaptureMode, includeExtras = false): GuidedShot[] {
  if (mode === 'guided') return GUIDED_SHOTS;
  const slots = includeExtras ? [...QUICK_SHOT_SLOTS, ...EXTRA_SHOT_SLOTS] : QUICK_SHOT_SLOTS;
  return GUIDED_SHOTS.filter((shot) => slots.includes(shot.slotNumber));
}

export function recordingMsFor(mode: CaptureMode): number {
  return mode === 'quick' ? QUICK_RECORDING_MS : GUIDED_RECORDING_MS;
}

/**
 * The shot's instruction with its clip length set to exactly `seconds`, for the in-app
 * recorder, which stops by itself. The cards show shot.instruction ("at least 10 sec").
 */
export function instructionFor(shot: GuidedShot, seconds: number): string {
  return shot.instruction.replace(/\((?:at least )?\d+(?:\.\d+)?\s*sec\)/i, `(${seconds} sec)`);
}
