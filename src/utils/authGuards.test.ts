import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlausibleEmail,
  needsSignIn,
  normalizePhone,
  parseBearerToken,
  safeRedirectPath,
  USER_ACTIONS,
} from './authGuards';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl';

test('signed-out visitors can browse, watch and open listings; apply/publish/message ask to sign in', () => {
  const signedOut = { configured: true, signedIn: false };
  assert.equal(needsSignIn('browse', signedOut), false);
  assert.equal(needsSignIn('watch', signedOut), false);
  assert.equal(needsSignIn('open_listing', signedOut), false);
  assert.equal(needsSignIn('apply', signedOut), true);
  assert.equal(needsSignIn('publish', signedOut), true);
  assert.equal(needsSignIn('message', signedOut), true);
});

test('no sign-in prompts when signed in, or when Supabase is not configured (local demo)', () => {
  for (const action of USER_ACTIONS) {
    assert.equal(needsSignIn(action, { configured: true, signedIn: true }), false, action);
    assert.equal(needsSignIn(action, { configured: false, signedIn: false }), false, action);
  }
});

test('parseBearerToken accepts "Bearer <jwt>" only', () => {
  assert.equal(parseBearerToken(`Bearer ${JWT}`), JWT);
  assert.equal(parseBearerToken(`bearer  ${JWT} `), JWT);
  assert.equal(parseBearerToken(undefined), null);
  assert.equal(parseBearerToken(''), null);
  assert.equal(parseBearerToken(JWT), null);
  assert.equal(parseBearerToken(`Basic ${JWT}`), null);
  assert.equal(parseBearerToken('Bearer not-a-jwt'), null);
  assert.equal(parseBearerToken(`Bearer ${JWT} extra`), null);
  assert.equal(parseBearerToken([`Bearer ${JWT}`]), null);
  assert.equal(parseBearerToken(`Bearer ${'a'.repeat(9000)}.b.c`), null);
});

test('safeRedirectPath keeps same-site paths and blocks open redirects', () => {
  assert.equal(safeRedirectPath('/r/abc?x=1#y'), '/r/abc?x=1#y');
  assert.equal(safeRedirectPath('/'), '/');
  assert.equal(safeRedirectPath('https://evil.example'), '/');
  assert.equal(safeRedirectPath('//evil.example/path'), '/');
  assert.equal(safeRedirectPath('/\\evil.example'), '/');
  assert.equal(safeRedirectPath('javascript:alert(1)'), '/');
  assert.equal(safeRedirectPath('/ok\nSet-Cookie: x'), '/');
  assert.equal(safeRedirectPath(null, '/passport'), '/passport');
});

test('normalizePhone turns US numbers into E.164 and rejects junk', () => {
  assert.equal(normalizePhone('(415) 555-0100'), '+14155550100');
  assert.equal(normalizePhone('1 415 555 0100'), '+14155550100');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('555-0100'), null);
  assert.equal(normalizePhone('+1'), null);
});

test('isPlausibleEmail is a light check before sending a magic link', () => {
  assert.equal(isPlausibleEmail('host@example.com'), true);
  assert.equal(isPlausibleEmail(' host@example.com '), true);
  assert.equal(isPlausibleEmail('host@example'), false);
  assert.equal(isPlausibleEmail('host example.com'), false);
});
