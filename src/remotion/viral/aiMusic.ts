/**
 * Asks /api/viral/music for an original track with the feel of a song the host
 * likes. Returns a blob: URL (kept with the listing like the clips) or throws
 * with a message the editor can show.
 */
import type { ViralMusicChoice } from './editSettings';

export const AI_MUSIC_VOLUME = 0.5;

export async function makeAiMusic(song: string, signal?: AbortSignal): Promise<ViralMusicChoice> {
  const response = await fetch('/api/viral/music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song }),
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as {
    audioBase64?: string;
    mimeType?: string;
    label?: string;
    error?: string;
  };
  if (!response.ok || !data.audioBase64) throw new Error(data.error || 'We couldn’t make music right now.');
  const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
  const src = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'audio/mpeg' }));
  return { src, name: data.label || 'Original track', volume: AI_MUSIC_VOLUME, inspiredBy: song.trim() };
}
