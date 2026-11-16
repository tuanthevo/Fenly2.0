/**
 * Fenly brand tokens for video (same values as src/index.css) and the layout
 * box that keeps on-screen text clear of the TikTok / Reels / Shorts UI.
 */

export const FENN = {
  oatmeal: '#F9F7F3',
  oatmealSubtle: '#F2EFE9',
  espresso: '#2C2724',
  espressoMuted: '#6E655F',
  terracotta: '#D06C4E',
  terracottaDark: '#B85B3F',
  sage: '#7A907C',
  sageBg: '#E8EFE9',
  sageText: '#485B4A',
  white: '#FFFFFF',
} as const;

/** 9:16 vertical master: the size TikTok, Reels and Shorts all recommend. */
export const VIDEO = { width: 1080, height: 1920, fps: 30 } as const;

/**
 * Pixels to keep clear on a 1080x1920 frame. TikTok draws its tabs at the top,
 * the like/comment/share rail on the right and the caption + sound at the
 * bottom (about 220 / 140 / 480 px). We add a little extra so Reels and
 * Shorts are covered by the same layout.
 */
export const SAFE = { top: 230, bottom: 500, left: 72, right: 160 } as const;

/** Readable text sizes for a 1080 px wide video (headline ≥ 84 px, support ≥ 44 px). */
export const TYPE = {
  kicker: 34,
  tag: 60,
  chip: 46,
  support: 44,
} as const;
