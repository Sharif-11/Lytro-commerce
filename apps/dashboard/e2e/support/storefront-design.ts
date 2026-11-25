import {
  AnnouncementItemKind,
  StockState,
  StorefrontCardMode,
  ProductRowLayout,
  ProductRowSource,
  STARTING_ANNOUNCEMENT_ITEMS,
  STARTING_BANNER_COLLECTIONS,
  STARTING_HERO_TILES,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  StorefrontThemeKey,
  startingDesign,
  type PreviewLayout,
  type StorefrontDesign,
  type StorefrontSection,
} from '@lytronix/validators';
import type {
  StorefrontCard,
  StorefrontCards,
  StorefrontEditor,
} from '../../src/types/storefront-design';
import { isShown, modesOf } from '../../src/views/design/card-order';
import type { ImageFixture } from './settings';

// STOREFRONT-BUILDER-PLAN SB-5, SB-12: the storefront design as the server answers it (GET /storefront/design), and the
// editor's writes -- the draft saved whole, dropped, published, the one before brought back, a preview link, the icon
// -- kept so a read after shows what changed.

export interface DesignFixture {
  draft: StorefrontDesign | null;
  published: StorefrontDesign | null;
  previous: StorefrontDesign | null;
  /** SB-5: the shop's square icon; /me carries it. */
  icon: ImageFixture | null;
  /** The sections naming something gone or hidden. */
  broken: string[];
  /**
   * SB-32 as amended (sketch `de-*`): what the storefront says the saved draft's home leaves out (/preview/layout);
   * unset, nothing; null, the storefront could not be asked.
   */
  layout?: PreviewLayout | null;
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = (n: number) => ({ mediaId: id(500 + n), focusX: 50, focusY: 40 });

/** Where the mock serves the sketch's own sample photos (docs/brand/sample-photos/builder). */
export const BUILDER_PHOTOS = '/__builder/';
// The sketch's photos the drawn design's slides (1-3) and banners (4-6) show.
const PHOTOS: Readonly<Record<number, string>> = {
  1: 'beauty-1-wide',
  2: 'beauty-3-wide',
  3: 'beauty-5-wide',
  4: 'beauty-3-wide',
  5: 'beauty-5-wide',
  6: 'beauty-1-wide',
};
const IMAGES = Object.fromEntries(
  Object.entries(PHOTOS).map(([n, file]) => {
    const url = `${BUILDER_PHOTOS}${file}.jpg`;
    return [id(500 + Number(n)), { id: id(500 + Number(n)), urls: { main: url, thumbnail: url } }];
  }),
);

/**
 * The sketch's editor (docs/brand/lytro-storefront-builder.html, `ED_ROWS`): on the Soft theme, an announcement of four
 * lines, three slides of the shop's own, the categories, the six newest in a carousel, three banners, the four best
 * sellers in a grid, three quotes, the trust strip, and About turned off.
 */
function sketchedSections(): StorefrontSection[] {
  const slide = (n: number, headline: string) => ({
    photo: photo(n),
    kicker: null,
    headline,
    description: null,
    button: 'Shop now',
    link: { kind: StorefrontLinkKind.OnSale } as const,
  });
  const banner = (n: number, headline: string) => ({ ...slide(n, headline), button: 'Shop' });
  const row = (
    n: number,
    source: ProductRowSource,
    layout: ProductRowLayout,
    count: 4 | 6,
  ): StorefrontSection => ({
    id: id(n),
    visible: true,
    kind: StorefrontSectionKind.Products,
    source,
    categoryId: null,
    productIds: [],
    title: null,
    layout,
    count,
  });
  return [
    {
      id: id(1),
      visible: true,
      kind: StorefrontSectionKind.Announcement,
      // BL-10: the three automatic items, and a line of the shop's own.
      items: [
        ...STARTING_ANNOUNCEMENT_ITEMS,
        { kind: AnnouncementItemKind.Own, text: 'A gift with Eid orders over ৳2,000' },
      ],
    },
    {
      id: id(2),
      visible: true,
      kind: StorefrontSectionKind.Hero,
      fill: StorefrontFill.Own,
      source: ProductRowSource.OnSale,
      design: null,
      slides: [slide(1, 'Glow for Eid'), slide(2, 'New lipsticks'), slide(3, 'Skin care')],
      tiles: [...STARTING_HERO_TILES],
    },
    { id: id(3), visible: true, kind: StorefrontSectionKind.Categories, title: null, style: null },
    row(4, ProductRowSource.Newest, ProductRowLayout.Carousel, 6),
    {
      id: id(5),
      visible: true,
      kind: StorefrontSectionKind.OfferBanners,
      fill: StorefrontFill.Own,
      // BL-6, BL-7: three of the shop's own, laid out by their number (big + two).
      layout: null,
      collections: [...STARTING_BANNER_COLLECTIONS],
      banners: [
        banner(4, 'Up to 30% off'),
        banner(5, 'Gift sets'),
        banner(6, 'A new liquid lip set'),
      ],
    },
    row(6, ProductRowSource.BestSellers, ProductRowLayout.Grid, 4),
    {
      id: id(7),
      visible: true,
      kind: StorefrontSectionKind.Testimonials,
      title: null,
      quotes: [
        { name: 'Nusrat', place: 'Dhaka', text: 'Arrived in two days.' },
        { name: 'Tania', place: 'Chattogram', text: 'Just as in the photos.' },
        { name: 'Mim', place: 'Sylhet', text: 'Lovely packing.' },
      ],
    },
    { id: id(8), visible: true, kind: StorefrontSectionKind.Trust },
    {
      id: id(9),
      visible: false,
      kind: StorefrontSectionKind.About,
      title: 'Our story',
      text: 'A small shop of good things.',
      photo: null,
    },
  ];
}

/**
 * The sketch's editor with its draft of three changes (`e-publish`): live, the Fresh theme with the hero on auto and
 * About on; the draft moves to Soft, puts in three slides of its own and turns About off. A design was live before it.
 */
export function drawnDesign(): DesignFixture {
  const draft: StorefrontDesign = {
    theme: StorefrontThemeKey.Soft,
    palette: 0,
    sections: sketchedSections(),
  };
  const published: StorefrontDesign = {
    theme: StorefrontThemeKey.Fresh,
    palette: 0,
    sections: draft.sections.map((section) => {
      if (section.kind === StorefrontSectionKind.Hero) {
        return { ...section, fill: StorefrontFill.Auto, slides: [] };
      }
      if (section.kind === StorefrontSectionKind.About) return { ...section, visible: true };
      return section;
    }),
  };
  return {
    draft,
    published,
    previous: startingDesign(StorefrontThemeKey.Studio),
    icon: null,
    broken: [],
  };
}

/** A shop that has published nothing: its type's starting design (a clothing shop's, Studio), no draft. */
export function startingOnly(): DesignFixture {
  return { draft: null, published: null, previous: null, icon: null, broken: [] };
}

const STARTING = StorefrontThemeKey.Studio;

function editorOf(fixture: DesignFixture): StorefrontEditor {
  const live = fixture.published ?? startingDesign(STARTING);
  return {
    design: fixture.draft ?? live,
    live,
    startingTheme: STARTING,
    hasDraft: fixture.draft !== null,
    isPublished: fixture.published !== null,
    canGoBack: fixture.previous !== null,
    draftSavedAt: fixture.draft ? new Date().toISOString() : null,
    publishedAt: fixture.published ? new Date(Date.now() - 86_400_000).toISOString() : null,
    images: IMAGES,
    categories: [],
    products: [],
    broken: fixture.broken,
  };
}

/** GET /storefront/design, else undefined. */
export function designAnswer(path: string, fixture: DesignFixture): unknown {
  return path === '/storefront/design' ? editorOf(fixture) : undefined;
}

// The preview link's token, and the tiny PNG the icon's picture answers with.
export const PREVIEW_TOKEN = 'preview-token';
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** One of the editor's writes, kept in the fixture, or undefined when the path is not one of its. */
export function designWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: DesignFixture,
): { data: unknown } | undefined {
  if (method === 'PUT' && path === '/storefront/design') {
    fixture.draft = body?.design as StorefrontDesign;
    return { data: editorOf(fixture) };
  }
  if (method === 'DELETE' && path === '/storefront/design/draft') {
    fixture.draft = null;
    return { data: editorOf(fixture) };
  }
  if (method === 'POST' && path === '/storefront/design/publish' && fixture.draft) {
    fixture.previous = fixture.published;
    fixture.published = fixture.draft;
    fixture.draft = null;
    return { data: editorOf(fixture) };
  }
  if (method === 'POST' && path === '/storefront/design/back' && fixture.previous) {
    const was = fixture.published;
    fixture.published = fixture.previous;
    fixture.previous = was;
    fixture.draft = null;
    return { data: editorOf(fixture) };
  }
  if (method === 'POST' && path === '/storefront/design/preview') {
    return {
      data: { token: PREVIEW_TOKEN, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
    };
  }
  if (method === 'PUT' && path === '/shop-settings/icon') {
    fixture.icon =
      typeof body?.mediaId === 'string'
        ? { id: body.mediaId, urls: { main: PIXEL, thumbnail: PIXEL } }
        : null;
    return { data: {} };
  }
  return undefined;
}

/** DC-6 to DC-8: the shop's cards as the Product list reads them, kept as the page's writes change them. */
export type CardsFixture = StorefrontCards;

function sellerCard(
  productId: string,
  name: string,
  photo: string,
  price: string,
  more: Partial<StorefrontCard> = {},
): StorefrontCard {
  const url = `${BUILDER_PHOTOS}${photo}.jpg`;
  return {
    productId,
    designId: null,
    name,
    designName: null,
    designNumber: null,
    price,
    stockState: StockState.In,
    active: true,
    image: { id: `m-${photo}`, urls: { main: url, thumbnail: url } },
    placed: false,
    shown: true,
    mode: null,
    ...more,
  };
}

/**
 * The sketch's Product list (`e-order`): Megh Fashion's cards, the Printed shirt in three designs (its third sold out)
 * spread as cards and its own card not shown, and a hidden Linen panjabi kept in its place.
 */
export function drawnCards(): CardsFixture {
  const shirt = { mode: StorefrontCardMode.Designs };
  const design = (n: number, photo: string, more: Partial<StorefrontCard> = {}) =>
    sellerCard('p-shirt', 'Printed shirt', photo, '1150.00', {
      ...shirt,
      designId: `d-shirt-${String(n)}`,
      designName: `Design ${String(n)}`,
      designNumber: n,
      ...more,
    });
  return {
    designCards: true,
    cards: [
      sellerCard('p-panjabi', 'Embroidered panjabi', 'fashion-4-tall', '1450.00'),
      sellerCard('p-shirt', 'Printed shirt', 'fashion-3-tall', '1150.00', {
        ...shirt,
        shown: false,
      }),
      design(1, 'fashion-3-tall'),
      sellerCard('p-kurti', 'Chikankari kurti', 'fashion-5-tall', '1250.00'),
      design(2, 'fashion-7-tall'),
      sellerCard('p-saree', 'Cotton saree', 'fashion-6-tall', '2200.00'),
      design(3, 'fashion-1-tall', { stockState: StockState.Out }),
      sellerCard('p-linen', 'Linen panjabi', 'fashion-4', '1690.00', { active: false }),
    ],
  };
}

const keyOf = (card: { productId: string; designId: string | null }) =>
  `${card.productId}:${card.designId ?? ''}`;

/** GET storefront/design/cards, else undefined. */
export function cardsAnswer(path: string, fixture: CardsFixture): unknown {
  return path === '/storefront/design/cards' ? fixture : undefined;
}

/** The Product list's writes: the order and the ways, and the switch. */
export function cardsWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: CardsFixture,
): { data: unknown } | undefined {
  if (method === 'PUT' && path === '/storefront/design/cards/order') {
    const modes = (body?.['modes'] ?? []) as { productId: string; mode: StorefrontCardMode }[];
    const named = (body?.['cards'] ?? []) as { productId: string; designId: string | null }[];
    const byKey = new Map(fixture.cards.map((card) => [keyOf(card), card]));
    const way = {
      ...modesOf(fixture.cards),
      ...Object.fromEntries(modes.map((m) => [m.productId, m.mode])),
    };
    const placed = named.flatMap((each) => byKey.get(keyOf(each)) ?? []);
    const rest = fixture.cards.filter((card) => !placed.includes(card));
    fixture.cards = [...placed, ...rest].map((card) => {
      const mode = card.mode === null ? null : (way[card.productId] ?? card.mode);
      const next = { ...card, mode, placed: placed.includes(card) };
      return { ...next, shown: isShown({ ...next, shown: card.shown }, way) };
    });
    return { data: fixture };
  }
  if (method === 'PUT' && path === '/storefront/design/cards/designs') {
    fixture.designCards = body?.['on'] === true;
    return { data: fixture };
  }
  return undefined;
}
