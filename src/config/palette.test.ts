import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AA_LARGE_OR_UI, AA_TEXT, PALETTE as P, contrastRatio } from './palette';

test('contrast math matches known values', () => {
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#000000')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
  assert.equal(contrastRatio('#FFFFFF', '#D06C4E').toFixed(2), '3.54');
});

test('text pairs used on the 2.0 screens meet AA (4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['white on primary button', P.card, P.terracottaStrong],
    ['white on primary button (hover)', P.card, P.terracottaText],
    ['orange text on oatmeal', P.terracottaText, P.oatmeal],
    ['orange text on cards', P.terracottaText, P.card],
    ['body text on oatmeal', P.espresso, P.oatmeal],
    ['muted text on oatmeal', P.muted, P.oatmeal],
    ['muted text on cards', P.muted, P.card],
    ['muted text on subtle chips', P.muted, P.subtle],
    ['sage text on sage badges', P.sageText, P.sageBg],
    ['warning text', P.warnText, P.warnBg],
    ['error text on oatmeal', P.errorText, P.oatmeal],
    ['error text on error banner', P.errorText, P.errorBg],
    ['oatmeal on espresso (selected chips)', P.oatmeal, P.espresso],
  ];
  for (const [label, fg, bg] of pairs) {
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= AA_TEXT, `${label}: ${ratio.toFixed(2)}:1`);
  }
});

test('brand terracotta is kept for icons and large text only (3:1)', () => {
  assert.ok(contrastRatio(P.terracotta, P.oatmeal) >= AA_LARGE_OR_UI);
  assert.ok(contrastRatio(P.terracotta, P.card) >= AA_LARGE_OR_UI);
  assert.ok(contrastRatio(P.card, P.terracotta) < AA_TEXT, 'which is why buttons use the darker shade');
});

/** 2.0 core-loop screens: white text must never sit on the brand terracotta. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_FILES = [
  'App.tsx',
  'components/FenlyNavBar.tsx',
  'components/SignInSheet.tsx',
  'components/PassportView.tsx',
  'components/InstallPrompt.tsx',
  'components/OnboardingBanner.tsx',
  'components/VideoInfoOverlay.tsx',
  'components/GuidedShotCapture.tsx',
  'components/RoomDetailsModal.tsx',
  'components/SidebarActions.tsx',
  'components/NavMenu.tsx',
  ...fs.readdirSync(path.join(ROOT, 'components/find')).filter((f) => f.endsWith('.tsx')).map((f) => `components/find/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'components/fill')).filter((f) => f.endsWith('.tsx')).map((f) => `components/fill/${f}`),
];

test('no white text on #D06C4E in the 2.0 screens (source scan)', () => {
  const offenders: string[] = [];
  for (const rel of CORE_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/(['"`])((?:(?!\1)[\s\S])*?)\1/g)) {
      const cls = m[2];
      if (/(^|[\s:])bg-\[#D06C4E\](?!\/)/.test(cls) && /\btext-(white|\[#F9F7F3\]|\[#FFF(FFF)?\])/.test(cls)) {
        offenders.push(`${rel}: ${cls.slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
