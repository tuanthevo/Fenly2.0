/**
 * The host's edit choices for a tour video, and how a typed request ("make it
 * brighter and faster") becomes a change to them. Pure functions, shared by
 * the editor (browser) and /api/viral/edit (server).
 *
 * Cheap by design: every setting is a number or a word in the edit plan, so
 * applying one only re-renders the preview. Common requests are understood
 * locally with no AI call; only free-form requests go to a small text-only
 * model, which returns the same kind of patch.
 */
import { cleanTag, sanitizeHookText, stripEmoji, violatesFairHousing } from './copy.js';
import { NATURAL_LOOK, normalizeLook } from './look.js';
import type { ClipAnalysis, ViralAiHints, ViralLength, ViralListingInfo, ViralLook, ViralPace, ViralStyleId } from './types.js';

export type ViralMusicChoice = {
  /** blob: URL of the track (AI-made or uploaded; saved with the listing) */
  src: string;
  /** Shown in the editor: a file name, or "Original track · synthwave · 96 BPM" */
  name: string;
  /** 0..1 */
  volume: number;
  /** For AI tracks: the song the host typed, so they can see what it was based on */
  inspiredBy?: string;
};

export type ViralEditSettings = {
  style: ViralStyleId;
  length: ViralLength;
  pace: ViralPace;
  hookSlot: number | null;
  hookDraft: string | null;
  tagEdits: Record<number, string>;
  detailEdits: Record<number, string>;
  sfxOn: boolean;
  roomSound: boolean;
  look: ViralLook;
  music: ViralMusicChoice | null;
};

export const DEFAULT_EDIT_SETTINGS: ViralEditSettings = {
  style: 'price-hook',
  length: 'fenn',
  pace: 'balanced',
  hookSlot: null,
  hookDraft: null,
  tagEdits: {},
  detailEdits: {},
  sfxOn: true,
  roomSound: false,
  look: NATURAL_LOOK,
  music: null,
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/**
 * Settings sent by the browser, checked before the server puts them in a prompt:
 * known words only, looks clamped to -1..1, booleans as booleans, short text, no music URL.
 */
export function sanitizeEditSettings(raw: unknown): ViralEditSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = DEFAULT_EDIT_SETTINGS;
  const volume = Number(s.music?.volume);
  return {
    style: oneOf(s.style, ['price-hook', 'guess-rent', 'pov'] as const, d.style),
    length: oneOf(s.length, ['fenn', 'full', 'teaser'] as const, d.length),
    pace: oneOf(s.pace, ['snappy', 'balanced', 'relaxed'] as const, d.pace),
    hookSlot: Number.isInteger(s.hookSlot) && s.hookSlot >= 1 && s.hookSlot <= 5 ? s.hookSlot : null,
    hookDraft: typeof s.hookDraft === 'string' ? s.hookDraft.slice(0, 80) : null,
    tagEdits: {},
    detailEdits: {},
    sfxOn: typeof s.sfxOn === 'boolean' ? s.sfxOn : d.sfxOn,
    roomSound: typeof s.roomSound === 'boolean' ? s.roomSound : d.roomSound,
    look: normalizeLook(s.look && typeof s.look === 'object' ? s.look : null),
    music: s.music ? { src: '', name: '', volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.55 } : null,
  };
}

/** A change to the settings. Look values are absolute (-1..1); `summary` says what changed, in plain words. */
export type ViralEditPatch = {
  look?: Partial<ViralLook>;
  pace?: ViralPace;
  length?: ViralLength;
  style?: ViralStyleId;
  hookText?: string;
  /** Room callouts per guided-shot slot */
  tags?: Record<number, string>;
  /** Second callouts per slot ('' removes one) */
  details?: Record<number, string>;
  sfxOn?: boolean;
  roomSound?: boolean;
  musicVolume?: number;
  summary: string[];
};

const STEP = 0.3;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round = (x: number) => Math.round(x * 1000) / 1000;

type Rule = {
  pattern: RegExp;
  apply: (s: ViralEditSettings, patch: ViralEditPatch) => void;
};

const bump = (key: keyof ViralLook, dir: 1 | -1, words: [string, string]) => (s: ViralEditSettings, p: ViralEditPatch) => {
  const base = p.look?.[key] ?? s.look[key];
  p.look = { ...p.look, [key]: round(clamp(base + dir * STEP, -1, 1)) };
  p.summary.push(dir > 0 ? words[0] : words[1]);
};

const NOT = '(?<!\\bnot |\\bless |\\bno )';

/** Order matters only for the summary; each rule reads the patch so far. */
const RULES: Rule[] = [
  { pattern: new RegExp(`${NOT}\\b(brighter|lighter|more light|too dark|brighten|airy)\\b`, 'i'), apply: bump('brightness', 1, ['Brighter', 'Darker']) },
  { pattern: /\b(darker|dimmer|too bright|less bright|moodier)\b/i, apply: bump('brightness', -1, ['Brighter', 'Darker']) },
  { pattern: new RegExp(`${NOT}\\b(warmer|cozier|cosier|golden|too cold|too blue)\\b`, 'i'), apply: bump('warmth', 1, ['Warmer', 'Cooler']) },
  { pattern: /\b(cooler|colder|less warm|too warm|too yellow|too orange)\b/i, apply: bump('warmth', -1, ['Warmer', 'Cooler']) },
  { pattern: new RegExp(`${NOT}\\b(punchier|more contrast|crisper|sharper look|pop)\\b`, 'i'), apply: bump('contrast', 1, ['More contrast', 'Softer']) },
  { pattern: /\b(softer|less contrast|flatter)\b/i, apply: bump('contrast', -1, ['More contrast', 'Softer']) },
  { pattern: new RegExp(`${NOT}\\b(more colou?r|vivid|more saturat\\w*|colou?rful)\\b`, 'i'), apply: bump('saturation', 1, ['More color', 'Muted color']) },
  { pattern: /\b(muted|less colou?r|less saturat\w*|desaturat\w*)\b/i, apply: bump('saturation', -1, ['More color', 'Muted color']) },
  {
    pattern: /\b(faster|quicker|snappier|speed (it )?up|too slow)\b/i,
    apply: (s, p) => {
      p.pace = (p.pace ?? s.pace) === 'relaxed' ? 'balanced' : 'snappy';
      p.summary.push('Faster pace');
    },
  },
  {
    pattern: /\b(slower|calmer|relaxed|slow (it )?down|too fast)\b/i,
    apply: (s, p) => {
      p.pace = (p.pace ?? s.pace) === 'snappy' ? 'balanced' : 'relaxed';
      p.summary.push('Slower pace');
    },
  },
  {
    pattern: /\b(shorter|teaser|under 15|quick version)\b/i,
    apply: (_s, p) => {
      p.length = 'teaser';
      p.summary.push('Short teaser');
    },
  },
  {
    pattern: /\b(longer|full tour|every room|more of each room)\b/i,
    apply: (_s, p) => {
      p.length = 'full';
      p.summary.push('Full tour');
    },
  },
  {
    pattern: /\b(guess the rent|hide the price|guessing game)\b/i,
    apply: (_s, p) => {
      p.style = 'guess-rent';
      p.summary.push('Guess-the-rent hook');
    },
  },
  {
    pattern: /\bpov\b/i,
    apply: (_s, p) => {
      p.style = 'pov';
      p.summary.push('POV hook');
    },
  },
  {
    pattern: /\b(no|without|remove|turn off|mute) (the )?(whoosh\w*|sound effects|sfx)\b/i,
    apply: (_s, p) => {
      p.sfxOn = false;
      p.summary.push('Sound effects off');
    },
  },
  {
    pattern: /\b(add|with|turn on) (the )?(whoosh\w*|sound effects|sfx)\b/i,
    apply: (_s, p) => {
      p.sfxOn = true;
      p.summary.push('Sound effects on');
    },
  },
  {
    pattern: /\b(no|without|mute|remove|turn off) (the )?(room sound|room audio|background noise|original audio)\b/i,
    apply: (_s, p) => {
      p.roomSound = false;
      p.summary.push('Room sound off');
    },
  },
  {
    pattern: /\b(keep|with|turn on|add) (the )?(room sound|room audio|original audio)\b/i,
    apply: (_s, p) => {
      p.roomSound = true;
      p.summary.push('Room sound on');
    },
  },
  {
    pattern: /\b(music|song|track) (louder|up)\b|\blouder music\b/i,
    apply: (s, p) => {
      p.musicVolume = round(clamp((p.musicVolume ?? s.music?.volume ?? 0.55) + 0.2, 0, 1));
      p.summary.push('Music louder');
    },
  },
  {
    pattern: /\b(music|song|track) (quieter|softer|down|lower)\b|\b(quieter|softer) music\b/i,
    apply: (s, p) => {
      p.musicVolume = round(clamp((p.musicVolume ?? s.music?.volume ?? 0.55) - 0.2, 0, 1));
      p.summary.push('Music quieter');
    },
  },
];

/**
 * Understands common requests without AI. Returns null when nothing in the
 * request matched (send it to the AI instead). `fullyUnderstood` is false when
 * the request asks for something else too, such as new wording.
 */
export function localEditPatch(
  request: string,
  settings: ViralEditSettings
): { patch: ViralEditPatch; fullyUnderstood: boolean } | null {
  const text = request.trim();
  if (!text) return null;
  const patch: ViralEditPatch = { summary: [] };
  let leftover = ` ${text.toLowerCase()} `;
  for (const rule of RULES) {
    const m = text.match(rule.pattern);
    if (!m) continue;
    rule.apply(settings, patch);
    leftover = leftover.replace(m[0].toLowerCase(), ' ');
  }
  if (patch.summary.length === 0) return null;
  // Whatever is left after the matched phrases: filler words mean we understood it all
  const rest = leftover
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
  return { patch, fullyUnderstood: rest.length === 0 };
}

const FILLER = new Set(
  'a an and the it its this video tour make made more less much bit little lot slightly please can you could i want would like to be look looks feel feels feeling so very too also just then with of a little bit overall whole'.split(' ')
);

/** Applies a patch. Text is cleaned and fair-housing checked; a callout that fails is skipped. */
export function applyEditPatch(settings: ViralEditSettings, patch: ViralEditPatch): ViralEditSettings {
  const next: ViralEditSettings = {
    ...settings,
    tagEdits: { ...settings.tagEdits },
    detailEdits: { ...settings.detailEdits },
  };
  if (patch.look) next.look = normalizeLook({ ...settings.look, ...patch.look });
  if (patch.pace) next.pace = patch.pace;
  if (patch.length) next.length = patch.length;
  if (patch.style) {
    next.style = patch.style;
    next.hookDraft = null;
  }
  if (patch.hookText) {
    const hook = sanitizeHookText(patch.hookText);
    if (hook && !violatesFairHousing(hook)) next.hookDraft = hook;
  }
  for (const [slot, text] of Object.entries(patch.tags ?? {})) {
    const tag = cleanTag(text);
    if (tag && !violatesFairHousing(tag)) next.tagEdits[Number(slot)] = tag;
  }
  for (const [slot, text] of Object.entries(patch.details ?? {})) {
    const detail = text === '' ? '' : cleanTag(text);
    if (detail === '' || !violatesFairHousing(detail)) next.detailEdits[Number(slot)] = detail;
  }
  if (typeof patch.sfxOn === 'boolean') next.sfxOn = patch.sfxOn;
  if (typeof patch.roomSound === 'boolean') next.roomSound = patch.roomSound;
  if (typeof patch.musicVolume === 'number' && next.music) {
    next.music = { ...next.music, volume: round(clamp(patch.musicVolume, 0, 1)) };
  }
  return next;
}

const PACES: ViralPace[] = ['snappy', 'balanced', 'relaxed'];
const LENGTHS: ViralLength[] = ['fenn', 'full', 'teaser'];
const STYLES: ViralStyleId[] = ['price-hook', 'guess-rent', 'pov'];

/**
 * Cleans an AI-written patch (server side): known values only, numbers in
 * range, text short, emoji-free and fair-housing safe, slots that exist.
 */
export function sanitizeEditPatch(raw: unknown, slotNumbers: number[]): ViralEditPatch {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const patch: ViralEditPatch = { summary: [] };
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? round(clamp(x, -1, 1)) : undefined);
  if (r.look && typeof r.look === 'object') {
    const l = r.look as Record<string, unknown>;
    const look: Partial<ViralLook> = {};
    for (const k of ['brightness', 'warmth', 'contrast', 'saturation'] as const) {
      const v = num(l[k]);
      if (v !== undefined) look[k] = v;
    }
    if (Object.keys(look).length) patch.look = look;
  }
  if (PACES.includes(r.pace as ViralPace)) patch.pace = r.pace as ViralPace;
  if (LENGTHS.includes(r.length as ViralLength)) patch.length = r.length as ViralLength;
  if (STYLES.includes(r.style as ViralStyleId)) patch.style = r.style as ViralStyleId;
  if (typeof r.hookText === 'string') {
    const hook = sanitizeHookText(r.hookText);
    if (hook && !violatesFairHousing(hook)) patch.hookText = hook;
  }
  const textMap = (list: unknown, allowEmpty: boolean) => {
    const out: Record<number, string> = {};
    for (const item of Array.isArray(list) ? list : []) {
      const it = item as { slotNumber?: unknown; text?: unknown };
      if (!slotNumbers.includes(it.slotNumber as number) || typeof it.text !== 'string') continue;
      const text = it.text.trim() === '' && allowEmpty ? '' : cleanTag(it.text);
      if ((text || allowEmpty) && !violatesFairHousing(text)) out[it.slotNumber as number] = text;
    }
    return Object.keys(out).length ? out : undefined;
  };
  patch.tags = textMap(r.tags, false);
  patch.details = textMap(r.details, true);
  if (!patch.tags) delete patch.tags;
  if (!patch.details) delete patch.details;
  if (typeof r.sfxOn === 'boolean') patch.sfxOn = r.sfxOn;
  if (typeof r.roomSound === 'boolean') patch.roomSound = r.roomSound;
  if (typeof r.musicVolume === 'number' && Number.isFinite(r.musicVolume)) patch.musicVolume = round(clamp(r.musicVolume, 0, 1));
  const summary = Array.isArray(r.summary) ? r.summary : [];
  patch.summary = summary
    .filter((s): s is string => typeof s === 'string')
    .map((s) => stripEmoji(s).trim().slice(0, 60))
    .filter((s) => s && !violatesFairHousing(s))
    .slice(0, 6);
  return patch;
}

/** True when a patch would change nothing. */
export function isEmptyPatch(patch: ViralEditPatch): boolean {
  return Object.keys(patch).every((k) => k === 'summary');
}

/** One guided shot as saved with a listing (its clip is kept on the device with the listing). */
export type SavedShotClip = {
  slotNumber: number;
  videoUrl: string;
  thumbnailUrl: string;
  durationSec: number;
  isLandscape?: boolean;
  source: 'recorded' | 'uploaded';
};

/**
 * Everything needed to re-open a listing's video in the editor without redoing
 * any work: the clips, the clip analysis and AI copy already computed, and the
 * host's choices.
 */
export type SavedVideoEdit = {
  clips: SavedShotClip[];
  /** The listing facts the video was made from (beds, baths, amenities…) */
  listing: ViralListingInfo;
  settings: ViralEditSettings;
  /** Clip analysis per slot (null = the browser could not analyze that clip) */
  analyses: Record<number, ClipAnalysis | null>;
  aiHints: ViralAiHints | null;
};
