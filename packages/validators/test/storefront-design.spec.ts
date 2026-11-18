import { describe, expect, it } from 'vitest';
import {
  CONTRAST_LARGE,
  CONTRAST_TEXT,
  contrastRatio,
  createProductSchema,
  discountPercent,
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  STARTING_THEME,
  startingDesign,
  startingTheme,
  STOREFRONT_PALETTES,
  STOREFRONT_THEMES,
  storefrontDesignSchema,
  storefrontMediaIds,
  storefrontPhotoRefs,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  storefrontTargetRefs,
  storefrontTargets,
  StorefrontThemeKey,
  storefrontTokens,
} from '../src/index';

// STOREFRONT-BUILDER-PLAN: the design document (SB-8, SB-14, SB-16) and the themes (SB-7, SB-11, SB-19).

const PHOTO = { mediaId: '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f', focusX: 50, focusY: 40 };
const CATEGORY = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9';
const PRODUCT = '2c3d4e5f-6071-4829-93a4-b5c6d7e8f9a0';
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function design(sections: unknown[]): unknown {
  return { theme: StorefrontThemeKey.Soft, palette: 0, sections };
}

describe('a shop that has never saved its design (SB-11)', () => {
  it('starts every theme on a page every section of which fills itself', () => {
    for (const theme of Object.values(StorefrontThemeKey)) {
      const start = startingDesign(theme);
      expect(storefrontDesignSchema.parse(start)).toEqual(start);
      expect(start.sections.length).toBeGreaterThan(4);
      for (const section of start.sections) {
        if ('fill' in section) expect(section.fill).toBe(StorefrontFill.Auto);
      }
      expect(storefrontMediaIds(start)).toEqual([]);
    }
  });

  it('gives every shop type a theme, and a type it does not know the Bold one', () => {
    const types = [
      'clothing',
      'shoes_bags',
      'cosmetics',
      'electronics',
      'mobiles_gadgets',
      'grocery',
      'food_bakery',
      'books_stationery',
      'pharmacy',
      'home_decor',
      'other',
    ];
    expect(Object.keys(STARTING_THEME).sort()).toEqual([...types].sort());
    expect(startingTheme('clothing')).toBe(StorefrontThemeKey.Studio);
    expect(startingTheme('food_bakery')).toBe(StorefrontThemeKey.Fresh);
    expect(startingTheme('somewhere_new')).toBe(StorefrontThemeKey.Bold);
    expect(startingTheme(null)).toBe(StorefrontThemeKey.Bold);
  });

  it('keeps the same section IDs every time it is read', () => {
    expect(startingDesign(StorefrontThemeKey.Royal)).toEqual(
      startingDesign(StorefrontThemeKey.Royal),
    );
  });
});

describe('what a design may hold (SB-8, SB-16)', () => {
  it('takes a page the seller has written', () => {
    const own = design([
      { id: id(1), visible: true, kind: StorefrontSectionKind.Announcement, text: 'ঈদে ২০% ছাড়' },
      {
        id: id(2),
        visible: true,
        kind: StorefrontSectionKind.Hero,
        fill: StorefrontFill.Own,
        design: null,
        slides: [
          {
            photo: PHOTO,
            kicker: null,
            headline: 'নতুন কালেকশন',
            description: null,
            button: 'দেখুন',
            link: { kind: StorefrontLinkKind.Category, categoryId: CATEGORY },
          },
        ],
      },
      {
        id: id(3),
        visible: false,
        kind: StorefrontSectionKind.Products,
        source: ProductRowSource.Picked,
        categoryId: null,
        productIds: [PRODUCT],
        title: 'আমাদের পছন্দ',
        layout: ProductRowLayout.Carousel,
        count: 6,
      },
    ]);
    const parsed = storefrontDesignSchema.parse(own);
    expect(storefrontMediaIds(parsed)).toEqual([PHOTO.mediaId]);
    expect(storefrontTargets(parsed)).toEqual({ categoryIds: [CATEGORY], productIds: [PRODUCT] });
  });

  it('refuses an own hero with no slide, a category row with no category, and two sections with one ID', () => {
    const problems = (value: unknown): string[] =>
      storefrontDesignSchema.safeParse(value).error?.issues.map((issue) => issue.path.join('.')) ??
      [];
    expect(
      problems(
        design([
          {
            id: id(1),
            visible: true,
            kind: StorefrontSectionKind.Hero,
            fill: StorefrontFill.Own,
            design: null,
            slides: [],
          },
        ]),
      ),
    ).toEqual(['sections.0.slides']);
    expect(
      problems(
        design([
          {
            id: id(1),
            visible: true,
            kind: StorefrontSectionKind.Products,
            source: ProductRowSource.Category,
            categoryId: null,
            productIds: [],
            title: null,
            layout: ProductRowLayout.Grid,
            count: 4,
          },
        ]),
      ),
    ).toEqual(['sections.0.categoryId']);
    const trust = { id: id(1), visible: true, kind: StorefrontSectionKind.Trust };
    expect(problems(design([trust, trust]))).toEqual(['sections']);
  });

  it('refuses a thirteenth section, a fourth slide, a count not offered, a key it does not know and a long headline', () => {
    const trust = (n: number) => ({ id: id(n), visible: true, kind: StorefrontSectionKind.Trust });
    expect(
      storefrontDesignSchema.safeParse(design(Array.from({ length: 13 }, (_, n) => trust(n + 1))))
        .success,
    ).toBe(false);
    const slide = {
      photo: PHOTO,
      kicker: null,
      headline: 'ক',
      description: null,
      button: 'দেখুন',
      link: { kind: StorefrontLinkKind.OnSale },
    };
    const hero = (slides: unknown[]) => ({
      id: id(1),
      visible: true,
      kind: StorefrontSectionKind.Hero,
      fill: StorefrontFill.Own,
      design: null,
      slides,
    });
    expect(storefrontDesignSchema.safeParse(design([hero([slide, slide, slide])])).success).toBe(
      true,
    );
    expect(
      storefrontDesignSchema.safeParse(design([hero([slide, slide, slide, slide])])).success,
    ).toBe(false);
    expect(
      storefrontDesignSchema.safeParse(design([hero([{ ...slide, headline: 'ক'.repeat(61) }])]))
        .success,
    ).toBe(false);
    expect(storefrontDesignSchema.safeParse(design([{ ...trust(1), extra: true }])).success).toBe(
      false,
    );
    const products = {
      id: id(1),
      visible: true,
      kind: StorefrontSectionKind.Products,
      source: ProductRowSource.Newest,
      categoryId: null,
      productIds: [],
      title: null,
      layout: ProductRowLayout.Grid,
    };
    expect(storefrontDesignSchema.safeParse(design([{ ...products, count: 6 }])).success).toBe(
      true,
    );
    expect(storefrontDesignSchema.safeParse(design([{ ...products, count: 5 }])).success).toBe(
      false,
    );
  });

  it('refuses a theme or a colour set it does not have', () => {
    expect(
      storefrontDesignSchema.safeParse({ theme: 'neon', palette: 0, sections: [] }).success,
    ).toBe(false);
    expect(
      storefrontDesignSchema.safeParse({
        theme: StorefrontThemeKey.Bold,
        palette: STOREFRONT_PALETTES,
        sections: [],
      }).success,
    ).toBe(false);
  });
});

// SB-19: every pair of text and background a theme draws, in each of its colour sets, passes BRN-03.
const SMALL: readonly [string, string][] = [
  ['text', 'bg'],
  ['muted', 'bg'],
  ['btn-fg', 'btn-bg'],
  ['on-main', 'main'],
  ['ann-fg', 'ann-bg'],
  ['chip-fg', 'chip-bg'],
  ['link', 'bg'],
  ['price', 'card-bg'],
  ['ft-fg', 'ft-bg'],
  ['ft-h', 'ft-bg'],
];
const LARGE: readonly [string, string][] = [['sec-h', 'bg']];
const WHITE_ON: readonly string[] = ['sale', 'new', 'best'];

/** A token's colour: its first hex value (a gradient's first stop); a transparent card shows the page. */
function colourOf(tokens: Readonly<Record<string, string>>, key: string): string {
  const value = tokens[key] === 'transparent' ? tokens['bg'] : tokens[key];
  const hex = /#[0-9a-f]{6}/i.exec(value ?? '');
  if (!hex) throw new Error(`no colour for ${key}`);
  return hex[0];
}

describe('every theme reads clearly in every colour set (SB-19, BRN-03)', () => {
  it('passes 4.5:1 for text, 3:1 for headings, and white on every badge', () => {
    const failing: string[] = [];
    for (const theme of Object.values(StorefrontThemeKey)) {
      for (let palette = 0; palette < STOREFRONT_PALETTES; palette += 1) {
        const tokens = storefrontTokens(theme, palette);
        const check = (fg: string, bg: string, least: number): void => {
          const ratio = contrastRatio(colourOf(tokens, fg), colourOf(tokens, bg));
          if (ratio < least)
            failing.push(`${theme}/${String(palette)} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
        };
        for (const [fg, bg] of SMALL) check(fg, bg, CONTRAST_TEXT);
        for (const [fg, bg] of LARGE) check(fg, bg, CONTRAST_LARGE);
        for (const badge of WHITE_ON) {
          const ratio = contrastRatio('#ffffff', colourOf(tokens, badge));
          if (ratio < CONTRAST_TEXT)
            failing.push(`${theme}/${String(palette)} white on ${badge}: ${ratio.toFixed(2)}`);
        }
        // A split hero's words sit on the hero's own background.
        if (STOREFRONT_THEMES[theme].hero === HeroDesign.Split) {
          check('kick', 'hero-bg', CONTRAST_TEXT);
          check('hero-h', 'hero-bg', CONTRAST_LARGE);
        }
      }
    }
    expect(failing).toEqual([]);
  });
});

describe('where a design names its photos and targets (SB-15, SB-16)', () => {
  it('names each by its field, in order', () => {
    const parsed = storefrontDesignSchema.parse(
      design([
        {
          id: id(1),
          visible: true,
          kind: StorefrontSectionKind.WideBanner,
          banner: {
            photo: PHOTO,
            kicker: null,
            headline: 'অফার',
            description: null,
            button: 'দেখুন',
            link: { kind: StorefrontLinkKind.Product, productId: PRODUCT },
          },
        },
        {
          id: id(2),
          visible: true,
          kind: StorefrontSectionKind.Products,
          source: ProductRowSource.Category,
          categoryId: CATEGORY,
          productIds: [],
          title: null,
          layout: ProductRowLayout.Grid,
          count: 4,
        },
      ]),
    );
    expect(storefrontPhotoRefs(parsed)).toEqual([
      {
        sectionId: id(1),
        field: 'sections.0.banner.photo.mediaId',
        mediaId: PHOTO.mediaId,
        wide: true,
      },
    ]);
    expect(storefrontTargetRefs(parsed)).toEqual([
      { sectionId: id(1), field: 'sections.0.banner.link.productId', kind: 'product', id: PRODUCT },
      { sectionId: id(2), field: 'sections.1.categoryId', kind: 'category', id: CATEGORY },
    ]);
  });
});

describe('the regular price and its saving (SB-10, SB-21)', () => {
  it('rounds a saving down, and counts none without a regular price above the price', () => {
    expect(discountPercent('1000.00', '1250.00')).toBe(20);
    expect(discountPercent('999.00', '1250.00')).toBe(20);
    expect(discountPercent('0.10', '0.30')).toBe(66);
    expect(discountPercent('995.00', '1000.00')).toBe(0);
    expect(discountPercent('1000.00', '1000.00')).toBe(0);
    expect(discountPercent('1000.00', '900.00')).toBe(0);
    expect(discountPercent('1000.00', null)).toBe(0);
  });

  it('refuses a regular price below the price sent with it', () => {
    const product = { name: 'Shawl', basePrice: 1000 };
    expect(createProductSchema.safeParse({ ...product, regularPrice: 1250 }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...product, regularPrice: 1000 }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...product, regularPrice: null }).success).toBe(true);
    const below = createProductSchema.safeParse({ ...product, regularPrice: 999 });
    expect(below.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['regularPrice']);
  });
});
