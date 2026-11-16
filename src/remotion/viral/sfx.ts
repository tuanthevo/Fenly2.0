/**
 * Sound effects in public/sfx/. They were synthesized for Fenly (no samples,
 * no third-party license), see docs/briefs/viral-remotion-editor.md.
 */
import { staticFile } from 'remotion';
import type { ViralSfxKind } from './types';

export const SFX_FILES: Record<ViralSfxKind, string> = {
  whoosh: 'sfx/whoosh.wav',
  pop: 'sfx/pop.wav',
  ding: 'sfx/ding.wav',
};

export const sfxSrc = (kind: ViralSfxKind): string => staticFile(SFX_FILES[kind]);
