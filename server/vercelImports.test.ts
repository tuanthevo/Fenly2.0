/**
 * Vercel runs api/index.ts as plain Node ESM after compiling each file on its own,
 * and Node needs the file extension on every relative import ("./copy.js", not
 * "./copy"). tsx and Vite forgive a missing extension, so the API works locally and
 * crashes on Vercel (FUNCTION_INVOCATION_FAILED). This walks everything the API
 * loads and fails on any relative runtime import without .js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SPEC = /(?:^|\n)\s*(import|export)\s+(type\s+)?[^'";]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

function resolveTs(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), base, `${base}.ts`, `${base}.tsx`]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

test("every relative import the API loads at runtime ends in .js (Vercel runs plain Node ESM)", () => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(SPEC)) {
      if (m[2]) continue; // import type / export type: erased at compile time
      const spec = m[3] ?? m[4];
      const target = resolveTs(file, spec);
      if (!/\.(js|json)$/.test(spec)) bad.push(`${path.relative(ROOT, file)}: "${spec}"`);
      if (target) walk(target);
    }
  };
  walk(path.join(ROOT, "api", "index.ts"));
  assert.ok(seen.size > 10, `only reached ${seen.size} files`);
  assert.deepEqual(bad, [], `add .js to these imports:\n${bad.join("\n")}`);
});
