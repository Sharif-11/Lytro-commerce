import {
  AnnouncementItemKind,
  BannerLayout,
  bannerLayoutFor,
  CategoryTileStyle,
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  STARTING_ANNOUNCEMENT_ITEMS,
  STARTING_BANNER_COLLECTIONS,
  STARTING_HERO_TILES,
  STOREFRONT_SECTIONS_MAX,
  STOREFRONT_THEMES,
  StorefrontFill,
  StorefrontSectionKind,
  type AnnouncementItem,
  type HeroSource,
  type StorefrontDesign,
  type StorefrontSection,
} from '@lytronix/validators';
import type { TFunction } from 'i18next';
import type { StorefrontEditor } from '@/types/storefront-design';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-12: the storefront design editor's plain functions -- its list of sections
// with the fixed header and footer, each section's icon, name and line, the edits a list makes, and what Publish
// changes -- as word keys (the `menu` namespace) and their values, so they are tested without the screen.

/** The sketch's section icons (docs/brand/lytro-storefront-builder.html, the editor's `P`). */
export type SectionIcon =
  | 'mega'
  | 'header'
  | 'slides'
  | 'grid'
  | 'spark'
  | 'tag'
  | 'star'
  | 'banner'
  | 'wide'
  | 'shield'
  | 'quote'
  | 'store'
  | 'cols'
  | 'palette';

/** A word to show, by its key and the values it takes, a value itself a word to show where it is one. */
export interface Words {
  key: string;
  params?: Record<string, string | number | Words>;
}

/** A word to show in the seller's language, its values themselves words where they are. */
export function wordsText(t: TFunction, words: Words): string {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(words.params ?? {})) {
    params[key] = typeof value === 'object' ? wordsText(t, value) : value;
  }
  return t(words.key, params);
}

/** A row of the section list: one of the design's sections, or the fixed header or footer. */
export type SectionRow =
  | { kind: 'fixed'; key: 'header' | 'footer' }
  | { kind: 'section'; section: StorefrontSection; index: number };

/** The rows as shoppers see the page: an announcement first sits over the header, then the rest, then the footer. */
export function sectionRows(design: StorefrontDesign): SectionRow[] {
  const rows: SectionRow[] = design.sections.map((section, index) => ({
    kind: 'section',
    section,
    index,
  }));
  const leading = design.sections[0]?.kind === StorefrontSectionKind.Announcement ? 1 : 0;
  rows.splice(leading, 0, { kind: 'fixed', key: 'header' });
  rows.push({ kind: 'fixed', key: 'footer' });
  return rows;
}

const ROW_ICONS: Readonly<Record<ProductRowSource, SectionIcon>> = {
  [ProductRowSource.Newest]: 'spark',
  [ProductRowSource.OnSale]: 'tag',
  [ProductRowSource.BestSellers]: 'star',
  [ProductRowSource.Category]: 'grid',
  [ProductRowSource.Picked]: 'tag',
  // OFFERS-PLAN: an offer's row (chosen in the editor from PR 2).
  [ProductRowSource.Offer]: 'tag',
};

export function sectionIcon(section: StorefrontSection): SectionIcon {
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      return 'mega';
    case StorefrontSectionKind.Hero:
      return 'slides';
    case StorefrontSectionKind.Categories:
      return 'grid';
    case StorefrontSectionKind.Products:
      return ROW_ICONS[section.source];
    case StorefrontSectionKind.OfferBanners:
      return 'banner';
    case StorefrontSectionKind.WideBanner:
      return 'wide';
    case StorefrontSectionKind.Trust:
      return 'shield';
    case StorefrontSectionKind.Testimonials:
      return 'quote';
    case StorefrontSectionKind.About:
      return 'store';
  }
}

const ROW_NAMES: Readonly<Record<ProductRowSource, string>> = {
  [ProductRowSource.Newest]: 'sdRowNewest',
  [ProductRowSource.OnSale]: 'sdRowOnSale',
  [ProductRowSource.BestSellers]: 'sdRowBest',
  [ProductRowSource.Category]: 'sdRowCategory',
  [ProductRowSource.Picked]: 'sdRowPicked',
  [ProductRowSource.Offer]: 'sdRowOffer',
};

const KIND_NAMES: Readonly<Record<StorefrontSectionKind, string>> = {
  [StorefrontSectionKind.Announcement]: 'sdKAnnouncement',
  [StorefrontSectionKind.Hero]: 'sdKHero',
  [StorefrontSectionKind.Categories]: 'sdKCategories',
  [StorefrontSectionKind.Products]: 'sdKProducts',
  [StorefrontSectionKind.OfferBanners]: 'sdKOffers',
  [StorefrontSectionKind.WideBanner]: 'sdKWide',
  [StorefrontSectionKind.Trust]: 'sdKTrust',
  [StorefrontSectionKind.Testimonials]: 'sdKQuotes',
  [StorefrontSectionKind.About]: 'sdKAbout',
};

/** A section's name: a row of products by its own title, else by what it lists. */
export function sectionName(section: StorefrontSection): Words {
  if (section.kind === StorefrontSectionKind.Products) {
    return section.title !== null
      ? { key: 'sdNamed', params: { name: section.title } }
      : { key: ROW_NAMES[section.source] };
  }
  return { key: KIND_NAMES[section.kind] };
}

/** The four category looks, in words. */
export const TILE_WORDS: Readonly<Record<CategoryTileStyle, string>> = {
  [CategoryTileStyle.Circle]: 'sdTileCircle',
  [CategoryTileStyle.Square]: 'sdTileSquare',
  [CategoryTileStyle.Tall]: 'sdTileTall',
  [CategoryTileStyle.Pill]: 'sdTilePill',
};

/** BL-3, BL-5: what an auto hero's slides show, in words. */
export const HERO_SOURCE_WORDS: Readonly<Record<HeroSource, string>> = {
  [ProductRowSource.OnSale]: 'ssSlidesOffers',
  [ProductRowSource.Newest]: 'ssSlidesNewest',
  [ProductRowSource.BestSellers]: 'ssSlidesBest',
};

/** The hero's three designs, in words. */
export const HERO_WORDS: Readonly<Record<HeroDesign, string>> = {
  [HeroDesign.Split]: 'ssHeroSplit',
  [HeroDesign.Overlay]: 'ssHeroOverlay',
  [HeroDesign.SlideTiles]: 'ssHeroTiles',
};

/** BL-6: the banners' three layouts, in words. */
export const BANNER_LAYOUT_WORDS: Readonly<Record<BannerLayout, string>> = {
  [BannerLayout.Full]: 'ssLayoutFull',
  [BannerLayout.Side]: 'ssLayoutSide',
  [BannerLayout.BigTwo]: 'ssLayoutBigTwo',
};

// The same, as a section's line under its name says them (lower case in English, as its other lines are).
const HERO_SOURCE_SUMS: Readonly<Record<HeroSource, string>> = {
  [ProductRowSource.OnSale]: 'sdSrcOffers',
  [ProductRowSource.Newest]: 'sdSrcNewest',
  [ProductRowSource.BestSellers]: 'sdSrcBest',
};
const HERO_LOOK_SUMS: Readonly<Record<HeroDesign, string>> = {
  [HeroDesign.Split]: 'sdLookSplit',
  [HeroDesign.Overlay]: 'sdLookOverlay',
  [HeroDesign.SlideTiles]: 'sdLookTiles',
};
const BANNER_LAYOUT_SUMS: Readonly<Record<BannerLayout, string>> = {
  [BannerLayout.Full]: 'sdLayoutFull',
  [BannerLayout.Side]: 'sdLayoutSide',
  [BannerLayout.BigTwo]: 'sdLayoutBigTwo',
};

/** BL-10: whether an item of the bar can show: an automatic one turned on, or a line of the seller's own. */
export function isShown(item: AnnouncementItem): boolean {
  return item.kind === AnnouncementItemKind.Own || item.visible;
}

/** The line under a section's name: what it shows, "Auto" where it fills itself; "Off" when hidden. */
export function sectionSummary(
  section: StorefrontSection,
  editor: Pick<StorefrontEditor, 'design' | 'categories'> & {
    /** OFFERS-PLAN: the shop's offers by ID, to name a row of one. */
    offers?: ReadonlyMap<string, string>;
  },
): Words {
  if (!section.visible) return { key: 'sdOff' };
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      // BL-10: the items the bar can show, two at a time.
      return { key: 'sdSumBar', params: { count: section.items.filter(isShown).length } };
    case StorefrontSectionKind.Hero: {
      const look = {
        key: HERO_LOOK_SUMS[section.design ?? STOREFRONT_THEMES[editor.design.theme].hero],
      };
      return section.fill === StorefrontFill.Auto
        ? {
            key: 'sdSumHeroBy',
            params: { source: { key: HERO_SOURCE_SUMS[section.source] }, look },
          }
        : { key: 'sdSumHeroOwn', params: { count: section.slides.length } };
    }
    case StorefrontSectionKind.Categories: {
      const style = section.style ?? STOREFRONT_THEMES[editor.design.theme].categories;
      return { key: 'sdSumCategories', params: { style: { key: TILE_WORDS[style] } } };
    }
    case StorefrontSectionKind.Products: {
      const layout = { key: section.layout === ProductRowLayout.Grid ? 'sdGrid' : 'sdCarousel' };
      if (section.source === ProductRowSource.Category) {
        const name = editor.categories.find((row) => row.id === section.categoryId)?.name ?? '';
        return { key: 'sdSumRowCategory', params: { name, count: section.count, layout } };
      }
      if (section.source === ProductRowSource.Picked) {
        return { key: 'sdSumRowPicked', params: { count: section.productIds.length, layout } };
      }
      if (section.source === ProductRowSource.Offer) {
        const name = (section.offerId ? editor.offers?.get(section.offerId) : undefined) ?? '';
        return { key: 'sdSumRowOffer', params: { name, count: section.count, layout } };
      }
      return {
        key: `sdSum${section.source === ProductRowSource.Newest ? 'Newest' : section.source === ProductRowSource.OnSale ? 'OnSale' : 'Best'}`,
        params: { count: section.count, layout },
      };
    }
    case StorefrontSectionKind.OfferBanners: {
      // BL-6: how many, and how they are laid out.
      const count =
        section.fill === StorefrontFill.Auto ? section.collections.length : section.banners.length;
      const layout = { key: BANNER_LAYOUT_SUMS[bannerLayoutFor(count, section.layout)] };
      return section.fill === StorefrontFill.Auto
        ? { key: 'sdSumOffersAutoAs', params: { count, layout } }
        : { key: 'sdSumOffersOwnAs', params: { count, layout } };
    }
    case StorefrontSectionKind.WideBanner:
      return { key: 'sdQuoted', params: { text: section.banner.headline } };
    case StorefrontSectionKind.Trust:
      return { key: 'sdSumTrust' };
    case StorefrontSectionKind.Testimonials:
      return { key: 'sdSumQuotes', params: { count: section.quotes.length } };
    case StorefrontSectionKind.About:
      return { key: 'sdQuoted', params: { text: section.title } };
  }
}

function replace(design: StorefrontDesign, sections: StorefrontSection[]): StorefrontDesign {
  return { ...design, sections };
}

/** A section one place up (-1) or down (1); at either end, the design as it was. */
export function moveSection(design: StorefrontDesign, id: string, by: -1 | 1): StorefrontDesign {
  const at = design.sections.findIndex((section) => section.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= design.sections.length) return design;
  const sections = [...design.sections];
  const [moving] = sections.splice(at, 1);
  if (!moving) return design;
  sections.splice(to, 0, moving);
  return replace(design, sections);
}

/** BL-1: a section dragged to a place in the list; one not found, or a place past either end, leaves it as it was. */
export function moveSectionTo(design: StorefrontDesign, id: string, to: number): StorefrontDesign {
  const at = design.sections.findIndex((section) => section.id === id);
  if (at < 0 || to < 0 || to >= design.sections.length || to === at) return design;
  const sections = [...design.sections];
  const [moving] = sections.splice(at, 1);
  if (!moving) return design;
  sections.splice(to, 0, moving);
  return replace(design, sections);
}

/** A section shown or hidden; hidden, it keeps everything it holds (SB-8). */
export function toggleSection(design: StorefrontDesign, id: string): StorefrontDesign {
  return replace(
    design,
    design.sections.map((section) =>
      section.id === id ? { ...section, visible: !section.visible } : section,
    ),
  );
}

export function removeSection(design: StorefrontDesign, id: string): StorefrontDesign {
  return replace(
    design,
    design.sections.filter((section) => section.id !== id),
  );
}

/** SB-8: whether another section fits (STOREFRONT_SECTIONS_MAX). */
export function canAddSection(design: StorefrontDesign): boolean {
  return design.sections.length < STOREFRONT_SECTIONS_MAX;
}

/** The kinds that fill themselves, ready the moment they are added. */
export type SelfFillingKind =
  'hero' | 'products' | 'categories' | 'offers' | 'trust' | 'announcement';

/** The kinds that need the seller's own words or photo first: their sheet opens, and they join once they hold them. */
export type WrittenKind = 'wide' | 'quotes' | 'about';

/** What "Add a section" offers, in the sketch's order (`e-add`). */
export type AddableKind = SelfFillingKind | WrittenKind;

export const ADDABLE: readonly {
  kind: AddableKind;
  icon: SectionIcon;
  name: string;
  line: string;
}[] = [
  { kind: 'hero', icon: 'slides', name: 'sdKHero', line: 'sdAddHero' },
  { kind: 'products', icon: 'tag', name: 'sdKProducts', line: 'sdAddProducts' },
  { kind: 'categories', icon: 'grid', name: 'sdKCategories', line: 'sdAddCategories' },
  { kind: 'offers', icon: 'banner', name: 'sdKOffers', line: 'sdAddOffers' },
  { kind: 'wide', icon: 'wide', name: 'sdKWide', line: 'sdAddWide' },
  { kind: 'trust', icon: 'shield', name: 'sdKTrust', line: 'sdAddTrust' },
  { kind: 'quotes', icon: 'quote', name: 'sdKQuotes', line: 'sdAddQuotes' },
  { kind: 'about', icon: 'store', name: 'sdKAbout', line: 'sdAddAbout' },
  { kind: 'announcement', icon: 'mega', name: 'sdKAnnouncement', line: 'sdAddAnnouncement' },
];

/** Whether a kind is added at once, filling itself, or opens its sheet first. */
export function fillsItself(kind: AddableKind): kind is SelfFillingKind {
  return kind !== 'wide' && kind !== 'quotes' && kind !== 'about';
}

/** SB-9: a new section of this kind, filling itself; product rows start as the newest four in a grid. */
export function newSection(kind: SelfFillingKind, id: string): StorefrontSection {
  const base = { id, visible: true };
  switch (kind) {
    case 'hero':
      return {
        ...base,
        kind: StorefrontSectionKind.Hero,
        fill: StorefrontFill.Auto,
        source: ProductRowSource.OnSale,
        design: null,
        slides: [],
        tiles: [...STARTING_HERO_TILES],
      };
    case 'products':
      return {
        ...base,
        kind: StorefrontSectionKind.Products,
        source: ProductRowSource.Newest,
        categoryId: null,
        productIds: [],
        title: null,
        layout: ProductRowLayout.Grid,
        count: 4,
      };
    case 'categories':
      return { ...base, kind: StorefrontSectionKind.Categories, title: null, style: null };
    case 'offers':
      return {
        ...base,
        kind: StorefrontSectionKind.OfferBanners,
        fill: StorefrontFill.Auto,
        layout: null,
        collections: [...STARTING_BANNER_COLLECTIONS],
        banners: [],
      };
    case 'trust':
      return { ...base, kind: StorefrontSectionKind.Trust };
    case 'announcement':
      return {
        ...base,
        kind: StorefrontSectionKind.Announcement,
        items: [...STARTING_ANNOUNCEMENT_ITEMS],
      };
  }
}

/** A new section goes to the end, above the footer; an announcement goes first, over the header. */
export function addSection(design: StorefrontDesign, section: StorefrontSection): StorefrontDesign {
  return replace(
    design,
    section.kind === StorefrontSectionKind.Announcement
      ? [section, ...design.sections]
      : [...design.sections, section],
  );
}

/** One line of what Publish changes. */
export interface DesignChange {
  icon: SectionIcon;
  words: Words;
}

/** SB-12: what publishing the draft changes against what shoppers see now, in the order a seller reads it; the
    themes named in the seller's language. */
export function changesOf(
  live: StorefrontDesign,
  draft: StorefrontDesign,
  language: 'bn' | 'en',
): DesignChange[] {
  const changes: DesignChange[] = [];
  if (live.theme !== draft.theme) {
    changes.push({
      icon: 'palette',
      words: {
        key: 'sdChTheme',
        params: {
          from: STOREFRONT_THEMES[live.theme].name[language],
          to: STOREFRONT_THEMES[draft.theme].name[language],
        },
      },
    });
  } else if (live.palette !== draft.palette) {
    changes.push({ icon: 'palette', words: { key: 'sdChPalette' } });
  }
  const before = new Map(live.sections.map((section) => [section.id, section]));
  const after = new Map(draft.sections.map((section) => [section.id, section]));
  for (const section of draft.sections) {
    const was = before.get(section.id);
    const name = sectionName(section);
    if (!was) {
      changes.push({ icon: sectionIcon(section), words: { key: 'sdChAdded', params: { name } } });
    } else if (was.visible !== section.visible) {
      changes.push({
        icon: sectionIcon(section),
        words: { key: section.visible ? 'sdChOn' : 'sdChOff', params: { name } },
      });
    } else if (JSON.stringify(was) !== JSON.stringify(section)) {
      changes.push({ icon: sectionIcon(section), words: { key: 'sdChEdited', params: { name } } });
    }
  }
  for (const section of live.sections) {
    if (!after.has(section.id)) {
      changes.push({
        icon: sectionIcon(section),
        words: { key: 'sdChRemoved', params: { name: sectionName(section) } },
      });
    }
  }
  const kept = (ids: string[], other: Map<string, StorefrontSection>) =>
    ids.filter((id) => other.has(id));
  const order = kept(
    live.sections.map((section) => section.id),
    after,
  );
  const now = kept(
    draft.sections.map((section) => section.id),
    before,
  );
  if (order.join() !== now.join()) changes.push({ icon: 'cols', words: { key: 'sdChOrder' } });
  return changes;
}
