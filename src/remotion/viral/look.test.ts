import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_PRESETS, NATURAL_LOOK, autoLook, gradeFor } from './look';

test('the grade rolls off highlights so bright windows keep their detail', () => {
  for (const look of [NATURAL_LOOK, autoLook([{ meanLuma: 0.55, exposureBoost: 0 }]), ...Object.values(LOOK_PRESETS).map((p) => p.look)]) {
    const g = gradeFor(0, look);
    assert.ok(g.highlights <= -0.3, `highlights ${g.highlights}`);
    assert.ok(g.whites <= -0.15, `whites ${g.whites}`);
  }
  // A brighter look (or a dark room's exposure lift) pulls highlights back further
  assert.ok(gradeFor(0.5, LOOK_PRESETS.bright.look).highlights < gradeFor(0, NATURAL_LOOK).highlights);
  // ...within the effect's range
  const g = gradeFor(1, { brightness: 1, warmth: 0, contrast: 1, saturation: 0 });
  assert.ok(g.highlights >= -1 && g.whites >= -1);
});
