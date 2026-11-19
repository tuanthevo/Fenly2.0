import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, installHeadline, installPromptMode, INSTALL_SNOOZE_MS, type InstallState } from './installPrompt';
import { fairHousingIssues } from '../remotion/viral/copy';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const base: InstallState = { moment: 'published', standalone: false, platform: 'android', hasNativePrompt: true, dismissedAt: null, installed: false, now: NOW };

test('platform detection', () => {
  assert.equal(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'ios');
  assert.equal(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'ios', 'iPadOS');
  assert.equal(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), 'desktop');
  assert.equal(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)'), 'android');
});

test('only after a moment of success, never when installed', () => {
  assert.equal(installPromptMode(base), 'native');
  assert.equal(installPromptMode({ ...base, moment: 'applied' }), 'native');
  assert.equal(installPromptMode({ ...base, moment: null }), null);
  assert.equal(installPromptMode({ ...base, standalone: true }), null);
  assert.equal(installPromptMode({ ...base, installed: true }), null);
});

test('iPhone gets the share-sheet hint; desktop without a prompt gets nothing', () => {
  assert.equal(installPromptMode({ ...base, platform: 'ios', hasNativePrompt: false }), 'ios_hint');
  assert.equal(installPromptMode({ ...base, platform: 'desktop', hasNativePrompt: false }), null);
  assert.equal(installPromptMode({ ...base, platform: 'android', hasNativePrompt: false }), null);
});

test('"Not now" snoozes for 14 days', () => {
  assert.equal(installPromptMode({ ...base, dismissedAt: NOW - 1000 }), null);
  assert.equal(installPromptMode({ ...base, dismissedAt: NOW - INSTALL_SNOOZE_MS + 1 }), null);
  assert.equal(installPromptMode({ ...base, dismissedAt: NOW - INSTALL_SNOOZE_MS }), 'native');
});

test('headlines are short and fair-housing clean', () => {
  for (const m of ['published', 'applied'] as const) {
    assert.ok(installHeadline(m).length <= 90);
    assert.deepEqual(fairHousingIssues(installHeadline(m)), []);
  }
});
