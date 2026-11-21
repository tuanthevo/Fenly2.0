import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every source file under `dir` (recursively) with one of the extensions. */
function files(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, exts);
    return exts.some((e) => name.endsWith(e)) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

test('every <video> turns off the browser picture-in-picture button (host decision, Nov 2026)', () => {
  const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const sources = [...files(join(root, 'src'), ['.tsx']), join(root, 'server', 'publicPage.ts')];
  const missing: string[] = [];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    // Each <video ...> opening tag, up to its closing ">" (JSX attributes can span lines)
    for (const match of text.matchAll(/<video\b[\s\S]*?\/?>/g)) {
      if (!/disablePictureInPicture|disablepictureinpicture/.test(match[0])) {
        missing.push(`${file.slice(root.length)}:${text.slice(0, match.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'add disablePictureInPicture to these videos');
});
