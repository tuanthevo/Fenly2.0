import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MUSIC_MOOD, buildMusicPrompt, musicLabel, sanitizeMusicMood } from './musicMood';

test('the music prompt never carries the song title or artist the host typed', () => {
  const song = 'Blinding Lights by The Weeknd';
  const mood = sanitizeMusicMood(
    {
      genre: 'Weeknd-style synthwave',
      moods: ['nostalgic', 'Blinding', 'energetic'],
      bpm: 171,
      energy: 'upbeat',
      instruments: ['synth bass', 'drum machine', 'bright pads'],
    },
    song
  );
  const prompt = buildMusicPrompt(mood).toLowerCase();
  for (const word of ['weeknd', 'blinding', 'lights']) assert.ok(!prompt.includes(word), `"${word}" leaked: ${prompt}`);
  assert.equal(mood.genre, 'style synthwave');
  assert.deepEqual(mood.moods, ['nostalgic', 'energetic']);
  assert.equal(mood.bpm, 86); // 171 BPM plays as half time under a tour
  assert.match(prompt, /no vocals, no lyrics/);
  assert.match(musicLabel(mood), /^Original track · style synthwave · 86 BPM$/);
});

test('generic music words survive even when they are in the title; junk falls back to defaults', () => {
  const mood = sanitizeMusicMood({ genre: 'summer pop', moods: ['happy'], bpm: 'fast', energy: 'loud' }, 'Summer Love');
  assert.equal(mood.genre, 'summer pop');
  assert.equal(mood.bpm, DEFAULT_MUSIC_MOOD.bpm);
  assert.equal(mood.energy, DEFAULT_MUSIC_MOOD.energy);
  assert.deepEqual(mood.instruments, DEFAULT_MUSIC_MOOD.instruments);
  assert.deepEqual(sanitizeMusicMood(null, 'anything'), DEFAULT_MUSIC_MOOD);
  assert.equal(sanitizeMusicMood({ bpm: 40 }, '').bpm, 60);
});
