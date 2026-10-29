import {
  brandFontsUrl,
  CONTRAST_TEXT,
  contrastRatio,
  fontStack,
  mixColor,
  nearestShade,
} from '@lytronix/validators';
import type { BrandCorners, BrandSpacing } from '@lytronix/validators/enums';
import type { PublicBrand } from '../api/storefront-api';

// BRN-01, BRN-02, BRN-04, BRN-07 (Slice 12c, STOREFRONT-DESIGN v1.2 §Look): a shop's own identity on its storefront
// and landing pages, by the dashboard's rules (Slice 11.12b). The page takes the shop's background; its main colour
// gives the accent, its hover, its soft tint and its words; headings take the heading pair and everything else the
// body pair; the corners and spacing are presets the stylesheet holds (`data-corners`, `data-spacing`). Cards, sheets,
// fields, the neutrals and the status colours stay Lytro's; the second colour is not drawn on the storefront.

const WHITE = '#ffffff';
// The faces the storefront serves itself (app/fonts.css), so Google is never asked for them.
const HOSTED_FACES: ReadonlySet<string> = new Set([
  'Inter',
  'Noto Sans Bengali',
  'Plus Jakarta Sans',
]);

export interface StorefrontTheme {
  /** The CSS variables on the page's root. */
  variables: Record<string, string>;
  corners: BrandCorners;
  spacing: BrandSpacing;
  /** The stylesheet for the shop's faces the storefront does not serve itself; null when it serves them all. */
  fontsUrl: string | null;
}

/** The variables and presets a shop's identity sets, rendered on the server so the first paint already wears it. */
export function storefrontTheme(brand: PublicBrand): StorefrontTheme {
  const { main, background, onMain, mainText } = brand.colors;
  const soft = mixColor(main, 255, 0.94);
  // The main colour as words: on the page, on its soft tint (a chosen chip), and on a white card, at 4.5:1.
  const words =
    nearestShade(main, (shade) =>
      [background, soft, WHITE].every((under) => contrastRatio(shade, under) >= CONTRAST_TEXT),
    ) ?? mainText;
  const heading = brand.fonts.heading.id;
  const body = brand.fonts.body.id;
  return {
    variables: {
      '--bg': background,
      '--accent': main,
      '--accent-hover': mixColor(main, 0, 0.2),
      '--on-accent': onMain,
      '--accent-soft': soft,
      '--accent-text': words,
      '--font-ui': fontStack(body),
      '--font-display': fontStack(heading),
    },
    corners: brand.corners,
    spacing: brand.spacing,
    fontsUrl: brandFontsUrl([heading, body], HOSTED_FACES),
  };
}
