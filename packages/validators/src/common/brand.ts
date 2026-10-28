import { BrandCorners, BrandFont, BrandSpacing } from '../db/enums';

/** BRN-02: one curated typeface pair -- its Bangla face and its Latin face (Google Fonts families). */
export interface BrandFontPair {
  id: BrandFont;
  bangla: string;
  latin: string;
  /** A display pair, for headings only; never body text. */
  headingsOnly: boolean;
}

// BRN-02 (agreed for Slice 11.2): the list the editor offers for headings and for body text. The first is Lytro's own.
export const BRAND_FONTS: Readonly<Record<BrandFont, BrandFontPair>> = {
  [BrandFont.NotoSansBengaliInter]: {
    id: BrandFont.NotoSansBengaliInter,
    bangla: 'Noto Sans Bengali',
    latin: 'Inter',
    headingsOnly: false,
  },
  [BrandFont.HindSiliguriPlusJakartaSans]: {
    id: BrandFont.HindSiliguriPlusJakartaSans,
    bangla: 'Hind Siliguri',
    latin: 'Plus Jakarta Sans',
    headingsOnly: false,
  },
  [BrandFont.AnekBanglaDmSans]: {
    id: BrandFont.AnekBanglaDmSans,
    bangla: 'Anek Bangla',
    latin: 'DM Sans',
    headingsOnly: false,
  },
  [BrandFont.BalooDa2Poppins]: {
    id: BrandFont.BalooDa2Poppins,
    bangla: 'Baloo Da 2',
    latin: 'Poppins',
    headingsOnly: false,
  },
  [BrandFont.TiroBanglaLora]: {
    id: BrandFont.TiroBanglaLora,
    bangla: 'Tiro Bangla',
    latin: 'Lora',
    headingsOnly: false,
  },
  [BrandFont.NotoSerifBengaliFraunces]: {
    id: BrandFont.NotoSerifBengaliFraunces,
    bangla: 'Noto Serif Bengali',
    latin: 'Fraunces',
    headingsOnly: false,
  },
  [BrandFont.GaladaPlayfairDisplay]: {
    id: BrandFont.GaladaPlayfairDisplay,
    bangla: 'Galada',
    latin: 'Playfair Display',
    headingsOnly: true,
  },
};

/** BRN-02: the three colours a shop chooses, each #rrggbb. */
export interface BrandColors {
  mainColor: string;
  accentColor: string;
  backgroundColor: string;
}

/** BRN-02, BRN-07: a brand identity's design tokens, as stored -- its colours, fonts, corners and spacing. */
export interface BrandDesign extends BrandColors {
  headingFont: BrandFont;
  bodyFont: BrandFont;
  corners: BrandCorners;
  spacing: BrandSpacing;
}

// BRN-01, BRAND-IDENTITY §4 and §8.3: Lytro's default identity -- teal-700 and marigold on white, Lytro's own fonts, soft
// corners and comfortable spacing. Every shop shows it until its own is switched on, and the editor starts from it.
export const DEFAULT_BRAND: Readonly<BrandDesign> = {
  mainColor: '#0e6b66',
  accentColor: '#f2a516',
  backgroundColor: '#ffffff',
  headingFont: BrandFont.NotoSansBengaliInter,
  bodyFont: BrandFont.NotoSansBengaliInter,
  corners: BrandCorners.Soft,
  spacing: BrandSpacing.Comfortable,
};

/**
 * TEN-16: a shop's monogram letter -- the first letter or digit of its name (a Bangla letter alone, without its
 * signs), or of the fallback (its address) when the name has none. One rule for the dashboard's tile and the
 * installed app's icon.
 */
export function monogramLetter(shopName: string, fallback: string): string {
  const letter = Array.from(shopName).find((character) => /[\p{L}\p{N}]/u.test(character));
  return (letter ?? fallback.charAt(0)).toLocaleUpperCase('en');
}

// BRN-02: the square icon an installed app is drawn from is at least this many pixels a side.
export const BRAND_ICON_MIN_PX = 512;

// BRN-02: how far from square the icon may be, as a share of its longer side.
export const BRAND_ICON_SQUARE_TOLERANCE = 0.02;

/**
 * BRN-02: whether a picture of this size may be the square icon -- square within the tolerance and at least
 * BRAND_ICON_MIN_PX a side. The editor checks a file before it is sent; the server checks what was stored.
 */
export function brandIconFits(width: number, height: number): boolean {
  const side = Math.min(width, height);
  const longer = Math.max(width, height);
  return side >= BRAND_ICON_MIN_PX && longer - side <= longer * BRAND_ICON_SQUARE_TOLERANCE;
}
