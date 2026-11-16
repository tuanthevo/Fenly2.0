import test from 'node:test';
import assert from 'node:assert/strict';
import { planNavigation } from './historyNav';

const eq = (a: string, b: string) => a === b;

test('opening a screen pushes a history step; the same screen does nothing', () => {
  assert.deepEqual(planNavigation(['feed'], 0, 'home', eq), { type: 'push' });
  assert.deepEqual(planNavigation(['feed', 'home'], 1, 'home', eq), { type: 'none' });
});

test('closing what was just opened goes back one step, so back and forward stay in sync', () => {
  // feed -> home -> active listings; the page's own back button returns to home
  assert.deepEqual(planNavigation(['feed', 'home', 'home/active'], 2, 'home', eq), { type: 'back' });
  // going somewhere new from the middle of the history is a fresh step
  assert.deepEqual(planNavigation(['feed', 'home', 'home/active'], 2, 'messages', eq), { type: 'push' });
  // nothing to go back to at the first screen
  assert.deepEqual(planNavigation(['home/active'], 0, 'home', eq), { type: 'push' });
});

test('replace swaps the current step (publishing shouldn’t leave Create Listing behind the back gesture)', () => {
  assert.deepEqual(planNavigation(['home', 'home+create'], 1, 'feed', eq, { replace: true }), { type: 'replace' });
  assert.deepEqual(planNavigation(['home', 'home+create'], 1, 'home+create', eq, { replace: true }), { type: 'none' });
});
