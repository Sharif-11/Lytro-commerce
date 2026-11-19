import { StockState } from '@lytronix/validators/enums';
import {
  BannerLayout,
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  STARTING_ANNOUNCEMENT_ITEMS,
  STARTING_BANNER_COLLECTIONS,
  STARTING_HERO_TILES,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  type StorefrontSection,
  type StorefrontThemeKey,
} from '@lytronix/validators';
import type {
  DeliveryZoneView,
  ImageView,
  PublicCategory,
  PublicStorefrontDesign,
} from '../../src/lib/api/storefront-api';
import { idOf, type Language, makeProduct, meghShop, type ShopFixture } from './fixtures';
import { MOCK_PORT } from './mock-server';

// STOREFRONT-BUILDER-PLAN: a shop as the builder sketch draws one of its themes' sample shops
// (docs/brand/lytro-storefront-builder.html, `SHOPS`), read from the sketch itself so the two can't drift apart.

type Pair = [string, string];

/** One of the sketch's sample shops, as its `SHOPS` holds it. */
export interface SketchShop {
  name: Pair;
  cats: [string, string, string, number][];
  products: {
    n: Pair;
    i: string;
    price: number;
    was?: number;
    best?: boolean;
    sold?: number;
    isNew?: boolean;
    left?: number;
  }[];
  hero: { i: string; k: Pair; h: Pair; p: Pair; b: Pair };
  banners: SketchBanner[];
  layout: (string | [string, string])[];
  /** BL-6: the sketch's `ONE_BANNER`, for its banner-layouts screen's one full-width banner. */
  oneBanner?: SketchBanner;
}

interface SketchBanner {
  i: string;
  k: Pair;
  b: Pair;
  s: Pair;
}

// The sketch's photos with a wide version of their own, which a seller's one photo is cropped from (SB-15).
const WIDE = new Set([
  'beauty-1',
  'beauty-3',
  'beauty-5',
  'fashion-4',
  'fashion-5',
  'fashion-6',
  'fashion-7',
  'food-1',
  'food-2',
  'food-4',
  'food-7',
  'perfume-4',
  'perfume-7',
  'perfume-8',
  'tech-1',
  'tech-3',
  'tech-5',
]);

/** BL-10: the sketch's zones (`DELIVERY`): ৳70 at home, ৳130 everywhere else, named as DLV-01 names them. */
const BUILDER_ZONES: DeliveryZoneView[] = [
  {
    id: 'home',
    name: { bn: 'ঢাকা সিটির ভেতরে', en: 'Inside Dhaka city' },
    charge: '70.00',
    noDelivery: false,
    kind: 'home',
  },
  {
    id: 'away',
    name: { bn: 'ঢাকা সিটির বাইরে', en: 'Outside Dhaka city' },
    charge: '130.00',
    noDelivery: false,
    kind: 'fallback',
  },
];

/** One of the sketch's photos, as the mock server serves it. */
export function builderPhoto(name: string): string {
  return `http://127.0.0.1:${String(MOCK_PORT)}/__photos/${name}.jpg`;
}

function picture(name: string, wide: boolean): ImageView {
  return {
    id: idOf(`photo-${name}`),
    urls: {
      main: builderPhoto(wide && WIDE.has(name) ? `${name}-wide` : name),
      thumbnail: builderPhoto(name),
    },
  };
}

const sectionId = (at: number) => `00000000-0000-4000-8000-${String(100 + at).padStart(12, '0')}`;
const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const plain = (text: string) => text.replace(/<\/?em>/g, '');
const ROW_SOURCES: Record<string, ProductRowSource> = {
  latest: ProductRowSource.Newest,
  sale: ProductRowSource.OnSale,
  hot: ProductRowSource.BestSellers,
};
const DAY_MS = 24 * 60 * 60 * 1000;

/** The sketch's shop as a fixture: its products and categories, and a design of its layout on its theme. */
export function builderShop(
  theme: StorefrontThemeKey,
  sketch: SketchShop,
  language: Language,
): Partial<ShopFixture> {
  const t = (pair: Pair) => (language === 'bn' ? pair[0] : pair[1]);
  const base = meghShop(language);
  const images: Record<string, ImageView> = {};
  const photo = (name: string, focusY = 50) => {
    const image = picture(name, true);
    images[image.id] = image;
    return { mediaId: image.id, focusX: 50, focusY };
  };
  const banners = (
    id: string,
    list: SketchBanner[],
    layout: BannerLayout | null,
  ): Extract<StorefrontSection, { kind: StorefrontSectionKind.OfferBanners }> => ({
    id,
    visible: true,
    kind: StorefrontSectionKind.OfferBanners,
    fill: StorefrontFill.Own,
    layout,
    collections: [...STARTING_BANNER_COLLECTIONS],
    banners: list.map((banner) => ({
      photo: photo(banner.i),
      kicker: t(banner.k),
      headline: t(banner.b),
      description: t(banner.s),
      button: t(['দেখুন', 'Shop']),
      link: { kind: StorefrontLinkKind.OnSale },
    })),
  });
  const categories: PublicCategory[] = sketch.cats.map(([bn, en, image, count]) => ({
    id: idOf(`cat-${en}`),
    slug: slugOf(en),
    name: t([bn, en]),
    image: null,
    cover: picture(image, false),
    productCount: count,
    children: [],
  }));
  const products = sketch.products.map((spec) => {
    const made = makeProduct({
      id: idOf(`product-${spec.n[1]}`),
      slug: slugOf(spec.n[1]),
      name: t(spec.n),
      price: spec.price,
      stockState: spec.left ? StockState.Low : StockState.In,
      createdAt: new Date(Date.now() - (spec.isNew ? 2 : 60) * DAY_MS).toISOString(),
    });
    const was = spec.was ?? null;
    made.card = {
      ...made.card,
      image: picture(spec.i, false),
      minRegularPrice: was === null ? null : was.toFixed(2),
      bestDiscount: was === null ? 0 : Math.floor(((was - spec.price) * 100) / was),
      left: spec.left ?? null,
      ordered: spec.sold ?? 0,
      bestSeller: spec.best ?? false,
    };
    return made;
  });
  const sections = sketch.layout.flatMap((entry, at): StorefrontSection[] => {
    const id = sectionId(at);
    if (Array.isArray(entry)) {
      const grid = entry[1] === 'grid';
      return [
        {
          id,
          visible: true,
          kind: StorefrontSectionKind.Products,
          source: ROW_SOURCES[entry[0]] ?? ProductRowSource.Newest,
          categoryId: null,
          productIds: [],
          title: null,
          layout: grid ? ProductRowLayout.Grid : ProductRowLayout.Carousel,
          count: grid ? 4 : 6,
        },
      ];
    }
    switch (entry) {
      case 'announce':
        return [
          {
            id,
            visible: true,
            kind: StorefrontSectionKind.Announcement,
            items: [...STARTING_ANNOUNCEMENT_ITEMS],
          },
        ];
      case 'hero-tiles':
        // BL-2, BL-3: the sketch's `heroTiles`: three of the biggest savings rotating beside the offers and what is new.
        return [
          {
            id,
            visible: true,
            kind: StorefrontSectionKind.Hero,
            fill: StorefrontFill.Auto,
            source: ProductRowSource.OnSale,
            design: HeroDesign.SlideTiles,
            tiles: [...STARTING_HERO_TILES],
            slides: [],
          },
        ];
      case 'hero':
        return [
          {
            id,
            visible: true,
            kind: StorefrontSectionKind.Hero,
            fill: StorefrontFill.Own,
            source: ProductRowSource.OnSale,
            design: null,
            tiles: [...STARTING_HERO_TILES],
            slides: [
              {
                photo: photo(sketch.hero.i, 40),
                kicker: t(sketch.hero.k),
                headline: plain(t(sketch.hero.h)),
                description: t(sketch.hero.p),
                button: t(sketch.hero.b),
                link: { kind: StorefrontLinkKind.OnSale },
              },
            ],
          },
        ];
      case 'cats':
        return [
          { id, visible: true, kind: StorefrontSectionKind.Categories, title: null, style: null },
        ];
      case 'banners':
      case 'banners-full':
        return [banners(id, sketch.banners, entry === 'banners' ? null : BannerLayout.Full)];
      case 'banners-one':
        return sketch.oneBanner ? [banners(id, [sketch.oneBanner], null)] : [];
      case 'banners-auto':
        // BL-9: filling itself from the three collections a new section starts with.
        return [{ ...banners(id, [], null), fill: StorefrontFill.Auto }];
      case 'trust':
        return [{ id, visible: true, kind: StorefrontSectionKind.Trust }];
      default:
        // The header and the footer are the page's own (PR 2b); the sketch's quotes come with the editor's.
        return [];
    }
  });
  const design: PublicStorefrontDesign = {
    theme,
    palette: 0,
    sections,
    images,
    categories: [],
    products: [],
    preview: false,
  };
  const onSale = products.filter((row) => (row.card.bestDiscount ?? 0) > 0);
  return {
    categories,
    products,
    info: {
      ...base.info,
      name: t(sketch.name),
      design,
      // BL-10: the sketch's delivery line, the home zone and everywhere else by their default names.
      deliveryZones: BUILDER_ZONES,
      extraDeliveryChargePerKg: '0.00',
      sale: {
        products: onSale.length,
        bestDiscount: Math.max(0, ...onSale.map((row) => row.card.bestDiscount ?? 0)),
      },
    },
  };
}
