/**
 * "Type a song you like" -> an original background track with a similar feel.
 *
 * The song itself is never sent to the music model: a small text model first
 * describes its feel (genre, mood, tempo, energy, instruments), and the music
 * prompt is built only from those words, with anything from the host's input
 * (title, artist) removed. The result is new music, not a copy of the song.
 * Pure functions, shared by /api/viral/music (server) and the tests.
 */

export type MusicEnergy = 'calm' | 'medium' | 'upbeat';

export type MusicMood = {
  /** e.g. "lo-fi hip hop", "synthwave" */
  genre: string;
  /** 1-3 mood words, e.g. ["warm", "relaxed"] */
  moods: string[];
  /** Beats per minute, 60-140 */
  bpm: number;
  energy: MusicEnergy;
  /** 1-4 instruments, e.g. ["electric piano", "soft drums"] */
  instruments: string[];
};

export const DEFAULT_MUSIC_MOOD: MusicMood = {
  genre: 'chill pop',
  moods: ['warm', 'bright'],
  bpm: 100,
  energy: 'medium',
  instruments: ['electric piano', 'soft drums', 'bass'],
};

const ENERGIES: MusicEnergy[] = ['calm', 'medium', 'upbeat'];

/** Lowercase words of 3+ letters from the host's input: the title and artist we must not pass on. */
function inputWords(songText: string): Set<string> {
  return new Set(
    songText
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
}

/** Words every mood description may use even if they appear in a song title. */
const ALWAYS_OK = new Set([
  'pop', 'rock', 'jazz', 'soul', 'funk', 'lofi', 'house', 'disco', 'indie', 'folk', 'acoustic', 'electronic',
  'hip', 'hop', 'chill', 'dance', 'ambient', 'piano', 'guitar', 'drums', 'bass', 'synth', 'strings',
  'warm', 'bright', 'happy', 'calm', 'upbeat', 'dreamy', 'smooth', 'soft', 'light', 'summer', 'night',
  'love', 'blue', 'gold', 'golden', 'sunny', 'cozy', 'fresh', 'groovy', 'mellow', 'energetic', 'nostalgic',
]);

/**
 * Keeps a short descriptive phrase: letters, spaces and hyphens only, no
 * words from the host's input (unless they are generic music words).
 */
export function cleanMusicWords(text: unknown, banned: Set<string>, maxWords: number): string {
  if (typeof text !== 'string') return '';
  // Hyphens split words too, so "Artist-style" can't slip the artist through
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => ALWAYS_OK.has(w) || !banned.has(w));
  return words.slice(0, maxWords).join(' ').slice(0, 40).trim();
}

/** Cleans the text model's answer. Falls back to a pleasant default for anything missing. */
export function sanitizeMusicMood(raw: unknown, songText: string): MusicMood {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const banned = inputWords(songText);
  const list = (x: unknown, max: number, words: number) =>
    (Array.isArray(x) ? x : [])
      .map((v) => cleanMusicWords(v, banned, words))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, max);
  const genre = cleanMusicWords(r.genre, banned, 3) || DEFAULT_MUSIC_MOOD.genre;
  const moods = list(r.moods, 3, 2);
  const instruments = list(r.instruments, 4, 3);
  const bpmRaw = typeof r.bpm === 'number' && Number.isFinite(r.bpm) ? r.bpm : DEFAULT_MUSIC_MOOD.bpm;
  // Very fast songs feel like half time under a room tour (174 BPM drum and bass -> 87)
  const bpm = Math.round(Math.max(60, Math.min(140, bpmRaw > 140 ? bpmRaw / 2 : bpmRaw)));
  const energy = ENERGIES.includes(r.energy as MusicEnergy) ? (r.energy as MusicEnergy) : DEFAULT_MUSIC_MOOD.energy;
  return {
    genre,
    moods: moods.length ? moods : DEFAULT_MUSIC_MOOD.moods,
    bpm,
    energy,
    instruments: instruments.length ? instruments : DEFAULT_MUSIC_MOOD.instruments,
  };
}

/** The music model's prompt: built only from the cleaned mood, never from the host's words. */
export function buildMusicPrompt(mood: MusicMood): string {
  return [
    'Original instrumental background music for a 30-second vertical apartment tour video.',
    `Genre: ${mood.genre}.`,
    `Mood: ${mood.moods.join(', ')}; ${mood.energy} energy.`,
    `Tempo: about ${mood.bpm} BPM, steady beat.`,
    `Instruments: ${mood.instruments.join(', ')}.`,
    'Starts right away with the groove (no long intro), keeps the same feel the whole time so it loops cleanly, no fade-out.',
    'No vocals, no lyrics, no spoken words.',
  ].join(' ');
}

/** Short label for the editor, e.g. "Original track · synthwave · 118 BPM". */
export function musicLabel(mood: MusicMood): string {
  return `Original track · ${mood.genre} · ${mood.bpm} BPM`;
}
