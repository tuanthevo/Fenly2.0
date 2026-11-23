import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_TEXT, errorText } from './errorText';

test('a server code becomes a sentence a person can act on', () => {
  assert.equal(errorText({ error: 'not_found' }, 404), ERROR_TEXT.not_found);
  assert.equal(errorText({ error: 'invalid_session' }, 401), ERROR_TEXT.invalid_session);
  assert.match(errorText({ error: 'database_error' }, 500), /try again/i);
});

test("the server's own sentence wins over the code", () => {
  assert.equal(errorText({ error: 'check_failed', message: "That change isn't allowed for this listing." }, 409), "That change isn't allowed for this listing.");
  assert.equal(errorText({ error: 'Write a few words first.' }, 400), 'Write a few words first.');
});

test('no raw code or status number ever reaches the screen', () => {
  for (const body of [{ error: 'some_new_code' }, {}, { error: 'wrong_status' }]) {
    const text = errorText(body, 500);
    assert.doesNotMatch(text, /_|\d{3}/, text);
    assert.match(text, /[.?]$/);
  }
  for (const text of Object.values(ERROR_TEXT)) assert.doesNotMatch(text, /_/);
});

test('being signed out or offline says what to do', () => {
  assert.match(errorText({ error: 'sign_in_required' }, 401), /sign in/i);
  assert.match(errorText({}, 401), /sign in/i);
  assert.match(errorText({}, 429), /minute/i);
});
