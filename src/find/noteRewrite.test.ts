import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoteRewritePrompt, cleanRewrite, NOTE_MAX_CHARS } from './noteRewrite';

const NOTE = 'hi im a nurse, work nights, quiet, can move in jan 15. call 415-555-0199';

test('the prompt rewords only: no new facts, first person, no contact details', () => {
  const p = buildNoteRewritePrompt(NOTE);
  assert.match(p, /Do not add any fact/);
  assert.match(p, /only fix spelling/i, 'a near-empty note is not padded out');
  assert.ok(p.includes(NOTE));
  assert.ok(buildNoteRewritePrompt('x'.repeat(5000)).length < NOTE_MAX_CHARS + 1000, 'the note is capped');
});

test('a rewrite is cleaned, and dropped when it invents contact details or is unusable', () => {
  assert.equal(
    cleanRewrite('"Hi! I’m a nurse who works nights 🌙, so I keep things quiet. I can move in Jan 15. Call me at 415-555-0199."', NOTE),
    'Hi! I’m a nurse who works nights, so I keep things quiet. I can move in Jan 15. Call me at 415-555-0199.'
  );
  assert.equal(cleanRewrite('Reach me at jo@example.com, I work nights.', NOTE), null, 'an email the applicant never wrote');
  assert.equal(cleanRewrite('See www.example.com for my references.', NOTE), null, 'a link the applicant never wrote');
  assert.equal(cleanRewrite('', NOTE), null);
  assert.equal(cleanRewrite(42, NOTE), null);
  assert.equal(cleanRewrite('x'.repeat(NOTE_MAX_CHARS + 1), NOTE), null);
  assert.equal(cleanRewrite(NOTE, NOTE), null, 'no change: nothing to offer');
  // Gemini turned "This is a test" into a full inquiry with the rent: numbers it made up are refused
  assert.equal(cleanRewrite('I am interested in the room for $2,200 per month.', 'This is a test'), null);
  assert.equal(cleanRewrite('I can move in on January 15.', 'can move in jan 15'), 'I can move in on January 15.', 'numbers from the note are fine');
});
