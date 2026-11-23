import test from 'node:test';
import assert from 'node:assert/strict';
import { captionIssues, sanitizePhotoAssist } from './photoAssist';

const IDS = ['a', 'b', 'c', 'd'];

test('a clean answer comes through: tour order, two short callouts per photo, facts and flags', () => {
  const out = sanitizePhotoAssist(
    {
      order: ['a', 'c', 'b', 'd'],
      photos: [
        { id: 'a', tag: 'Bright bedroom', detail: 'South-facing window', flags: [] },
        { id: 'b', tag: 'Desk nook', detail: '', flags: ['mail'] },
        { id: 'c', tag: 'Corner view', detail: 'Hardwood floors', flags: ['face', 'personal'] },
        { id: 'd', tag: 'Built-in closet', detail: 'Sliding doors', flags: [] },
      ],
      facts: { squareFeet: 147, furnished: true, notes: ['South-facing window', 'Built-in closet'] },
    },
    IDS
  );
  assert.deepEqual(out.order, ['a', 'c', 'b', 'd']);
  assert.equal(out.captions.a, 'Bright bedroom, South-facing window');
  assert.equal(out.captions.b, 'Desk nook');
  assert.deepEqual(out.flags, { b: ['mail'], c: ['face', 'personal'] });
  assert.deepEqual(out.facts, { squareFeet: 150, furnished: true, notes: ['South-facing window', 'Built-in closet'] });
});

test('the order is always every photo exactly once, whatever the model returns', () => {
  assert.deepEqual(sanitizePhotoAssist({ order: ['c', 'zzz', 'c', 'a'] }, IDS).order, ['c', 'a', 'b', 'd']);
  assert.deepEqual(sanitizePhotoAssist({ order: 'nope' }, IDS).order, IDS);
  assert.deepEqual(sanitizePhotoAssist(null, IDS), { order: IDS, captions: {}, flags: {}, facts: { squareFeet: null, furnished: null, notes: [] } });
});

test('text about who should live there is dropped, never shown as a suggestion', () => {
  const out = sanitizePhotoAssist(
    {
      photos: [
        { id: 'a', tag: 'Perfect for students', detail: 'Big window' },
        { id: 'b', tag: 'Bedroom', detail: 'Ideal for a young professional' },
      ],
      facts: { notes: ['Great for a single female', 'Two windows'] },
    },
    IDS
  );
  assert.equal(out.captions.a, 'Big window');
  assert.equal(out.captions.b, 'Bedroom');
  assert.deepEqual(out.facts.notes, ['Two windows']);
});

test('callouts are short, without emoji; unknown photos, flags and wild sizes are ignored', () => {
  const out = sanitizePhotoAssist(
    {
      photos: [
        { id: 'a', tag: 'A very long room label that would never fit on one pill', detail: 'Closet \u{1F600}', flags: ['face', 'dragon', 'face'] },
        { id: 'nope', tag: 'Ghost' },
      ],
      facts: { squareFeet: 99999, furnished: 'yes', notes: ['x'.repeat(200), 5] },
    },
    IDS
  );
  for (const part of out.captions.a.split(', ')) assert.ok(part.length <= 22, part);
  assert.doesNotMatch(out.captions.a, /\p{Extended_Pictographic}/u);
  assert.deepEqual(out.flags.a, ['face']);
  assert.equal('nope' in out.captions, false);
  assert.deepEqual(out.facts, { squareFeet: null, furnished: null, notes: [] });
});

test('captionIssues names the fair-housing phrases in a host-typed caption', () => {
  assert.deepEqual(captionIssues(['Bright bedroom, Big window', null, '']), []);
  assert.ok(captionIssues(['Perfect for students']).length > 0);
});
