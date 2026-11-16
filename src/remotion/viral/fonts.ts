/**
 * Fenly's UI font (Plus Jakarta Sans, see index.html), loaded the Remotion way
 * so renders wait for it.
 */
import { loadFont } from '@remotion/google-fonts/PlusJakartaSans';

const { fontFamily } = loadFont('normal', {
  weights: ['600', '700', '800'],
  subsets: ['latin'],
});

export const brandFont = fontFamily;
