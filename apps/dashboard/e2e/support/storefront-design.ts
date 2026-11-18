import {
  ProductRowLayout,
  ProductRowSource,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  StorefrontThemeKey,
  startingDesign,
  type StorefrontDesign,
  type StorefrontSection,
} from '@lytronix/validators';
import type { StorefrontEditor } from '../../src/types/storefront-design';
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
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = (n: number) => ({ mediaId: id(500 + n), focusX: 50, focusY: 40 });

/**
 * The sketch's editor (docs/brand/lytro-storefront-builder.html, `ED_ROWS`): on the Soft theme, an announcement on auto,
 * three slides of the shop's own, the categories, the six newest in a carousel, two banners, the four best sellers in a
 * grid, three quotes, the trust strip, and About turned off.
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
    { id: id(1), visible: true, kind: StorefrontSectionKind.Announcement, text: null },
    {
      id: id(2),
      visible: true,
      kind: StorefrontSectionKind.Hero,
      fill: StorefrontFill.Own,
      design: null,
      slides: [slide(1, 'Glow for Eid'), slide(2, 'New lipsticks'), slide(3, 'Skin care')],
    },
    { id: id(3), visible: true, kind: StorefrontSectionKind.Categories, title: null, style: null },
    row(4, ProductRowSource.Newest, ProductRowLayout.Carousel, 6),
    {
      id: id(5),
      visible: true,
      kind: StorefrontSectionKind.OfferBanners,
      fill: StorefrontFill.Own,
      banners: [banner(4, 'Up to 30% off'), banner(5, 'Gift sets')],
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
    images: {},
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
