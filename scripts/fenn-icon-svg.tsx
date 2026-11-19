/**
 * Writes the Fenn fox app icon (FennMascot `app_icon`) as a standalone SVG to
 * public/icons/fenn.svg. `npm run icons` runs this, then renders the PNG sizes
 * with Remotion (composition FennAppIcon in src/remotion/Root.tsx).
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FennMascotArt } from '../src/components/FennMascot';

const markup = renderToStaticMarkup(<FennMascotArt variant="app_icon" size="xl" />);
const svg = markup.match(/<svg[\s\S]*<\/svg>/)?.[0];
if (!svg) throw new Error('No <svg> in the FennMascot markup');
const standalone = svg
  .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"')
  .replace(/ class="[^"]*"/g, '');
const out = path.resolve('public/icons/fenn.svg');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${standalone}\n`);
console.log(`wrote ${out} (${standalone.length} bytes)`);
