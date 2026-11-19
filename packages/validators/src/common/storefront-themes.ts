import {
  CategoryTileStyle,
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  StorefrontFill,
  StorefrontSectionKind,
  StorefrontThemeKey,
  STARTING_ANNOUNCEMENT_ITEMS,
  STARTING_BANNER_COLLECTIONS,
  STARTING_HERO_TILES,
  type StorefrontDesign,
  type StorefrontSection,
} from '../api/shops/storefront-design';
import { BrandFont } from '../db/enums';

// STOREFRONT-BUILDER-PLAN SB-7: the five themes, one definition for the server (a new shop's design), the storefront
// (what it draws) and the dashboard (the theme gallery). Values are the sketch's (lytro-storefront-builder.html),
// darkened where a pair missed BRN-03's contrast (SB-19, storefront-themes.spec).

/** A theme's design tokens: CSS custom properties without their `--`, set on the storefront's root through the CSSOM. */
export type StorefrontTokens = Readonly<Record<string, string>>;

/** How the fixed header is drawn: the logo centred over the menu, or a bar with a search box. */
export enum StorefrontHeaderStyle {
  Centred = 'centred',
  Bar = 'bar',
}

/** How a product card is drawn. */
export enum ProductCardStyle {
  Framed = 'framed',
  Rounded = 'rounded',
  Plain = 'plain',
  Photo = 'photo',
}

/** How a section's heading is drawn. */
export enum SectionHeadStyle {
  Ornament = 'ornament',
  Leaf = 'leaf',
  Left = 'left',
  Petal = 'petal',
  Rule = 'rule',
}

export interface StorefrontThemeDefinition {
  key: StorefrontThemeKey;
  name: { bn: string; en: string };
  /** The kinds of shop it suits, for the gallery. */
  suits: { bn: string; en: string };
  headingFont: BrandFont;
  bodyFont: BrandFont;
  tokens: StorefrontTokens;
  /** SB-7: three colour sets, the first the theme's own; each later one replaces some tokens. */
  palettes: readonly [StorefrontTokens, StorefrontTokens, StorefrontTokens];
  /** A swatch for each colour set in the gallery. */
  swatches: readonly [string, string, string];
  header: StorefrontHeaderStyle;
  hero: HeroDesign;
  categories: CategoryTileStyle;
  card: ProductCardStyle;
  head: SectionHeadStyle;
  /** SB-11: the home page a shop on this theme starts with, every section filling itself. */
  sections: readonly StartingSection[];
}

/** A section of a theme's starting home page, before it gets its ID. */
type StartingSection =
  | { kind: StorefrontSectionKind.Announcement }
  | { kind: StorefrontSectionKind.Hero }
  | { kind: StorefrontSectionKind.Categories }
  | { kind: StorefrontSectionKind.OfferBanners }
  | { kind: StorefrontSectionKind.Trust }
  | {
      kind: StorefrontSectionKind.Products;
      source: ProductRowSource.Newest | ProductRowSource.OnSale | ProductRowSource.BestSellers;
      layout: ProductRowLayout;
    };

const row = (
  source: ProductRowSource.Newest | ProductRowSource.OnSale | ProductRowSource.BestSellers,
  layout: ProductRowLayout,
): StartingSection => ({ kind: StorefrontSectionKind.Products, source, layout });
const ANNOUNCEMENT = { kind: StorefrontSectionKind.Announcement } as const;
const HERO = { kind: StorefrontSectionKind.Hero } as const;
const CATEGORIES = { kind: StorefrontSectionKind.Categories } as const;
const OFFERS = { kind: StorefrontSectionKind.OfferBanners } as const;
const TRUST = { kind: StorefrontSectionKind.Trust } as const;

export const STOREFRONT_THEMES: Readonly<Record<StorefrontThemeKey, StorefrontThemeDefinition>> = {
  [StorefrontThemeKey.Royal]: {
    key: StorefrontThemeKey.Royal,
    name: { bn: 'রাজকীয়', en: 'Royal' },
    suits: { bn: 'পারফিউম, গয়না, প্রিমিয়াম পণ্য', en: 'Perfume, jewellery, premium goods' },
    headingFont: BrandFont.GaladaPlayfairDisplay,
    bodyFont: BrandFont.HindSiliguriPlusJakartaSans,
    tokens: {
      bg: '#fbf7ef',
      text: '#1c1915',
      muted: '#4f483c',
      main: '#1c1915',
      'on-main': '#f3e3b6',
      accent: '#c8a14b',
      'on-accent': '#1c1915',
      'accent-soft': '#f3e9d2',
      'ann-bg': '#1c1915',
      'ann-fg': '#f3e3b6',
      'hd-bg': '#ffffff',
      'hd-fg': '#1c1915',
      logo: '#1c1915',
      line: '#ece3cf',
      'line-strong': '#d9c79b',
      'chip-bg': '#f3e9d2',
      'chip-fg': '#3b3326',
      'hero-bg': '#1c1915',
      'hero-h': '#e9c873',
      'hero-em': '#e9c873',
      'hero-shade':
        'linear-gradient(90deg,rgba(18,14,8,.92) 0%,rgba(18,14,8,.6) 45%,rgba(18,14,8,.1) 100%)',
      kick: '#e9c873',
      'btn-bg': '#c8a14b',
      'btn-fg': '#1c1915',
      'sec-h': '#1c1915',
      link: '#7a5c1c',
      orn: '#c8a14b',
      ring: '#e2cc94',
      'tile-bg': '#f3e9d2',
      'card-bg': '#ffffff',
      'card-shadow': 'none',
      'card-border': '1px solid #e8dcc0',
      'img-bg': '#f7f1e3',
      price: '#1c1915',
      sale: '#b3261e',
      new: '#1c1915',
      best: '#7a5c1c',
      'trust-bg': '#ffffff',
      'trust-border': '1px solid #e8dcc0',
      'ft-bg': '#14110c',
      'ft-fg': '#e8dfcc',
      'ft-h': '#e9c873',
      'ft-logo': '#e9c873',
      'r-btn': '999px',
      'r-card': '6px',
      'r-mark': '50%',
      // SB-8: the shades a first and a second banner's words sit on (the sketch's, white words on each).
      'ban-a': 'linear-gradient(90deg,rgba(20,16,10,.88),rgba(20,16,10,.2))',
      'ban-b': 'linear-gradient(90deg,rgba(120,84,20,.9),rgba(120,84,20,.15))',
    },
    palettes: [
      {},
      // Rose gold.
      {
        accent: '#d79aa3',
        'btn-bg': '#d79aa3',
        orn: '#c98590',
        ring: '#ecc6cc',
        'hero-h': '#f2c4cb',
        'hero-em': '#f2c4cb',
        kick: '#f2c4cb',
        'ft-h': '#f2c4cb',
        'ft-logo': '#f2c4cb',
        'on-main': '#f6d9dd',
        'ann-fg': '#f6d9dd',
        link: '#8e3f4b',
        best: '#8e3f4b',
        'accent-soft': '#f7e6e8',
        'tile-bg': '#f7e6e8',
        'chip-bg': '#f7e6e8',
      },
      // Emerald and gold.
      {
        main: '#123c33',
        'ann-bg': '#123c33',
        'hero-bg': '#123c33',
        new: '#123c33',
        'ft-bg': '#0d2a24',
        link: '#1f6f5c',
        best: '#1f6f5c',
      },
    ],
    swatches: ['#c8a14b', '#d79aa3', '#1f6f5c'],
    header: StorefrontHeaderStyle.Centred,
    hero: HeroDesign.Overlay,
    categories: CategoryTileStyle.Square,
    card: ProductCardStyle.Framed,
    head: SectionHeadStyle.Ornament,
    sections: [
      ANNOUNCEMENT,
      HERO,
      CATEGORIES,
      row(ProductRowSource.BestSellers, ProductRowLayout.Grid),
      OFFERS,
      row(ProductRowSource.OnSale, ProductRowLayout.Carousel),
      TRUST,
    ],
  },
  [StorefrontThemeKey.Fresh]: {
    key: StorefrontThemeKey.Fresh,
    name: { bn: 'সতেজ', en: 'Fresh' },
    suits: { bn: 'খাবার, গ্রোসারি, অর্গানিক', en: 'Food, grocery, organic' },
    headingFont: BrandFont.BalooDa2Poppins,
    bodyFont: BrandFont.BalooDa2Poppins,
    tokens: {
      bg: '#f6f9f1',
      text: '#18261b',
      muted: '#3f4f42',
      main: '#1f6b34',
      'on-main': '#ffffff',
      accent: '#f08a1c',
      'on-accent': '#2a1600',
      'accent-soft': '#e3f0dc',
      'ann-bg': '#1f6b34',
      'ann-fg': '#ffffff',
      'hd-bg': '#ffffff',
      'hd-fg': '#18261b',
      logo: '#1f6b34',
      line: '#e2ead9',
      'line-strong': '#b9cdb0',
      'chip-bg': '#e3f0dc',
      'chip-fg': '#1f6b34',
      'hero-bg': '#fff8ec',
      'hero-h': '#18261b',
      'hero-em': '#b35500',
      'hero-shade': 'none',
      kick: '#a34d00',
      'btn-bg': '#1f6b34',
      'btn-fg': '#ffffff',
      'sec-h': '#1f6b34',
      link: '#1f6b34',
      orn: '#9cbd8f',
      ring: '#cfe3c4',
      'tile-bg': '#e3f0dc',
      'card-bg': '#ffffff',
      'card-shadow': '0 2px 10px rgba(31,107,52,.08)',
      'card-border': '0',
      'img-bg': '#f2f5ee',
      price: '#1f6b34',
      sale: '#c4321a',
      new: '#1f6b34',
      best: '#a34d00',
      'trust-bg': '#ffffff',
      'trust-border': '0',
      'ft-bg': '#163f22',
      'ft-fg': '#d9e8d3',
      'ft-h': '#ffffff',
      'ft-logo': '#ffffff',
      'r-btn': '999px',
      'r-card': '18px',
      'r-mark': '14px',
      // SB-8: the shades a first and a second banner's words sit on (the sketch's, white words on each).
      'ban-a': 'linear-gradient(90deg,rgba(22,63,34,.92),rgba(22,63,34,.15))',
      'ban-b': 'linear-gradient(90deg,rgba(196,96,10,.92),rgba(196,96,10,.15))',
    },
    palettes: [
      {},
      // Chilli.
      {
        main: '#b32d0f',
        'ann-bg': '#b32d0f',
        logo: '#b32d0f',
        'chip-fg': '#b32d0f',
        'btn-bg': '#b32d0f',
        'sec-h': '#b32d0f',
        link: '#b32d0f',
        price: '#b32d0f',
        new: '#b32d0f',
        'ft-bg': '#5c1a0b',
        'accent-soft': '#fbe3d9',
        'chip-bg': '#fbe3d9',
        'tile-bg': '#fbe3d9',
        ring: '#f4c3b2',
      },
      // Teal.
      {
        main: '#0f6b62',
        'ann-bg': '#0f6b62',
        logo: '#0f6b62',
        'chip-fg': '#0f6b62',
        'btn-bg': '#0f6b62',
        'sec-h': '#0f6b62',
        link: '#0f6b62',
        price: '#0f6b62',
        new: '#0f6b62',
        'ft-bg': '#0b3f3a',
        'accent-soft': '#d8efec',
        'chip-bg': '#d8efec',
        'tile-bg': '#d8efec',
        ring: '#b5e0da',
      },
    ],
    swatches: ['#1f6b34', '#b32d0f', '#0f6b62'],
    header: StorefrontHeaderStyle.Bar,
    hero: HeroDesign.Split,
    categories: CategoryTileStyle.Circle,
    card: ProductCardStyle.Rounded,
    head: SectionHeadStyle.Leaf,
    sections: [
      ANNOUNCEMENT,
      HERO,
      CATEGORIES,
      row(ProductRowSource.BestSellers, ProductRowLayout.Grid),
      OFFERS,
      row(ProductRowSource.Newest, ProductRowLayout.Carousel),
      TRUST,
    ],
  },
  [StorefrontThemeKey.Bold]: {
    key: StorefrontThemeKey.Bold,
    name: { bn: 'উজ্জ্বল', en: 'Bold' },
    suits: {
      bn: 'গ্যাজেট, ইলেকট্রনিক্স, সব ধরনের দোকান',
      en: 'Gadgets, electronics, general stores',
    },
    headingFont: BrandFont.AnekBanglaDmSans,
    bodyFont: BrandFont.AnekBanglaDmSans,
    tokens: {
      bg: '#ffffff',
      text: '#0d1b3e',
      muted: '#3a4766',
      main: '#1554f0',
      'on-main': '#ffffff',
      accent: '#ffc61a',
      'on-accent': '#1a1400',
      'accent-soft': '#e8efff',
      'ann-bg': '#0d1b3e',
      'ann-fg': '#ffffff',
      'hd-bg': '#ffffff',
      'hd-fg': '#0d1b3e',
      logo: '#0d1b3e',
      line: '#e3e8f3',
      'line-strong': '#c4cfe6',
      'chip-bg': '#eef2fb',
      'chip-fg': '#0d1b3e',
      'hero-bg': 'linear-gradient(160deg,#e8efff 0%,#d4e1ff 100%)',
      'hero-h': '#0d1b3e',
      'hero-em': '#1554f0',
      'hero-shade': 'none',
      kick: '#1349d3',
      'btn-bg': '#1554f0',
      'btn-fg': '#ffffff',
      'sec-h': '#0d1b3e',
      link: '#1349d3',
      orn: '#c4cfe6',
      ring: '#d4e1ff',
      'tile-bg': '#eef2fb',
      'card-bg': '#ffffff',
      'card-shadow': 'none',
      'card-border': '1px solid #e3e8f3',
      'img-bg': '#f4f6fb',
      price: '#0d1b3e',
      sale: '#d42420',
      new: '#1349d3',
      best: '#0c7a41',
      'trust-bg': '#eef2fb',
      'trust-border': '0',
      'ft-bg': '#0d1b3e',
      'ft-fg': '#cfd8ee',
      'ft-h': '#ffffff',
      'ft-logo': '#ffffff',
      'r-btn': '10px',
      'r-card': '12px',
      'r-mark': '10px',
      // SB-8: the shades a first and a second banner's words sit on (the sketch's, white words on each).
      'ban-a': 'linear-gradient(90deg,rgba(13,27,62,.94),rgba(13,27,62,.2))',
      'ban-b': 'linear-gradient(90deg,rgba(21,84,240,.94),rgba(21,84,240,.15))',
    },
    palettes: [
      {},
      // Orange.
      {
        main: '#c2410c',
        'btn-bg': '#c2410c',
        'hero-em': '#c2410c',
        kick: '#b03a0a',
        link: '#b03a0a',
        new: '#b03a0a',
        'accent-soft': '#fdeadf',
        'hero-bg': 'linear-gradient(160deg,#fff1e8 0%,#ffdcc7 100%)',
        ring: '#ffd4bd',
      },
      // Violet.
      {
        main: '#6d28d9',
        'btn-bg': '#6d28d9',
        'hero-em': '#6d28d9',
        kick: '#6d28d9',
        link: '#6d28d9',
        new: '#6d28d9',
        'accent-soft': '#efe6fd',
        'hero-bg': 'linear-gradient(160deg,#f1e9ff 0%,#e1d3ff 100%)',
        ring: '#ddd0fb',
      },
    ],
    swatches: ['#1554f0', '#c2410c', '#6d28d9'],
    header: StorefrontHeaderStyle.Bar,
    hero: HeroDesign.Split,
    categories: CategoryTileStyle.Square,
    card: ProductCardStyle.Plain,
    head: SectionHeadStyle.Left,
    sections: [
      ANNOUNCEMENT,
      HERO,
      TRUST,
      CATEGORIES,
      row(ProductRowSource.OnSale, ProductRowLayout.Grid),
      OFFERS,
      row(ProductRowSource.Newest, ProductRowLayout.Carousel),
    ],
  },
  [StorefrontThemeKey.Soft]: {
    key: StorefrontThemeKey.Soft,
    name: { bn: 'কোমল', en: 'Soft' },
    suits: { bn: 'বিউটি, কসমেটিকস, মেয়েদের ফ্যাশন', en: "Beauty, cosmetics, women's fashion" },
    headingFont: BrandFont.GaladaPlayfairDisplay,
    bodyFont: BrandFont.NotoSansBengaliInter,
    tokens: {
      bg: '#fff7fa',
      text: '#3a0f24',
      muted: '#5e3447',
      main: '#a3195b',
      'on-main': '#ffffff',
      accent: '#f2639e',
      'on-accent': '#3a0f24',
      'accent-soft': '#fde4ee',
      'ann-bg': '#a3195b',
      'ann-fg': '#ffffff',
      'hd-bg': '#ffffff',
      'hd-fg': '#3a0f24',
      logo: '#a3195b',
      line: '#f7d9e6',
      'line-strong': '#eebbd0',
      'chip-bg': '#fde4ee',
      'chip-fg': '#a3195b',
      'hero-bg': 'linear-gradient(160deg,#fde4ee 0%,#fbd0e1 100%)',
      'hero-h': '#a3195b',
      'hero-em': '#c2286e',
      'hero-shade': 'none',
      kick: '#a3195b',
      'btn-bg': '#a3195b',
      'btn-fg': '#ffffff',
      'sec-h': '#a3195b',
      link: '#a3195b',
      orn: '#e58ab0',
      ring: '#f9c9dc',
      'tile-bg': '#fde4ee',
      'card-bg': '#ffffff',
      'card-shadow': '0 2px 12px rgba(163,25,91,.08)',
      'card-border': '0',
      'img-bg': '#fdf0f5',
      price: '#a3195b',
      sale: '#c2286e',
      new: '#6d33c4',
      best: '#0c7a41',
      'trust-bg': '#fde4ee',
      'trust-border': '0',
      'ft-bg': '#4d0c2c',
      'ft-fg': '#f6d7e5',
      'ft-h': '#ffffff',
      'ft-logo': '#ffffff',
      'r-btn': '999px',
      'r-card': '18px',
      'r-mark': '50%',
      // SB-8: the shades a first and a second banner's words sit on (the sketch's, white words on each).
      'ban-a': 'linear-gradient(90deg,rgba(163,25,91,.9),rgba(163,25,91,.12))',
      'ban-b': 'linear-gradient(90deg,rgba(123,63,209,.9),rgba(123,63,209,.12))',
    },
    palettes: [
      {},
      // Peach.
      {
        main: '#b0400f',
        'ann-bg': '#b0400f',
        logo: '#b0400f',
        'chip-fg': '#b0400f',
        'hero-h': '#b0400f',
        'hero-em': '#b0400f',
        kick: '#b0400f',
        'btn-bg': '#b0400f',
        'sec-h': '#b0400f',
        link: '#b0400f',
        price: '#b0400f',
        'ft-bg': '#4f1d07',
        'accent-soft': '#fde8dc',
        'chip-bg': '#fde8dc',
        'tile-bg': '#fde8dc',
        'trust-bg': '#fde8dc',
        'hero-bg': 'linear-gradient(160deg,#fff0e6 0%,#fddcc8 100%)',
        bg: '#fffaf6',
        ring: '#f7cdb4',
      },
      // Lavender.
      {
        main: '#6d28d9',
        'ann-bg': '#6d28d9',
        logo: '#6d28d9',
        'chip-fg': '#6d28d9',
        'hero-h': '#6d28d9',
        'hero-em': '#6d28d9',
        kick: '#6d28d9',
        'btn-bg': '#6d28d9',
        'sec-h': '#6d28d9',
        link: '#6d28d9',
        price: '#6d28d9',
        'ft-bg': '#2e1065',
        'accent-soft': '#efe6fd',
        'chip-bg': '#efe6fd',
        'tile-bg': '#efe6fd',
        'trust-bg': '#efe6fd',
        'hero-bg': 'linear-gradient(160deg,#f3ecff 0%,#e4d6ff 100%)',
        bg: '#fbf8ff',
        ring: '#ddd0fb',
      },
    ],
    swatches: ['#a3195b', '#b0400f', '#6d28d9'],
    header: StorefrontHeaderStyle.Bar,
    hero: HeroDesign.Split,
    categories: CategoryTileStyle.Circle,
    card: ProductCardStyle.Rounded,
    head: SectionHeadStyle.Petal,
    sections: [
      ANNOUNCEMENT,
      HERO,
      CATEGORIES,
      row(ProductRowSource.Newest, ProductRowLayout.Carousel),
      OFFERS,
      row(ProductRowSource.BestSellers, ProductRowLayout.Grid),
      TRUST,
    ],
  },
  [StorefrontThemeKey.Studio]: {
    key: StorefrontThemeKey.Studio,
    name: { bn: 'স্টুডিও', en: 'Studio' },
    suits: { bn: 'ফ্যাশন, পোশাক, লাইফস্টাইল', en: 'Fashion, clothing, lifestyle' },
    headingFont: BrandFont.TiroBanglaLora,
    bodyFont: BrandFont.HindSiliguriPlusJakartaSans,
    tokens: {
      bg: '#f7f5f1',
      text: '#13213c',
      muted: '#444c5c',
      main: '#13213c',
      'on-main': '#ffffff',
      accent: '#c9583a',
      'on-accent': '#ffffff',
      'accent-soft': '#e6e9f0',
      'ann-bg': '#13213c',
      'ann-fg': '#ffffff',
      'hd-bg': '#f7f5f1',
      'hd-fg': '#13213c',
      logo: '#13213c',
      line: '#e4e0d8',
      'line-strong': '#c9c3b6',
      'chip-bg': '#ece8e0',
      'chip-fg': '#13213c',
      'hero-bg': '#13213c',
      'hero-h': '#ffffff',
      'hero-em': '#ffffff',
      'hero-shade': 'linear-gradient(180deg,rgba(10,16,30,0) 35%,rgba(10,16,30,.82) 100%)',
      'hero-shade-wide':
        'linear-gradient(90deg,rgba(10,16,30,.85) 0%,rgba(10,16,30,.45) 45%,rgba(10,16,30,0) 75%)',
      'hero-kick': '#f6c9b8',
      kick: '#a8432a',
      'btn-bg': '#13213c',
      'btn-fg': '#ffffff',
      'sec-h': '#13213c',
      link: '#13213c',
      orn: '#c9c3b6',
      ring: '#c9c3b6',
      'tile-bg': '#ece8e0',
      'card-bg': 'transparent',
      'q-bg': '#ffffff',
      'card-shadow': 'none',
      'card-border': '0',
      'img-bg': '#ece8e0',
      price: '#13213c',
      sale: '#a8432a',
      new: '#13213c',
      best: '#0c6545',
      'trust-bg': '#ffffff',
      'trust-border': '0',
      'ft-bg': '#13213c',
      'ft-fg': '#cfd5e2',
      'ft-h': '#ffffff',
      'ft-logo': '#ffffff',
      'r-btn': '4px',
      'r-card': '4px',
      'r-mark': '4px',
      // SB-8: the shades a first and a second banner's words sit on (the sketch's, white words on each).
      'ban-a': 'linear-gradient(90deg,rgba(19,33,60,.9),rgba(19,33,60,.1))',
      'ban-b': 'linear-gradient(90deg,rgba(201,88,58,.92),rgba(201,88,58,.1))',
    },
    palettes: [
      {},
      // Olive.
      {
        main: '#3f4a22',
        'ann-bg': '#3f4a22',
        logo: '#3f4a22',
        'chip-fg': '#3f4a22',
        'btn-bg': '#3f4a22',
        'sec-h': '#3f4a22',
        link: '#3f4a22',
        price: '#3f4a22',
        new: '#3f4a22',
        'ft-bg': '#2b3317',
        'hero-bg': '#3f4a22',
      },
      // Maroon.
      {
        main: '#6e1c27',
        'ann-bg': '#6e1c27',
        logo: '#6e1c27',
        'chip-fg': '#6e1c27',
        'btn-bg': '#6e1c27',
        'sec-h': '#6e1c27',
        link: '#6e1c27',
        price: '#6e1c27',
        new: '#6e1c27',
        'ft-bg': '#4a1219',
        'hero-bg': '#6e1c27',
      },
    ],
    swatches: ['#13213c', '#3f4a22', '#6e1c27'],
    header: StorefrontHeaderStyle.Centred,
    hero: HeroDesign.Overlay,
    categories: CategoryTileStyle.Tall,
    card: ProductCardStyle.Photo,
    head: SectionHeadStyle.Rule,
    sections: [
      ANNOUNCEMENT,
      HERO,
      CATEGORIES,
      row(ProductRowSource.Newest, ProductRowLayout.Grid),
      OFFERS,
      row(ProductRowSource.OnSale, ProductRowLayout.Carousel),
      TRUST,
    ],
  },
};

/** SB-7: a theme's tokens in one of its colour sets. */
export function storefrontTokens(theme: StorefrontThemeKey, palette: number): StorefrontTokens {
  const definition = STOREFRONT_THEMES[theme];
  return { ...definition.tokens, ...(definition.palettes[palette] ?? {}) };
}

/**
 * SB-11: the theme a shop starts on, by its shop type (`control.business_type_presets`). Royal suits a premium shop;
 * none of the types is one, so a shop chooses it.
 */
export const STARTING_THEME: Readonly<Record<string, StorefrontThemeKey>> = {
  clothing: StorefrontThemeKey.Studio,
  shoes_bags: StorefrontThemeKey.Studio,
  cosmetics: StorefrontThemeKey.Soft,
  electronics: StorefrontThemeKey.Bold,
  mobiles_gadgets: StorefrontThemeKey.Bold,
  grocery: StorefrontThemeKey.Fresh,
  food_bakery: StorefrontThemeKey.Fresh,
  books_stationery: StorefrontThemeKey.Bold,
  pharmacy: StorefrontThemeKey.Fresh,
  home_decor: StorefrontThemeKey.Royal,
  other: StorefrontThemeKey.Bold,
};

export function startingTheme(businessType: string | null): StorefrontThemeKey {
  return (businessType ? STARTING_THEME[businessType] : undefined) ?? StorefrontThemeKey.Bold;
}

// The starting sections' IDs: fixed, so a shop that has never saved reads the same IDs every time and the editor's
// first save keeps them.
const startingId = (at: number): string =>
  `00000000-0000-4000-8000-${String(at + 1).padStart(12, '0')}`;

function startingSection(section: StartingSection, at: number): StorefrontSection {
  const base = { id: startingId(at), visible: true };
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      return { ...base, kind: section.kind, items: [...STARTING_ANNOUNCEMENT_ITEMS] };
    case StorefrontSectionKind.Hero:
      return {
        ...base,
        kind: section.kind,
        fill: StorefrontFill.Auto,
        source: ProductRowSource.OnSale,
        design: null,
        slides: [],
        tiles: [...STARTING_HERO_TILES],
      };
    case StorefrontSectionKind.Categories:
      return { ...base, kind: section.kind, title: null, style: null };
    case StorefrontSectionKind.OfferBanners:
      return {
        ...base,
        kind: section.kind,
        fill: StorefrontFill.Auto,
        layout: null,
        collections: [...STARTING_BANNER_COLLECTIONS],
        banners: [],
      };
    case StorefrontSectionKind.Trust:
      return { ...base, kind: section.kind };
    case StorefrontSectionKind.Products:
      return {
        ...base,
        kind: section.kind,
        source: section.source,
        categoryId: null,
        productIds: [],
        title: null,
        layout: section.layout,
        count: section.layout === ProductRowLayout.Grid ? 4 : 6,
      };
  }
}

/** SB-11: the design a shop has before it saves its own: its theme's starting page, every section on auto. */
export function startingDesign(theme: StorefrontThemeKey): StorefrontDesign {
  return {
    theme,
    palette: 0,
    sections: STOREFRONT_THEMES[theme].sections.map(startingSection),
  };
}
