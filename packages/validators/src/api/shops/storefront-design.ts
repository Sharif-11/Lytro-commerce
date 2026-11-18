import { z } from 'zod';
import { IMAGE_LONG_EDGE_PX } from '../../common/limits';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema } from '../catalogue/catalogue-common';

// STOREFRONT-BUILDER-PLAN (SB-1, SB-7, SB-8): a shop's storefront is a theme and the home page's sections, kept as one
// document per shop (draft, published, previous). Only the home page has sections; the header and the footer are
// fixed and never in the list. The sketch is docs/brand/lytro-storefront-builder.html.

/** SB-7: the five themes. */
export enum StorefrontThemeKey {
  Royal = 'royal',
  Fresh = 'fresh',
  Bold = 'bold',
  Soft = 'soft',
  Studio = 'studio',
}

/** SB-8: what a home page section can be. */
export enum StorefrontSectionKind {
  Announcement = 'announcement',
  Hero = 'hero',
  Categories = 'categories',
  Products = 'products',
  OfferBanners = 'offer_banners',
  WideBanner = 'wide_banner',
  Trust = 'trust',
  Testimonials = 'testimonials',
  About = 'about',
}

/** SB-9: a section filled from the shop's own data, or with the seller's own words and photos. */
export enum StorefrontFill {
  Auto = 'auto',
  Own = 'own',
}

/** SB-9: which products a product row shows. */
export enum ProductRowSource {
  Newest = 'newest',
  OnSale = 'on_sale',
  BestSellers = 'best_sellers',
  Category = 'category',
  Picked = 'picked',
}

export enum ProductRowLayout {
  Grid = 'grid',
  Carousel = 'carousel',
}

/** The hero's design; null in a section means the theme's own. */
export enum HeroDesign {
  Split = 'split',
  Overlay = 'overlay',
  SlideTiles = 'slide_tiles',
}

/** How categories are drawn; null in a section means the theme's own. */
export enum CategoryTileStyle {
  Circle = 'circle',
  Square = 'square',
  Tall = 'tall',
  Pill = 'pill',
}

/** SB-16: where a button goes, chosen from a list, never typed. */
export enum StorefrontLinkKind {
  OnSale = 'on_sale',
  JustIn = 'just_in',
  BestSellers = 'best_sellers',
  Category = 'category',
  Product = 'product',
}

/** STOREFRONT-BUILDER-PLAN BL-6: how offer banners are laid out; null in a section means by their number. */
export enum BannerLayout {
  /** One under another, each the page's width. */
  Full = 'full',
  Side = 'side',
  /** One big banner and two small ones beside it (under it on a phone). */
  BigTwo = 'big_two',
}

/** BL-10: an item of the announcement bar: one of the three the shop's data writes, or the seller's own line. */
export enum AnnouncementItemKind {
  CashOnDelivery = 'cash_on_delivery',
  Delivery = 'delivery',
  Offers = 'offers',
  Own = 'own',
}

// SB-8's limits. Every text has a longest length (SEC-12).
export const STOREFRONT_SECTIONS_MAX = 12;
export const STOREFRONT_HERO_SLIDES_MAX = 3;
// BL-2: the slide-and-tiles hero's tiles.
export const STOREFRONT_HERO_TILES = 2;
// BL-7: up to three banners, the seller's own or filling themselves.
export const STOREFRONT_OFFER_BANNERS_MAX = 3;
// BL-10: the bar's items, its three automatic ones among them.
export const STOREFRONT_ANNOUNCEMENT_ITEMS_MAX = 6;
// BL-18: a line of the seller's own, short enough that two fit a phone's bar.
export const STOREFRONT_ANNOUNCEMENT_LINE_MAX = 40;
export const STOREFRONT_TESTIMONIALS_MAX = 6;
export const STOREFRONT_PICKED_PRODUCTS_MAX = 12;
export const STOREFRONT_ROW_COUNTS = [4, 6, 8, 12] as const;
export const STOREFRONT_PALETTES = 3;
export const STOREFRONT_HEADLINE_MAX = 60;
export const STOREFRONT_KICKER_MAX = 40;
export const STOREFRONT_BANNER_HEADLINE_MAX = 40;
export const STOREFRONT_DESCRIPTION_MAX = 140;
export const STOREFRONT_BUTTON_MAX = 24;
export const STOREFRONT_TITLE_MAX = 60;
export const STOREFRONT_QUOTE_MAX = 240;
export const STOREFRONT_PERSON_MAX = 60;
export const STOREFRONT_PLACE_MAX = 40;
export const STOREFRONT_ABOUT_MAX = 600;
// SB-15: a slide's or a banner's photo is at least this wide, so a desktop's wide band stays sharp.
export const STOREFRONT_PHOTO_MIN_WIDTH = 1200;

/**
 * SB-15: whether a picture this size is wide enough for a slide or a banner once stored -- its long edge cut to
 * IMAGE_LONG_EDGE_PX, so a tall photo loses width -- as the server will find it. The editor checks before it sends.
 */
export function storefrontPhotoFits(width: number, height: number): boolean {
  const kept = width * Math.min(1, IMAGE_LONG_EDGE_PX / Math.max(width, height, 1));
  return Math.round(kept) >= STOREFRONT_PHOTO_MIN_WIDTH;
}
// SB-12: how long a preview link works.
export const STOREFRONT_PREVIEW_MINUTES = 30;

const words = (max: number) => z.string().trim().min(1).max(max);
const maybeWords = (max: number) => words(max).nullable();

const onSaleLink = z.object({ kind: z.literal(StorefrontLinkKind.OnSale) }).strict();
const justInLink = z.object({ kind: z.literal(StorefrontLinkKind.JustIn) }).strict();
const bestSellersLink = z.object({ kind: z.literal(StorefrontLinkKind.BestSellers) }).strict();
const categoryLink = z
  .object({ kind: z.literal(StorefrontLinkKind.Category), categoryId: catalogueIdSchema })
  .strict();

/** SB-16: a button's target. */
export const storefrontLinkSchema = z.discriminatedUnion('kind', [
  onSaleLink,
  justInLink,
  bestSellersLink,
  categoryLink,
  z.object({ kind: z.literal(StorefrontLinkKind.Product), productId: catalogueIdSchema }).strict(),
]);
export type StorefrontLink = z.infer<typeof storefrontLinkSchema>;

/**
 * BL-3, BL-9: what a hero tile or a banner filling itself shows: a collection of the shop's -- on sale, just in, best
 * sellers or one category -- drawn from its data and opened by a tap. A button's targets, short of one product.
 */
export const storefrontCollectionSchema = z.discriminatedUnion('kind', [
  onSaleLink,
  justInLink,
  bestSellersLink,
  categoryLink,
]);
export type StorefrontCollection = z.infer<typeof storefrontCollectionSchema>;

/** BL-3, BL-5: what a hero filling itself shows: a product row's sources, short of a category or picks. */
export const heroSourceSchema = z.union([
  z.literal(ProductRowSource.OnSale),
  z.literal(ProductRowSource.Newest),
  z.literal(ProductRowSource.BestSellers),
]);
export type HeroSource = z.infer<typeof heroSourceSchema>;

/** BL-6: the layouts a number of banners can take, the number's own last. */
export const BANNER_LAYOUTS: Readonly<Record<number, readonly BannerLayout[]>> = {
  1: [BannerLayout.Full],
  2: [BannerLayout.Full, BannerLayout.Side],
  3: [BannerLayout.Full, BannerLayout.Side, BannerLayout.BigTwo],
};

/** BL-6, BL-15: how this many banners are laid out: the seller's pick while it fits, else the number's own. */
export function bannerLayoutFor(count: number, chosen: BannerLayout | null): BannerLayout {
  const fits = BANNER_LAYOUTS[count] ?? [BannerLayout.Full];
  if (chosen !== null && fits.includes(chosen)) return chosen;
  return fits.at(-1) ?? BannerLayout.Full;
}

/** BL-3: a hero's tiles to start with: the offers, and what is just in. */
export const STARTING_HERO_TILES: readonly StorefrontCollection[] = [
  { kind: StorefrontLinkKind.OnSale },
  { kind: StorefrontLinkKind.JustIn },
];
/** BL-9: a new banners section's collections on auto: the offers, what is just in, the best sellers. */
export const STARTING_BANNER_COLLECTIONS: readonly StorefrontCollection[] = [
  { kind: StorefrontLinkKind.OnSale },
  { kind: StorefrontLinkKind.JustIn },
  { kind: StorefrontLinkKind.BestSellers },
];

/**
 * SB-15: a photo the seller uploaded, with its focal point in percent of the width and the height: a phone keeps a
 * square around it, a desktop a wide band.
 */
export const storefrontPhotoSchema = z
  .object({
    mediaId: catalogueIdSchema,
    focusX: z.number().int().min(0).max(100),
    focusY: z.number().int().min(0).max(100),
  })
  .strict();
export type StorefrontPhoto = z.infer<typeof storefrontPhotoSchema>;

export const heroSlideSchema = z
  .object({
    photo: storefrontPhotoSchema,
    kicker: maybeWords(STOREFRONT_KICKER_MAX),
    headline: words(STOREFRONT_HEADLINE_MAX),
    description: maybeWords(STOREFRONT_DESCRIPTION_MAX),
    button: words(STOREFRONT_BUTTON_MAX),
    link: storefrontLinkSchema,
  })
  .strict();
export type HeroSlide = z.infer<typeof heroSlideSchema>;

export const storefrontBannerSchema = z
  .object({
    photo: storefrontPhotoSchema,
    kicker: maybeWords(STOREFRONT_KICKER_MAX),
    headline: words(STOREFRONT_BANNER_HEADLINE_MAX),
    description: maybeWords(STOREFRONT_DESCRIPTION_MAX),
    button: words(STOREFRONT_BUTTON_MAX),
    link: storefrontLinkSchema,
  })
  .strict();
export type StorefrontBanner = z.infer<typeof storefrontBannerSchema>;

export const testimonialSchema = z
  .object({
    name: words(STOREFRONT_PERSON_MAX),
    place: maybeWords(STOREFRONT_PLACE_MAX),
    text: words(STOREFRONT_QUOTE_MAX),
  })
  .strict();
export type Testimonial = z.infer<typeof testimonialSchema>;

// Every section has an ID of its own (so the editor can point at it) and can be hidden without losing its content.
const sectionBase = { id: z.guid(), visible: z.boolean() };

const automaticItem = <K extends AnnouncementItemKind>(kind: K) =>
  z.object({ kind: z.literal(kind), visible: z.boolean() }).strict();

/**
 * BL-10: an item of the bar: cash on delivery, the delivery charges or the offers on now, each written by the shop's
 * data and turned on or off; or a line of the seller's own.
 */
export const announcementItemSchema = z.discriminatedUnion('kind', [
  automaticItem(AnnouncementItemKind.CashOnDelivery),
  automaticItem(AnnouncementItemKind.Delivery),
  automaticItem(AnnouncementItemKind.Offers),
  z
    .object({
      kind: z.literal(AnnouncementItemKind.Own),
      text: words(STOREFRONT_ANNOUNCEMENT_LINE_MAX),
    })
    .strict(),
]);
export type AnnouncementItem = z.infer<typeof announcementItemSchema>;

/** BL-10: the bar's three automatic items, each once, in the order a new bar lists them. */
export const AUTOMATIC_ANNOUNCEMENT_ITEMS = [
  AnnouncementItemKind.CashOnDelivery,
  AnnouncementItemKind.Delivery,
  AnnouncementItemKind.Offers,
] as const;

/** BL-10: the bar's items two at a time, the last alone when they are odd (five: 1-2, 3-4, 5). */
export function announcementPairs<T>(items: readonly T[]): T[][] {
  const pairs: T[][] = [];
  for (let at = 0; at < items.length; at += 2) pairs.push(items.slice(at, at + 2));
  return pairs;
}

/** BL-10: a new bar: its three automatic items, all on. */
export const STARTING_ANNOUNCEMENT_ITEMS: readonly AnnouncementItem[] =
  AUTOMATIC_ANNOUNCEMENT_ITEMS.map((kind) => ({ kind, visible: true }));

const announcementSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.Announcement),
    // BL-10: shown two at a time, in this order; the offers only while something is on sale.
    items: z.array(announcementItemSchema).max(STOREFRONT_ANNOUNCEMENT_ITEMS_MAX),
  })
  .strict();

const heroSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.Hero),
    // SB-9, BL-3: auto shows three of the source's products, each its own photo; the offers fall back to the newest
    // with nothing on sale.
    fill: z.enum(StorefrontFill),
    source: heroSourceSchema,
    design: z.enum(HeroDesign).nullable(),
    slides: z.array(heroSlideSchema).max(STOREFRONT_HERO_SLIDES_MAX),
    // BL-2, BL-3: the slide-and-tiles design's tiles, beside the slide (under it on a phone).
    tiles: z.array(storefrontCollectionSchema).length(STOREFRONT_HERO_TILES),
  })
  .strict();

const categoriesSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.Categories),
    title: maybeWords(STOREFRONT_TITLE_MAX),
    style: z.enum(CategoryTileStyle).nullable(),
  })
  .strict();

const productsSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.Products),
    source: z.enum(ProductRowSource),
    // Only with the Category source.
    categoryId: catalogueIdSchema.nullable(),
    // Only with the Picked source, in the seller's order.
    productIds: z.array(catalogueIdSchema).max(STOREFRONT_PICKED_PRODUCTS_MAX),
    title: maybeWords(STOREFRONT_TITLE_MAX),
    layout: z.enum(ProductRowLayout),
    count: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12)]),
  })
  .strict();

const offerBannersSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.OfferBanners),
    // SB-9, BL-9: auto draws one banner per collection, from the shop's data.
    fill: z.enum(StorefrontFill),
    // BL-6: null lays them out by their number (bannerLayoutFor).
    layout: z.enum(BannerLayout).nullable(),
    collections: z.array(storefrontCollectionSchema).min(1).max(STOREFRONT_OFFER_BANNERS_MAX),
    banners: z.array(storefrontBannerSchema).max(STOREFRONT_OFFER_BANNERS_MAX),
  })
  .strict();

const wideBannerSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.WideBanner),
    banner: storefrontBannerSchema,
  })
  .strict();

const trustSection = z
  .object({ ...sectionBase, kind: z.literal(StorefrontSectionKind.Trust) })
  .strict();

const testimonialsSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.Testimonials),
    title: maybeWords(STOREFRONT_TITLE_MAX),
    quotes: z.array(testimonialSchema).min(1).max(STOREFRONT_TESTIMONIALS_MAX),
  })
  .strict();

const aboutSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.About),
    title: words(STOREFRONT_TITLE_MAX),
    text: words(STOREFRONT_ABOUT_MAX),
    photo: storefrontPhotoSchema.nullable(),
  })
  .strict();

export const storefrontSectionSchema = z.discriminatedUnion('kind', [
  announcementSection,
  heroSection,
  categoriesSection,
  productsSection,
  offerBannersSection,
  wideBannerSection,
  trustSection,
  testimonialsSection,
  aboutSection,
]);
export type StorefrontSection = z.infer<typeof storefrontSectionSchema>;

/** A section's problem, named the way the API names a field's (API-16). */
function refuse(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: 'custom', path, message, params: { problem: FieldProblemCode.NotAllowed } });
}

/** SB-8, SB-9: what one section's fields must agree on, past their own shapes. */
function sectionProblems(section: StorefrontSection, at: number, ctx: z.RefinementCtx): void {
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      // BL-10: each automatic item once, so the editor has its switch.
      for (const kind of AUTOMATIC_ANNOUNCEMENT_ITEMS) {
        if (section.items.filter((item) => item.kind === kind).length !== 1) {
          refuse(ctx, ['sections', at, 'items'], `The bar lists "${kind}" once.`);
        }
      }
      return;
    case StorefrontSectionKind.Hero:
      if (section.fill === StorefrontFill.Own && section.slides.length === 0) {
        refuse(ctx, ['sections', at, 'slides'], 'Add a slide, or let the hero fill itself.');
      }
      return;
    case StorefrontSectionKind.OfferBanners:
      if (section.fill === StorefrontFill.Own && section.banners.length === 0) {
        refuse(
          ctx,
          ['sections', at, 'banners'],
          'Add a banner, or let the banners fill themselves.',
        );
      }
      return;
    case StorefrontSectionKind.Products: {
      const wantsCategory = section.source === ProductRowSource.Category;
      const wantsPicks = section.source === ProductRowSource.Picked;
      if (wantsCategory !== (section.categoryId !== null)) {
        refuse(
          ctx,
          ['sections', at, 'categoryId'],
          'A category goes with the category source only.',
        );
      }
      if (wantsPicks ? section.productIds.length === 0 : section.productIds.length > 0) {
        refuse(
          ctx,
          ['sections', at, 'productIds'],
          'Chosen products go with the picked source only.',
        );
      }
      if (new Set(section.productIds).size !== section.productIds.length) {
        refuse(ctx, ['sections', at, 'productIds'], 'A product is chosen twice.');
      }
      return;
    }
    default:
      return;
  }
}

/** SB-1, SB-14: a shop's storefront: its theme, one of the theme's colour sets, and the home page's sections. */
export const storefrontDesignSchema = z
  .object({
    theme: z.enum(StorefrontThemeKey),
    palette: z
      .number()
      .int()
      .min(0)
      .max(STOREFRONT_PALETTES - 1),
    sections: z.array(storefrontSectionSchema).max(STOREFRONT_SECTIONS_MAX),
  })
  .strict()
  .superRefine((design, ctx) => {
    const ids = design.sections.map((section) => section.id);
    if (new Set(ids).size !== ids.length) refuse(ctx, ['sections'], 'Two sections share an ID.');
    design.sections.forEach((section, at) => {
      sectionProblems(section, at, ctx);
    });
  });
export type StorefrontDesign = z.infer<typeof storefrontDesignSchema>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** BL-18: a line cut to fit, at its last word break where one is near the end. */
function cutLine(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).trim();
}

/** The bar's one line, as it was saved before BL-10, as its list of items. */
function announcementItemsOf(text: unknown): AnnouncementItem[] {
  if (typeof text !== 'string' || text.trim() === '') return [...STARTING_ANNOUNCEMENT_ITEMS];
  // The seller's own line stood alone, without the shop's offers and delivery charges.
  return [
    ...AUTOMATIC_ANNOUNCEMENT_ITEMS.map((kind) => ({ kind, visible: false })),
    { kind: AnnouncementItemKind.Own, text: cutLine(text, STOREFRONT_ANNOUNCEMENT_LINE_MAX) },
  ];
}

/** A section saved before the banner layouts (BL-2 to BL-18), in today's shape, as it looked; any other as it was. */
function upgradeSection(section: unknown): unknown {
  if (!isRecord(section)) return section;
  switch (section.kind) {
    case StorefrontSectionKind.Announcement: {
      if ('items' in section) return section;
      const { text, ...rest } = section;
      return { ...rest, items: announcementItemsOf(text) };
    }
    case StorefrontSectionKind.Hero:
      return { source: ProductRowSource.OnSale, tiles: [...STARTING_HERO_TILES], ...section };
    case StorefrontSectionKind.OfferBanners:
      // Filling itself it drew two: the biggest saving and the newest.
      return { layout: null, collections: STARTING_BANNER_COLLECTIONS.slice(0, 2), ...section };
    default:
      return section;
  }
}

/**
 * BL-18: a stored design as this release reads it, before the schema does: a section saved before the banner layouts
 * gains its new fields as it looked, and the bar's one line becomes its list.
 */
export function upgradeStorefrontDesign(stored: unknown): unknown {
  if (!isRecord(stored) || !Array.isArray(stored.sections)) return stored;
  return { ...stored, sections: stored.sections.map(upgradeSection) };
}

/** SB-15: one photo a design names, where it sits (API-16's dotted path), and whether it fills a wide band. */
export interface StorefrontPhotoRef {
  sectionId: string;
  field: string;
  mediaId: string;
  /** A slide's or a banner's, held to STOREFRONT_PHOTO_MIN_WIDTH. */
  wide: boolean;
}

/** SB-16: one category or product a design's buttons and rows name, where it sits. */
export interface StorefrontTargetRef {
  sectionId: string;
  field: string;
  kind: 'category' | 'product';
  id: string;
}

/** SB-14, SB-15: every photo the design names, in order, with the field that names it. */
export function storefrontPhotoRefs(design: StorefrontDesign): StorefrontPhotoRef[] {
  const photos: StorefrontPhotoRef[] = [];
  const add = (sectionId: string, at: string, photo: StorefrontPhoto, wide: boolean): void => {
    photos.push({ sectionId, field: `${at}.photo.mediaId`, mediaId: photo.mediaId, wide });
  };
  design.sections.forEach((section, index) => {
    const at = `sections.${String(index)}`;
    switch (section.kind) {
      case StorefrontSectionKind.Hero:
        section.slides.forEach((slide, slideIndex) => {
          add(section.id, `${at}.slides.${String(slideIndex)}`, slide.photo, true);
        });
        return;
      case StorefrontSectionKind.OfferBanners:
        section.banners.forEach((banner, bannerIndex) => {
          add(section.id, `${at}.banners.${String(bannerIndex)}`, banner.photo, true);
        });
        return;
      case StorefrontSectionKind.WideBanner:
        add(section.id, `${at}.banner`, section.banner.photo, true);
        return;
      case StorefrontSectionKind.About:
        if (section.photo) add(section.id, at, section.photo, false);
        return;
      default:
        return;
    }
  });
  return photos;
}

/** SB-16: every category and product the design's buttons and rows name, in order, with the field that names it. */
export function storefrontTargetRefs(design: StorefrontDesign): StorefrontTargetRef[] {
  const targets: StorefrontTargetRef[] = [];
  // A button's target sits in its `link`; a collection is the target itself (`within` empty).
  const follow = (sectionId: string, at: string, link: StorefrontLink, within = '.link'): void => {
    if (link.kind === StorefrontLinkKind.Category) {
      targets.push({
        sectionId,
        field: `${at}${within}.categoryId`,
        kind: 'category',
        id: link.categoryId,
      });
    }
    if (link.kind === StorefrontLinkKind.Product) {
      targets.push({
        sectionId,
        field: `${at}${within}.productId`,
        kind: 'product',
        id: link.productId,
      });
    }
  };
  design.sections.forEach((section, index) => {
    const at = `sections.${String(index)}`;
    switch (section.kind) {
      case StorefrontSectionKind.Hero:
        section.slides.forEach((slide, slideIndex) => {
          follow(section.id, `${at}.slides.${String(slideIndex)}`, slide.link);
        });
        // BL-3: a tile showing a category.
        section.tiles.forEach((tile, tileIndex) => {
          follow(section.id, `${at}.tiles.${String(tileIndex)}`, tile, '');
        });
        return;
      case StorefrontSectionKind.OfferBanners:
        section.banners.forEach((banner, bannerIndex) => {
          follow(section.id, `${at}.banners.${String(bannerIndex)}`, banner.link);
        });
        // BL-9: an automatic banner showing a category.
        section.collections.forEach((collection, collectionIndex) => {
          follow(section.id, `${at}.collections.${String(collectionIndex)}`, collection, '');
        });
        return;
      case StorefrontSectionKind.WideBanner:
        follow(section.id, `${at}.banner`, section.banner.link);
        return;
      case StorefrontSectionKind.Products:
        if (section.categoryId !== null) {
          targets.push({
            sectionId: section.id,
            field: `${at}.categoryId`,
            kind: 'category',
            id: section.categoryId,
          });
        }
        section.productIds.forEach((id, pick) => {
          targets.push({
            sectionId: section.id,
            field: `${at}.productIds.${String(pick)}`,
            kind: 'product',
            id,
          });
        });
        return;
      default:
        return;
    }
  });
  return targets;
}

/** SB-14: every photo the design names, once each, for the media's uses. */
export function storefrontMediaIds(design: StorefrontDesign): string[] {
  return [...new Set(storefrontPhotoRefs(design).map((photo) => photo.mediaId))];
}

/** SB-16: every category and product the design points at, once each. */
export function storefrontTargets(design: StorefrontDesign): {
  categoryIds: string[];
  productIds: string[];
} {
  const refs = storefrontTargetRefs(design);
  const of = (kind: StorefrontTargetRef['kind']): string[] => [
    ...new Set(refs.filter((ref) => ref.kind === kind).map((ref) => ref.id)),
  ];
  return { categoryIds: of('category'), productIds: of('product') };
}

// PUT /storefront/design: the draft, whole (SB-12). POST .../publish and .../back take nothing.
export const saveStorefrontDesignSchema = z.object({ design: storefrontDesignSchema }).strict();
export type SaveStorefrontDesignInput = z.infer<typeof saveStorefrontDesignSchema>;

// DC-6: the most cards one order names -- far above a shop's products times their designs.
export const STOREFRONT_CARDS_MAX = 5000;

/** DC-8: how a product with two or more designs shows while design cards are on. */
export enum StorefrontCardMode {
  /** A card per design (the default). */
  Designs = 'designs',
  /** Its one card, every design together. */
  Compact = 'compact',
  /** Its one card and a card per design. */
  Both = 'both',
}

// PUT storefront/cards/order (DC-6): the seller's order, whole -- every card of the shop, first to last; a product's
// own card names no design.
export const storefrontCardOrderSchema = z
  .object({
    cards: z
      .array(
        z.object({ productId: catalogueIdSchema, designId: catalogueIdSchema.nullable() }).strict(),
      )
      .max(STOREFRONT_CARDS_MAX),
    // DC-8: how each product with designs shows; one left out keeps its way.
    modes: z
      .array(z.object({ productId: catalogueIdSchema, mode: z.enum(StorefrontCardMode) }).strict())
      .max(STOREFRONT_CARDS_MAX)
      .optional(),
  })
  .strict();
export type StorefrontCardOrderInput = z.infer<typeof storefrontCardOrderSchema>;

// PUT storefront/design-cards (DC-2): each design its own card, or one card per product.
export const storefrontDesignCardsSchema = z.object({ on: z.boolean() }).strict();
export type StorefrontDesignCardsInput = z.infer<typeof storefrontDesignCardsSchema>;

// GET /v1/shop?preview=<token>: the draft, through a short-lived signed link (SB-12).
export const STOREFRONT_PREVIEW_TOKEN_MAX = 512;
export const publicShopQuerySchema = z.object({
  preview: z.string().min(1).max(STOREFRONT_PREVIEW_TOKEN_MAX).optional(),
});
export type PublicShopQuery = z.infer<typeof publicShopQuerySchema>;
