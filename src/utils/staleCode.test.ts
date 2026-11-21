import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaleCodeError } from './staleCode';

test('spots a missing code file after a deploy, in each browser', () => {
  assert.ok(isStaleCodeError(new TypeError('Importing a module script failed.')));
  assert.ok(isStaleCodeError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js')));
  assert.ok(isStaleCodeError(new TypeError('error loading dynamically imported module: https://x/assets/a.js')));
});

test('other errors are left alone', () => {
  assert.equal(isStaleCodeError(new Error('delayRender timed out')), false);
  assert.equal(isStaleCodeError(null), false);
});
