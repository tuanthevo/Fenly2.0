/**
 * Lighting presets and sliders for the viral tour. Pure functions: the host's
 * choice (-1..1 per control) becomes colorCorrection() values that the WebGL
 * grade already applies to every frame, so changing the look costs nothing
 * extra in the preview or the export.
 */
import type { ViralLook } from './types';

export const NATURAL_LOOK: ViralLook = { brightness: 0, warmth: 0, contrast: 0, saturation: 0 };

export type LookPresetId = 'natural' | 'bright' | 'warm' | 'crisp';

export const LOOK_PRESETS: Record<LookPresetId, { label: string; blurb: string; look: ViralLook }> = {
  natural: { label: 'Natural', blurb: 'As filmed, with dark rooms brightened automatically.', look: NATURAL_LOOK },
  bright: {
    label: 'Bright & airy',
    blurb: 'Lighter and a little softer: rooms feel bigger.',
    look: { brightness: 0.45, warmth: 0.1, contrast: -0.25, saturation: -0.1 },
  },
  warm: {
    label: 'Warm & cozy',
    blurb: 'Golden-hour warmth for wood floors and soft light.',
    look: { brightness: 0.15, warmth: 0.6, contrast: 0.05, saturation: 0.15 },
  },
  crisp: {
    label: 'Crisp & clean',
    blurb: 'Cooler whites and more contrast for modern spaces.',
    look: { brightness: 0.1, warmth: -0.35, contrast: 0.45, saturation: 0.1 },
  },
};

export const LOOK_CONTROLS: { key: keyof ViralLook; label: string; low: string; high: string }[] = [
  { key: 'brightness', label: 'Brightness', low: 'Darker', high: 'Brighter' },
  { key: 'warmth', label: 'Warmth', low: 'Cooler', high: 'Warmer' },
  { key: 'contrast', label: 'Contrast', low: 'Softer', high: 'Punchier' },
  { key: 'saturation', label: 'Color', low: 'Muted', high: 'Vivid' },
];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round = (x: number) => Math.round(x * 1000) / 1000;

/** Keeps every control inside -1..1 (missing or NaN = 0). */
export function normalizeLook(look: Partial<ViralLook> | null | undefined): ViralLook {
  const v = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? round(clamp(x, -1, 1)) : 0);
  return {
    brightness: v(look?.brightness),
    warmth: v(look?.warmth),
    contrast: v(look?.contrast),
    saturation: v(look?.saturation),
  };
}

/** Which preset the look matches, or null for a custom mix. */
export function presetOf(look: ViralLook): LookPresetId | null {
  const n = normalizeLook(look);
  for (const [id, p] of Object.entries(LOOK_PRESETS) as [LookPresetId, (typeof LOOK_PRESETS)[LookPresetId]][]) {
    if ((Object.keys(n) as (keyof ViralLook)[]).every((k) => Math.abs(n[k] - p.look[k]) < 1e-6)) return id;
  }
  return null;
}

/**
 * colorCorrection() values for one shot: the automatic exposure fix plus the
 * host's look, within ranges that stay natural on phone footage.
 */
export function gradeFor(shotExposure: number, look: ViralLook | null | undefined) {
  const l = normalizeLook(look);
  const exposure = clamp(shotExposure + l.brightness * 0.5, -0.6, 1);
  return {
    exposure: round(exposure),
    temperature: round(0.04 + l.warmth * 0.25),
    shadows: round(clamp((exposure > 0.2 ? 0.1 : 0.03) + Math.max(0, l.brightness) * 0.1, 0, 0.3)),
    contrast: round(1.06 + l.contrast * 0.16),
    saturation: round(1.06 + l.saturation * 0.2),
    vibrance: 0.12,
  };
}

/**
 * Automatic lighting for a video, from the clip analysis (fenly-viral-editor
 * skill: interiors bright and true, neutral-to-slightly-warm, lifted shadows,
 * every room looking like the same home). Each shot's own exposure fix already
 * evens out dark rooms; this sets the overall look on top of it.
 */
export function autoLook(clips: { meanLuma: number; exposureBoost: number }[]): ViralLook {
  if (clips.length === 0) return { brightness: 0.15, warmth: 0.1, contrast: -0.1, saturation: 0 };
  // Brightness after each shot's own fix, averaged over the video
  const corrected = clips.reduce((a, c) => a + Math.min(1, c.meanLuma * 2 ** c.exposureBoost), 0) / clips.length;
  const brightness = corrected < 0.45 ? 0.35 : corrected < 0.55 ? 0.25 : corrected < 0.62 ? 0.15 : 0.05;
  return normalizeLook({ brightness, warmth: 0.1, contrast: -0.1, saturation: 0.05 });
}
