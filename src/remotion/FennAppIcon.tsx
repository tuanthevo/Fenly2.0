/**
 * The installed-app icon (PWA, home screen), rendered to PNG by `npm run icons`.
 * Studio / CLI only; the app never imports this.
 *
 * - any: the fox's own rounded square on a transparent background
 * - maskable / apple: full-bleed charcoal so platform masks (circle, squircle)
 *   never cut the fox; the art sits inside the 80% safe zone
 */
import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';

export type FennAppIconProps = { size: number; mode: 'any' | 'maskable' | 'apple' };

export const FennAppIcon: React.FC<FennAppIconProps> = ({ mode }) => {
  const fullBleed = mode !== 'any';
  return (
    <AbsoluteFill style={{ backgroundColor: fullBleed ? '#1F1F22' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Img src={staticFile('icons/fenn.svg')} style={{ width: fullBleed ? '86%' : '94%', height: fullBleed ? '86%' : '94%' }} />
    </AbsoluteFill>
  );
};
