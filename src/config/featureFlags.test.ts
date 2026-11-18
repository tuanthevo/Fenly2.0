import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FLAGS,
  fallbackTab,
  FEATURE_FLAGS,
  isEnabled,
  isTabAllowed,
  parseFlagList,
  resolveFlags,
  visibleMenuFeatures,
} from './featureFlags';

test('2.0 default hides every non-core feature', () => {
  for (const flag of FEATURE_FLAGS) assert.equal(DEFAULT_FLAGS[flag], false, flag);
  assert.deepEqual(visibleMenuFeatures(DEFAULT_FLAGS), []);
});

test('parseFlagList turns names on, "-name" off, "all" everything, and ignores junk', () => {
  assert.deepEqual(parseFlagList('scout, ask_fenn'), { scout: true, ask_fenn: true });
  assert.deepEqual(parseFlagList(' SCOUT ,,-mascots  nope '), { scout: true, mascots: false });
  const all = parseFlagList('all,-mascots');
  assert.equal(all.home_extras, true);
  assert.equal(all.mascots, false);
  assert.deepEqual(parseFlagList(''), {});
  assert.deepEqual(parseFlagList(undefined), {});
});

test('resolveFlags keeps only known boolean overrides and never mutates the defaults', () => {
  const flags = resolveFlags(DEFAULT_FLAGS, { scout: true, ask_fenn: 'yes', evil: true, __proto__: { x: 1 } });
  assert.equal(flags.scout, true);
  assert.equal(flags.ask_fenn, false);
  assert.equal('evil' in flags, false);
  assert.equal(DEFAULT_FLAGS.scout, false);
  assert.deepEqual(resolveFlags(DEFAULT_FLAGS, null), { ...DEFAULT_FLAGS });
});

test('isEnabled is false for missing flag sets', () => {
  assert.equal(isEnabled(null, 'scout'), false);
  assert.equal(isEnabled({ scout: true }, 'scout'), true);
});

test('menu lists only the old tabs whose flag is on, and tabs are gated the same way', () => {
  const flags = resolveFlags(DEFAULT_FLAGS, { scout: true, house_os_extras: true });
  assert.deepEqual(
    visibleMenuFeatures(flags).map((item) => item.tab),
    ['explore', 'house_os']
  );
  assert.equal(isTabAllowed('explore', flags), true);
  assert.equal(isTabAllowed('ask_fenn', flags), false);
  assert.equal(isTabAllowed('home', DEFAULT_FLAGS), false);
  // core 2.0 tabs are always allowed
  for (const tab of ['listings', 'fill', 'messages', 'passport']) assert.equal(isTabAllowed(tab, DEFAULT_FLAGS), true);
});

test('a hidden tab falls back: Home -> Fill, other old tabs -> Find; allowed tabs stay', () => {
  assert.equal(fallbackTab('home', DEFAULT_FLAGS), 'fill');
  assert.equal(fallbackTab('explore', DEFAULT_FLAGS), 'listings');
  assert.equal(fallbackTab('ask_fenn', DEFAULT_FLAGS), 'listings');
  assert.equal(fallbackTab('house_os', DEFAULT_FLAGS), 'listings');
  assert.equal(fallbackTab('passport', DEFAULT_FLAGS), 'passport');
  assert.equal(fallbackTab('home', resolveFlags(DEFAULT_FLAGS, { home_extras: true })), 'home');
});
