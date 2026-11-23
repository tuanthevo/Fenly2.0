import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterJump, chaptersFromPlan, cleanChapters, roomStarts } from './videoChapters';

const CHAPTERS = [0, 6.03, 11.53, 17.03, 28.03];

test('chapters come from the plan: one per shot, in seconds', () => {
  const plan = { fps: 30, shots: [{ startFrame: 0 }, { startFrame: 181 }, { startFrame: 346 }] } as any;
  assert.deepEqual(chaptersFromPlan(plan), [0, 6.03, 11.53]);
});

test('chapter data from the database is cleaned', () => {
  assert.deepEqual(cleanChapters([11.5, 0, 6, 6, 'x', -1, NaN, 999]), [0, 6, 11.5]);
  assert.deepEqual(cleanChapters(null), []);
  assert.deepEqual(cleanChapters([0]), [], 'one room: nothing to jump between');
  assert.equal(cleanChapters(Array.from({ length: 50 }, (_, i) => i)).length, 20);
});

test('swipe left goes to the next room, right to the start of this one or the one before', () => {
  assert.equal(chapterJump(CHAPTERS, 2, 'next'), 6.03);
  assert.equal(chapterJump(CHAPTERS, 6.03, 'next'), 11.53, 'right after a jump still moves on');
  assert.equal(chapterJump(CHAPTERS, 30, 'next'), null, 'last room: nowhere to go');
  assert.equal(chapterJump(CHAPTERS, 14, 'prev'), 11.53, 'well into a room: back to its start');
  assert.equal(chapterJump(CHAPTERS, 12, 'prev'), 6.03, 'just started: the room before');
  assert.equal(chapterJump(CHAPTERS, 0.5, 'prev'), 0);
  assert.equal(chapterJump([], 3, 'next'), null, 'videos without chapters do nothing');
});

test('videos saved before chapters still swipe, in even steps', () => {
  assert.deepEqual(roomStarts(CHAPTERS, 40), CHAPTERS, 'saved chapters win');
  assert.deepEqual(roomStarts([], 20), [0, 6, 12]);
  assert.deepEqual(roomStarts(undefined, 13.9), [0, 6], 'no start within 2 s of the end');
  assert.deepEqual(roomStarts([], 5), [], 'too short to split');
  assert.deepEqual(roomStarts([], NaN), [], 'duration not known yet');
  assert.equal(chapterJump(roomStarts([], 20), 2, 'next'), 6);
});
