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

// SB-8's limits. Every text has a longest length (SEC-12).
export const STOREFRONT_SECTIONS_MAX = 12;
export const STOREFRONT_HERO_SLIDES_MAX = 3;
export const STOREFRONT_OFFER_BANNERS_MAX = 2;
export const STOREFRONT_TESTIMONIALS_MAX = 6;
export const STOREFRONT_PICKED_PRODUCTS_MAX = 12;
export const STOREFRONT_ROW_COUNTS = [4, 6, 8, 12] as const;
export const STOREFRONT_PALETTES = 3;
export const STOREFRONT_HEADLINE_MAX = 60;
export const STOREFRONT_KICKER_MAX = 40;
export const STOREFRONT_BANNER_HEADLINE_MAX = 40;
export const STOREFRONT_DESCRIPTION_MAX = 140;
export const STOREFRONT_BUTTON_MAX = 24;
export const STOREFRONT_ANNOUNCEMENT_MAX = 120;
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

/** SB-16: a button's target. */
export const storefrontLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(StorefrontLinkKind.OnSale) }).strict(),
  z.object({ kind: z.literal(StorefrontLinkKind.JustIn) }).strict(),
  z.object({ kind: z.literal(StorefrontLinkKind.BestSellers) }).strict(),
  z
    .object({ kind: z.literal(StorefrontLinkKind.Category), categoryId: catalogueIdSchema })
    .strict(),
  z.object({ kind: z.literal(StorefrontLinkKind.Product), productId: catalogueIdSchema }).strict(),
]);
export type StorefrontLink = z.infer<typeof storefrontLinkSchema>;

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

const announcementSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.Announcement),
    // SB-9: null is the shop's own line: its offers and its Dhaka delivery fee.
    text: maybeWords(STOREFRONT_ANNOUNCEMENT_MAX),
  })
  .strict();

const heroSection = z
  .object({
    ...sectionBase,
    kind: z.literal(StorefrontSectionKind.Hero),
    // SB-9: auto shows the three biggest discounts (or, with none on sale, the newest products), each its own photo.
    fill: z.enum(StorefrontFill),
    design: z.enum(HeroDesign).nullable(),
    slides: z.array(heroSlideSchema).max(STOREFRONT_HERO_SLIDES_MAX),
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
    // SB-9: auto is two tiles from the shop's data: the biggest saving, and the newest product.
    fill: z.enum(StorefrontFill),
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
  const follow = (sectionId: string, at: string, link: StorefrontLink): void => {
    if (link.kind === StorefrontLinkKind.Category) {
      targets.push({
        sectionId,
        field: `${at}.link.categoryId`,
        kind: 'category',
        id: link.categoryId,
      });
    }
    if (link.kind === StorefrontLinkKind.Product) {
      targets.push({
        sectionId,
        field: `${at}.link.productId`,
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
        return;
      case StorefrontSectionKind.OfferBanners:
        section.banners.forEach((banner, bannerIndex) => {
          follow(section.id, `${at}.banners.${String(bannerIndex)}`, banner.link);
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

// GET /v1/shop?preview=<token>: the draft, through a short-lived signed link (SB-12).
export const STOREFRONT_PREVIEW_TOKEN_MAX = 512;
export const publicShopQuerySchema = z.object({
  preview: z.string().min(1).max(STOREFRONT_PREVIEW_TOKEN_MAX).optional(),
});
export type PublicShopQuery = z.infer<typeof publicShopQuerySchema>;
