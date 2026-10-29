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

// The serif pairs, whose stack ends on the browser's serif rather than its sans-serif.
const SERIF_FONTS: ReadonlySet<BrandFont> = new Set([
  BrandFont.TiroBanglaLora,
  BrandFont.NotoSerifBengaliFraunces,
  BrandFont.GaladaPlayfairDisplay,
]);

/** BRN-02: a pair's faces as a font stack: the Latin face first, so Bangla letters fall through to the Bangla face. */
export function fontStack(font: BrandFont): string {
  const pair = BRAND_FONTS[font];
  return `'${pair.latin}', '${pair.bangla}', ${SERIF_FONTS.has(font) ? 'serif' : 'sans-serif'}`;
}

// The curated faces Google Fonts serves in one weight only, so they are asked for without one.
const ONE_WEIGHT_FACES: ReadonlySet<string> = new Set(['Galada', 'Tiro Bangla']);

/**
 * BRN-02, Slice 12c: the Google Fonts stylesheet for these pairs' faces at 400 and 700, less the faces a page serves
 * itself (`hosted`); null when nothing is left to ask for.
 */
export function brandFontsUrl(
  fonts: readonly BrandFont[],
  hosted: ReadonlySet<string>,
): string | null {
  const faces = [
    ...new Set(fonts.flatMap((font) => [BRAND_FONTS[font].latin, BRAND_FONTS[font].bangla])),
  ]
    .filter((face) => !hosted.has(face))
    .sort();
  if (faces.length === 0) return null;
  const families = faces.map((face) => {
    const family = face.replace(/ /g, '+');
    return ONE_WEIGHT_FACES.has(face) ? `family=${family}` : `family=${family}:wght@400;700`;
  });
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

// TEN-17, SFT-14: what a home screen shows under an app's icon has little room; a longer name is cut at a word.
export const APP_SHORT_NAME_LENGTH = 12;

/** TEN-17, SFT-14: a shop's name as a home screen label -- up to `length` characters, cut at a word where one fits. */
export function shortNameOf(name: string, length = APP_SHORT_NAME_LENGTH): string {
  const characters = Array.from(name.trim());
  if (characters.length <= length) return name.trim();
  const cut = characters.slice(0, length).join('');
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

// TEN-17, Slice 12c: the dashboard's installed app is the one marked, so a seller tells it from the shop's storefront
// app, which takes the plain name (SFT-14).
const DASHBOARD_APP_SUFFIX = ' Admin';

/** TEN-17: the dashboard's installed app's name, "<shop> Admin". */
export function dashboardAppName(shopName: string): string {
  return `${shopName.trim()}${DASHBOARD_APP_SUFFIX}`;
}

/** TEN-17: its home-screen label: the name cut to leave room for " Admin". */
export function dashboardAppShortName(shopName: string): string {
  return `${shortNameOf(shopName, APP_SHORT_NAME_LENGTH - DASHBOARD_APP_SUFFIX.length)}${DASHBOARD_APP_SUFFIX}`;
}

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
