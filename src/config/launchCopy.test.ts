import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_LAUNCH_LINES, EMPTY_STATE, TAB_VALUE } from './launchCopy';
import { fairHousingIssues } from '../remotion/viral/copy';

const EMOJI = /\p{Extended_Pictographic}/u;

test('each tab explains its value in one line', () => {
  assert.deepEqual(Object.keys(TAB_VALUE).sort(), ['fill', 'listings', 'messages', 'passport']);
  for (const { title, line } of Object.values(TAB_VALUE)) {
    assert.ok(title.length > 0 && title.length <= 12, title);
    assert.ok(line.length <= 90, `${line.length} chars: ${line}`);
  }
});

test('launch copy: one line, ends with a period, no emoji, fair-housing clean', () => {
  for (const line of ALL_LAUNCH_LINES) {
    assert.ok(line.length <= 90, `${line.length} chars: ${line}`);
    assert.ok(!line.includes('\n'), line);
    assert.ok(line.endsWith('.'), line);
    assert.ok(!EMOJI.test(line), line);
    assert.deepEqual(fairHousingIssues(line), [], line);
  }
  for (const { title } of Object.values(EMPTY_STATE)) assert.ok(title.length <= 30, title);
});
