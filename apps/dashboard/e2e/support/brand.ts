import {
  BRAND_FONTS,
  BrandCorners,
  BrandFont,
  BrandSpacing,
  brandContrast,
  derivedBrandColors,
  type BrandColors,
} from '@lytronix/validators';

// The shop's brand identity as the server answers it (GET /brand, BRN-02 to BRN-05), and the editor's writes, kept so a
// read after shows what changed. A save is refused as the server refuses it: switching on without the add-on or the
// plan's feature, and switching on or saving while on with a colour pair under AA (BRN-03).

export interface ImageFixture {
  id: string;
  urls: { main: string; thumbnail: string };
}

export interface BrandFixture {
  useBrand: boolean;
  /** The add-on or the plan lets it show (BRN-05). */
  allowed: boolean;
  identity: BrandColors & {
    headingFont: BrandFont;
    bodyFont: BrandFont;
    corners: BrandCorners;
    spacing: BrandSpacing;
    darkLogo: ImageFixture | null;
    icon: ImageFixture | null;
  };
  savedAt: string | null;
}

// A tiny PNG an image's links answer with, so the page draws a real picture.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** An image of the shop's, by id, as the server lists one. */
export function brandImage(id: string): ImageFixture {
  return { id, urls: { main: PIXEL, thumbnail: PIXEL } };
}

/**
 * The prototype's `brand`: teal and marigold on sand, Tiro Bangla with Lora for headings and Lytro's own for body text,
 * soft corners, comfortable spacing, no dark logo or icon yet, switched on and allowed.
 */
export function drawnBrand(): BrandFixture {
  return {
    useBrand: true,
    allowed: true,
    identity: {
      mainColor: '#0f6e6a',
      accentColor: '#f2a93b',
      backgroundColor: '#f6f4ee',
      headingFont: BrandFont.TiroBanglaLora,
      bodyFont: BrandFont.NotoSansBengaliInter,
      corners: BrandCorners.Soft,
      spacing: BrandSpacing.Comfortable,
      darkLogo: null,
      icon: null,
    },
    savedAt: '2026-10-20T08:00:00.000Z',
  };
}

function view(brand: BrandFixture): unknown {
  const { mainColor, accentColor, backgroundColor } = brand.identity;
  return {
    useBrand: brand.useBrand,
    allowed: brand.allowed,
    live: brand.useBrand && brand.allowed,
    identity: brand.identity,
    contrast: brandContrast({ mainColor, accentColor, backgroundColor }),
    savedAt: brand.savedAt,
  };
}

/**
 * BRN-07: the identity as /me carries it while it shows (on and allowed) -- tokens, the text derived for each colour,
 * the two pairs -- else null. Its version moves with whatever it shows, as the server's does.
 */
export function liveBrand(brand: BrandFixture): unknown {
  if (!brand.useBrand || !brand.allowed) return null;
  const { mainColor, accentColor, backgroundColor, headingFont, bodyFont, ...look } =
    brand.identity;
  const colours = { mainColor, accentColor, backgroundColor };
  return {
    version: JSON.stringify(brand.identity),
    colors: {
      main: mainColor,
      accent: accentColor,
      background: backgroundColor,
      ...derivedBrandColors(colours),
    },
    fonts: { heading: BRAND_FONTS[headingFont], body: BRAND_FONTS[bodyFont] },
    corners: look.corners,
    spacing: look.spacing,
    darkLogo: look.darkLogo,
    icon: look.icon,
  };
}

/** GET /brand, else undefined. */
export function brandAnswer(path: string, brand: BrandFixture): unknown {
  return path === '/brand' ? view(brand) : undefined;
}

type Refused = { refused: { status: number; code: string; message: string; details: unknown } };

const NEEDS_ADDON: Refused = {
  refused: {
    status: 403,
    code: 'plan_feature_unavailable',
    message: 'Your brand needs the brand identity add-on to switch on.',
    details: {},
  },
};

const LOW_CONTRAST: Refused = {
  refused: {
    status: 422,
    code: 'validation_error',
    message: 'Some colours are too hard to read together.',
    details: {},
  },
};

/** A brand write, kept in the fixture, or undefined when the path is not the editor's. */
export function brandWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  brand: BrandFixture,
): { data: unknown } | Refused | undefined {
  if (method === 'PUT' && path === '/brand' && body) {
    const was = brand.useBrand;
    const useBrand = typeof body.useBrand === 'boolean' ? body.useBrand : was;
    const colours: BrandColors = {
      mainColor: String(body.mainColor),
      accentColor: String(body.accentColor),
      backgroundColor: String(body.backgroundColor),
    };
    if (useBrand && !was && !brand.allowed) return NEEDS_ADDON;
    if (useBrand && !brandContrast(colours).passes) return LOW_CONTRAST;
    const image = (id: unknown): ImageFixture | null =>
      typeof id === 'string' ? brandImage(id) : null;
    brand.useBrand = useBrand;
    brand.identity = {
      ...colours,
      headingFont: body.headingFont as BrandFont,
      bodyFont: body.bodyFont as BrandFont,
      corners: body.corners as BrandCorners,
      spacing: body.spacing as BrandSpacing,
      darkLogo: image(body.darkLogoId),
      icon: image(body.iconId),
    };
    brand.savedAt = new Date().toISOString();
    return { data: view(brand) };
  }
  if (method === 'PUT' && path === '/brand/switch' && body) {
    const on = body.useBrand === true;
    if (on && !brand.useBrand) {
      if (!brand.allowed) return NEEDS_ADDON;
      if (!brandContrast(brand.identity).passes) return LOW_CONTRAST;
    }
    brand.useBrand = on;
    return { data: view(brand) };
  }
  return undefined;
}
