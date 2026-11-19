/**
 * Brand palette and the WCAG contrast math used to check it.
 *
 * Terracotta (#D06C4E) is the brand color for icons, big headlines, the price
 * chip and decoration (3:1 is enough there). Small text uses the darker shades:
 * white on `terracottaStrong`, orange text in `terracottaText`.
 */
export const PALETTE = {
  oatmeal: '#F9F7F3',
  card: '#FFFFFF',
  subtle: '#F2EFE9',
  espresso: '#2C2724',
  muted: '#6E655F',
  terracotta: '#D06C4E',
  terracottaStrong: '#B85B3F',
  terracottaText: '#A9513A',
  sage: '#7A907C',
  sageBg: '#EBF0EC',
  sageText: '#485B4A',
  warnBg: '#FBF1DE',
  warnText: '#8A5A14',
  errorBg: '#F7E3DC',
  errorText: '#9A4A33',
} as const;

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text (>= 24 px, or >= 18.66 px bold) and UI parts/icons. */
export const AA_TEXT = 4.5;
export const AA_LARGE_OR_UI = 3;
