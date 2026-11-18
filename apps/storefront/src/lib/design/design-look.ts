import {
  BrandCorners,
  BrandSpacing,
  brandFontsUrl,
  fontStack,
  STOREFRONT_THEMES,
  storefrontTokens,
  type ProductCardStyle,
  type StorefrontHeaderStyle,
  type StorefrontThemeDefinition,
  type StorefrontTokens,
} from '@lytronix/validators';
import type { PublicBrand, PublicStorefrontDesign } from '../api/storefront-api';
import { HOSTED_FACES } from '../brand/brand-theme';

// STOREFRONT-BUILDER-PLAN SB-7, SB-17, SB-18: how a shop's theme dresses its pages. The home's sections wear the
// theme's own tokens (the sketch's CSS variables); the shop's own brand identity, while it shows, replaces the theme's
// colours, fonts and corners and leaves its layout. The rest of the storefront takes the theme's main colour and fonts
// through the frame the brand identity already dresses.

/** The home's root: its CSS variables and the stylesheet for the faces the storefront does not serve itself. */
export interface DesignLook {
  theme: StorefrontThemeDefinition;
  variables: Record<string, string>;
  fontsUrl: string | null;
}

/** SB-18: the identity's corners as the theme's card and button radii. */
const CORNERS: Readonly<Record<BrandCorners, { card: string; button: string }>> = {
  [BrandCorners.Square]: { card: '0px', button: '0px' },
  [BrandCorners.Soft]: { card: '10px', button: '10px' },
  [BrandCorners.Round]: { card: '18px', button: '999px' },
};

/** SB-18: the identity's colours over the theme's tokens that carry the shop's own colour. */
function brandTokens(brand: PublicBrand): StorefrontTokens {
  const { main, onMain, accent, onAccent, background, text, mainText } = brand.colors;
  const corners = CORNERS[brand.corners];
  return {
    bg: background,
    text,
    main,
    'on-main': onMain,
    accent,
    'on-accent': onAccent,
    'ann-bg': main,
    'ann-fg': onMain,
    logo: mainText,
    'hero-bg': main,
    'hero-h': onMain,
    'hero-em': onMain,
    kick: onMain,
    'btn-bg': main,
    'btn-fg': onMain,
    'sec-h': text,
    link: mainText,
    orn: accent,
    price: text,
    new: main,
    'ft-bg': main,
    'ft-fg': onMain,
    'ft-h': onMain,
    'ft-logo': onMain,
    'r-card': corners.card,
    'r-btn': corners.button,
  };
}

/** The home's look: the theme's colour set, the identity over it while it shows, and the faces of either. */
export function designLook(design: PublicStorefrontDesign, brand: PublicBrand | null): DesignLook {
  const theme = STOREFRONT_THEMES[design.theme];
  const tokens = {
    ...storefrontTokens(design.theme, design.palette),
    ...(brand ? brandTokens(brand) : {}),
  };
  const heading = brand?.fonts.heading.id ?? theme.headingFont;
  const body = brand?.fonts.body.id ?? theme.bodyFont;
  const variables: Record<string, string> = { '--fh': fontStack(heading), '--fb': fontStack(body) };
  for (const [name, value] of Object.entries(tokens)) variables[`--${name}`] = value;
  return { theme, variables, fontsUrl: brandFontsUrl([heading, body], HOSTED_FACES) };
}

/** SB-8, SB-17: what every page takes of its theme -- the header's and the card's styles and the look. */
export interface PageTheme {
  header: StorefrontHeaderStyle;
  card: ProductCardStyle;
  variables: Record<string, string>;
}

/** The page's theme; null where the server sent no design (an older server), when pages are drawn as before. */
export function pageTheme(info: {
  brand: PublicBrand | null;
  design?: PublicStorefrontDesign;
}): PageTheme | null {
  if (!info.design) return null;
  const look = designLook(info.design, info.brand);
  return { header: look.theme.header, card: look.theme.card, variables: look.variables };
}

/**
 * SB-17: the identity the frame of every page wears -- the shop's own while it shows, else one drawn from its theme
 * (its main colour on its background, its fonts, its corners), so the header and footer match the home. Null where the
 * server sent no design (an older server), as before.
 */
export function frameBrand(info: {
  brand: PublicBrand | null;
  design?: PublicStorefrontDesign;
}): PublicBrand | null {
  if (info.brand || !info.design) return info.brand;
  const theme = STOREFRONT_THEMES[info.design.theme];
  const tokens = storefrontTokens(info.design.theme, info.design.palette);
  const token = (name: string): string => tokens[name] ?? '';
  return {
    version: `${info.design.theme}.${String(info.design.palette)}`,
    colors: {
      main: token('main'),
      accent: token('accent'),
      background: token('bg'),
      onMain: token('on-main'),
      onAccent: token('on-accent'),
      text: token('text'),
      mainText: token('link'),
    },
    fonts: { heading: { id: theme.headingFont }, body: { id: theme.bodyFont } },
    corners: token('r-btn') === '999px' ? BrandCorners.Round : BrandCorners.Soft,
    spacing: BrandSpacing.Comfortable,
    darkLogo: null,
    icon: null,
  };
}
