/**
 * Guided 5-Shot Video Capture — shot list, timing and beginner guardrails.
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
    name: 'Bedroom Hook',
    instruction:
      'Turn ALL lights on & open blinds. Stand at the bedroom doorway and walk slowly in, about 5 small steps (7 sec).',
    movementCue: '5 slow steps in',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 2,
    name: 'Kitchen & Shared Space',
    instruction:
      'Stand at the kitchen entrance and walk slowly toward the island or counter (7 sec).',
    movementCue: 'Walk slowly toward the counter',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 3,
    name: 'Bathroom Peek',
    instruction:
      'Step slowly toward the open bathroom door, then hold still—keep yourself out of the mirror (7 sec).',
    movementCue: 'Step toward the door • stay out of the mirror',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 4,
    name: 'Closet & Storage',
    instruction: 'Open the closet doors wide, take 2 slow steps forward, then hold still (7 sec).',
    movementCue: '2 slow steps, then hold',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
  },
  {
    slotNumber: 5,
    name: 'Standout Perk',
    instruction:
      'Walk slowly toward the best perk—in-unit laundry, balcony, parking, or sunny view—then hold on it (7 sec).',
    movementCue: 'Walk to the perk, then hold',
    sampleThumbnailUrl:
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80',
  },
];

export const GUIDED_PRE_SHOT_REMINDER = "Lights ON • Walk forward • Don't pan side-to-side";
export const GUIDED_COUNTDOWN_STEP_MS = 1000;
/**
 * 7 s per shot gives the editor ~5 s of clean footage per room for the ~30 s
 * full tour (the first moment of each clip is the tap-to-record shake).
 */
export const GUIDED_RECORDING_MS = 7000;
export const MIN_CLIP_DURATION_SEC = 2;
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
