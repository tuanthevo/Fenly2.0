import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeEditSettings,
  DEFAULT_EDIT_SETTINGS,
  applyEditPatch,
  isEmptyPatch,
  localEditPatch,
  sanitizeEditPatch,
  type ViralEditSettings,
} from './editSettings';
import { LOOK_PRESETS, NATURAL_LOOK, autoLook, gradeFor, normalizeLook, presetOf } from './look';

test('the natural look keeps the original grade; presets stay in range', () => {
  assert.deepEqual(gradeFor(0, NATURAL_LOOK), {
    exposure: 0,
    temperature: 0.04,
    shadows: 0.03,
    contrast: 1.06,
    saturation: 1.06,
    vibrance: 0.12,
  });
  for (const preset of Object.values(LOOK_PRESETS)) {
    const g = gradeFor(0.6, preset.look);
    assert.ok(g.exposure <= 1 && g.exposure >= -0.6);
    assert.ok(g.contrast > 0.85 && g.contrast < 1.25);
    assert.ok(g.saturation > 0.8 && g.saturation < 1.3);
  }
  assert.equal(presetOf(LOOK_PRESETS.warm.look), 'warm');
  assert.equal(presetOf({ ...NATURAL_LOOK, brightness: 0.2 }), null);
  assert.deepEqual(normalizeLook({ brightness: 4, warmth: Number.NaN }), { brightness: 1, warmth: 0, contrast: 0, saturation: 0 });
});

test('common requests are understood locally, with no AI call', () => {
  const r = localEditPatch('Make it brighter and a bit warmer, and faster please', DEFAULT_EDIT_SETTINGS)!;
  assert.ok(r.fullyUnderstood);
  assert.equal(r.patch.look?.brightness, 0.3);
  assert.equal(r.patch.look?.warmth, 0.3);
  assert.equal(r.patch.pace, 'snappy');
  assert.deepEqual(r.patch.summary, ['Brighter', 'Warmer', 'Faster pace']);

  const shorter = localEditPatch('shorter, no whoosh', DEFAULT_EDIT_SETTINGS)!;
  assert.equal(shorter.patch.length, 'teaser');
  assert.equal(shorter.patch.sfxOn, false);

  // "not brighter" is not a request to brighten
  assert.equal(localEditPatch('not brighter', DEFAULT_EDIT_SETTINGS), null);
  // Anything else goes to the AI
  assert.equal(localEditPatch('mention the balcony in the hook', DEFAULT_EDIT_SETTINGS), null);
  const mixed = localEditPatch('brighter and mention the balcony', DEFAULT_EDIT_SETTINGS)!;
  assert.equal(mixed.fullyUnderstood, false);
});

test('patches apply on top of the current settings, and steps build on each other', () => {
  const start: ViralEditSettings = { ...DEFAULT_EDIT_SETTINGS, look: { ...NATURAL_LOOK, brightness: 0.9 }, pace: 'relaxed' };
  const r = localEditPatch('brighter, faster', start)!;
  const next = applyEditPatch(start, r.patch);
  assert.equal(next.look.brightness, 1); // capped
  assert.equal(next.pace, 'balanced'); // one step up from relaxed
  assert.equal(start.look.brightness, 0.9); // original untouched
});

test('AI patches are cleaned: unknown values, emoji, long text and fair-housing problems are dropped', () => {
  const patch = sanitizeEditPatch(
    {
      look: { brightness: 3, warmth: 'hot', contrast: -0.2 },
      pace: 'turbo',
      length: 'teaser',
      hookText: 'What $1,450/mo gets you in Mission District \u{1F525}',
      tags: [
        { slotNumber: 3, text: 'Double vanity' },
        { slotNumber: 9, text: 'Not a real slot' },
        { slotNumber: 4, text: 'Perfect for students' },
      ],
      details: [{ slotNumber: 2, text: '' }],
      summary: ['Brighter', 42, 'Shorter'],
    },
    [1, 2, 3, 4, 5]
  );
  assert.deepEqual(patch.look, { brightness: 1, contrast: -0.2 });
  assert.equal(patch.pace, undefined);
  assert.equal(patch.length, 'teaser');
  assert.equal(patch.hookText, 'What $1,450/mo gets you in Mission District');
  assert.deepEqual(patch.tags, { 3: 'Double vanity' });
  assert.deepEqual(patch.details, { 2: '' });
  assert.deepEqual(patch.summary, ['Brighter', 'Shorter']);
  assert.equal(isEmptyPatch({ summary: ['nothing'] }), true);

  const applied = applyEditPatch(DEFAULT_EDIT_SETTINGS, patch);
  assert.equal(applied.hookDraft, 'What $1,450/mo gets you in Mission District');
  assert.equal(applied.tagEdits[3], 'Double vanity');
  assert.equal(applied.detailEdits[2], '');
});

test('automatic lighting: brighter for dim footage, always slightly warm with soft shadows', () => {
  const dim = autoLook([{ meanLuma: 0.25, exposureBoost: 0.6 }, { meanLuma: 0.3, exposureBoost: 0.6 }]);
  const bright = autoLook([{ meanLuma: 0.7, exposureBoost: 0 }]);
  assert.ok(dim.brightness > bright.brightness);
  assert.ok(dim.brightness <= 0.35 && bright.brightness >= 0);
  for (const look of [dim, bright, autoLook([])]) {
    assert.equal(look.warmth, 0.1);
    assert.ok(look.contrast < 0);
  }
});

test('settings from the browser are checked before they reach a prompt', () => {
  const huge = 'x'.repeat(50_000);
  const out = sanitizeEditSettings({
    style: huge,
    pace: 'snappy',
    length: 'teaser',
    look: { brightness: 9, warmth: 'hot', contrast: -0.2, saturation: huge },
    sfxOn: 'yes',
    roomSound: true,
    music: { src: 'https://evil.example/x.mp3', volume: 4 },
    hookDraft: huge,
  });
  assert.equal(out.style, 'price-hook');
  assert.equal(out.pace, 'snappy');
  assert.equal(out.length, 'teaser');
  assert.ok(out.look.brightness <= 1 && Number.isFinite(out.look.warmth) && Number.isFinite(out.look.saturation));
  assert.equal(out.sfxOn, true);
  assert.equal(out.roomSound, true);
  assert.deepEqual(out.music, { src: '', name: '', volume: 1 });
  assert.ok((out.hookDraft ?? '').length <= 80);
  assert.ok(JSON.stringify(out).length < 600);
  assert.deepEqual(sanitizeEditSettings(null), DEFAULT_EDIT_SETTINGS);
});
