/**
 * npm run icons: writes public/icons/fenn.svg from FennMascot `app_icon`, then
 * renders the PNG sizes with Remotion (composition FennAppIcon).
 */
import { execFileSync } from 'node:child_process';

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

run(npx, ['tsx', 'scripts/fenn-icon-svg.tsx']);
const sizes: [string, number, string][] = [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['icon-maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'apple'],
];
for (const [file, size, mode] of sizes) {
  const props = JSON.stringify({ size, mode });
  run(npx, ['remotion', 'still', 'FennAppIcon', `public/icons/${file}`, `--props=${process.platform === 'win32' ? JSON.stringify(props) : props}`, '--log=error']);
  console.log(`rendered public/icons/${file}`);
}
