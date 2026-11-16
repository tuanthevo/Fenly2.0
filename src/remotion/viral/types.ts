/**
 * Fenly Viral Tour: shared types.
 *
 * The edit plan is plain JSON. plan.ts builds it from the host's clips, the
 * listing details and (optionally) AI hints; FenlyViralTour.tsx renders it with
 * Remotion. Keeping the plan serializable lets the same plan drive the in-app
 * <Player>, the in-browser MP4 export and a server render.
 */

export type ViralStyleId = 'price-hook' | 'guess-rent' | 'pov';
export type ViralPace = 'snappy' | 'balanced' | 'relaxed';
export type ViralCutKind = 'whip-left' | 'whip-right' | 'zoom-through' | 'flash' | 'light-leak';
export type ViralShotRole = 'hook' | 'tour' | 'closer';
export type ViralSfxKind = 'whoosh' | 'pop' | 'ding';

export type ViralListingInfo = {
  monthlyRent: number;
  beds: number | string;
  baths: number | string;
  neighborhood: string;
  city: string;
  /** RoomListing['roomType'], e.g. "Private Room" */
  roomType?: string;
  squareFeet?: number;
  amenities: string[];
};

/** One measurement per sampled frame, from the local clip analyzer (clipSignals.ts). */
export type ClipSample = {
  /** Seconds into the source clip */
  t: number;
  /** Mean luma, 0..1 */
  luma: number;
  /** Mean gradient magnitude at 72x128: fine edges and texture */
  detail: number;
  /** Std-dev of an 18x32 thumbnail: large shapes, bright windows vs dark furniture */
  structure: number;
  /** Correlation of the 18x32 thumbnail with the previous sample (-1..1, 0 when blank) */
  corr: number;
  /** Mean absolute luma change vs the previous sample */
  motion: number;
  /** min/max edge detail across 3 vertical strips (low = a wall or door edge fills part of the frame) */
  balance: number;
};

export type ClipWarningKind = 'dark' | 'shaky' | 'blank' | 'short' | 'ai';

export type ClipWarning = {
  slotNumber: number;
  kind: ClipWarningKind;
  /** 'retake' shows a Quick Retake button; 'fixed' means the editor already handled it */
  severity: 'retake' | 'fixed';
  tip: string;
};

export type ClipWindow = {
  startSec: number;
  endSec: number;
  score: number;
  meanLuma: number;
  meanCorr: number;
  minCorr: number;
};

export type ClipAnalysis = {
  durationSec: number;
  sampleFps: number;
  /** The cleanest stretch of footage (bright, steady, no wall or door edge filling the frame) */
  best: ClipWindow;
  /** Exposure correction in stops for colorCorrection(), -0.25..0.6 */
  exposureBoost: number;
  /** 0..1 usefulness of the best window */
  quality: number;
  /** Used to pick the opening (hook) shot */
  hookScore: number;
  warnings: Omit<ClipWarning, 'slotNumber'>[];
};

export type ViralClipInput = {
  /** Guided shot slot 1..5 */
  slotNumber: number;
  /** Guided shot name, e.g. "Kitchen & Shared Space" */
  room: string;
  /** blob:, https: or staticFile() URL */
  src: string;
  durationSec: number;
  isLandscape?: boolean;
  analysis?: ClipAnalysis | null;
};

/**
 * Optional AI output (Gemini). Every field is optional; anything missing falls
 * back to the local rules, so the editor works with no network at all.
 */
export type ViralAiHints = {
  /** Price-hook headline that uses the real rent and neighborhood */
  hookText?: string;
  /** Best opener */
  hookSlotNumber?: number;
  /** 2-3 word callout per slot, e.g. { 3: 'Double vanity' } */
  tags?: Record<number, string>;
  perkLabel?: string;
  /** Cleanest window per slot, in source seconds; speed = playback multiplier */
  windows?: Record<number, { startSec: number; endSec?: number; speed?: number }>;
  warnings?: { slotNumber: number; tip: string }[];
  socialCaption?: string;
};

export type HookSegment = { text: string; em?: 'price' | 'place' };

export type HookCopy = {
  kicker: string;
  segments: HookSegment[];
  /** Plain text of the headline (segments joined) */
  text: string;
};

export type ViralShot = {
  id: string;
  slotNumber: number;
  room: string;
  src: string;
  role: ViralShotRole;
  /** Where playback starts inside the source clip, on the fps grid */
  srcStartSec: number;
  playbackRate: number;
  /** Frames this shot occupies, including the overlap with the next transition */
  durationInFrames: number;
  /** Absolute frame where the shot appears */
  startFrame: number;
  /** Frames of overlap with the previous shot (transition into this shot) */
  inOverlapFrames: number;
  /** Frames of overlap with the next shot (transition out of this shot) */
  outOverlapFrames: number;
  /** Exposure correction in stops */
  exposure: number;
  /** Room callout, e.g. "Private bath" (empty for the hook shot) */
  tag: string;
  /** Small label above the closer's callout, e.g. "THE BEST PART" */
  kicker: string;
  /** Local frame (inside the shot) where the callout pops in */
  tagInFrame: number;
  isLandscape: boolean;
};

export type ViralCut = {
  kind: ViralCutKind;
  /** Transition length, or overlay length for flash / light-leak cuts */
  durationInFrames: number;
  /** Frames the two shots overlap (0 for overlay cuts) */
  overlapFrames: number;
  /** Absolute frame where the next shot appears */
  atFrame: number;
};

export type ViralSfxCue = { kind: ViralSfxKind; atFrame: number; volume: number };

export type ViralEndCard = {
  fromFrame: number;
  durationInFrames: number;
  lead: string;
  big: string;
  tail: string;
  sub: string;
  brand: string;
};

export type ViralEditPlan = {
  version: 1;
  fps: number;
  width: number;
  height: number;
  style: ViralStyleId;
  pace: ViralPace;
  hook: HookCopy;
  hookFontSize: number;
  /** Absolute frame where the hook headline starts to leave */
  hookExitFrame: number;
  hookExitFrames: number;
  priceLabel: string;
  placeLabel: string;
  specsLabel: string;
  /** Hide the price on screen until the end card (guess-the-rent style) */
  hidePriceUntilEnd: boolean;
  /** Absolute frame where the persistent price chip appears */
  priceChipFromFrame: number;
  rehook: { text: string; fromFrame: number; durationInFrames: number } | null;
  endCard: ViralEndCard;
  loopBridgeFrames: number;
  shots: ViralShot[];
  /** cuts[i] sits between shots[i] and shots[i + 1] */
  cuts: ViralCut[];
  sfx: ViralSfxCue[];
  totalFrames: number;
  audio: {
    keepRoomSound: boolean;
    roomSoundVolume: number;
    sfxEnabled: boolean;
    music: { src: string; volume: number; startSec: number; bpm: number | null } | null;
  };
  showWatermark: boolean;
  /** WebGL effects (color grade, motion blur, light leak). Turn off where WebGL2 is missing. */
  enableEffects: boolean;
  /** Ready-to-paste caption (not rendered into the video) */
  caption: string;
  warnings: ClipWarning[];
};

export type BuildViralPlanInput = {
  listing: ViralListingInfo;
  clips: ViralClipInput[];
};

export type BuildViralPlanOptions = {
  style?: ViralStyleId;
  pace?: ViralPace;
  /** Host override for the opening shot */
  hookSlotNumber?: number | null;
  /** Host-edited headline; replaces the generated one */
  hookTextOverride?: string | null;
  /** Host-edited callouts per slot */
  tagOverrides?: Record<number, string>;
  /** Host-edited closer callout */
  perkOverride?: string | null;
  ai?: ViralAiHints | null;
  keepRoomSound?: boolean;
  sfx?: boolean;
  music?: { src: string; volume?: number; startSec?: number; bpm?: number | null } | null;
  showWatermark?: boolean;
  enableEffects?: boolean;
  fps?: number;
};
