import {
  CategoryTileStyle,
  ProductRowLayout,
  ProductRowSource,
  STOREFRONT_SECTIONS_MAX,
  STOREFRONT_THEMES,
  StorefrontFill,
  StorefrontSectionKind,
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

const TILE_WORDS: Readonly<Record<CategoryTileStyle, string>> = {
  [CategoryTileStyle.Circle]: 'sdTileCircle',
  [CategoryTileStyle.Square]: 'sdTileSquare',
  [CategoryTileStyle.Tall]: 'sdTileTall',
  [CategoryTileStyle.Pill]: 'sdTilePill',
};

/** The line under a section's name: what it shows, "Auto" where it fills itself; "Off" when hidden. */
export function sectionSummary(
  section: StorefrontSection,
  editor: Pick<StorefrontEditor, 'design' | 'categories'>,
): Words {
  if (!section.visible) return { key: 'sdOff' };
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      return section.text === null
        ? { key: 'sdSumAnnouncementAuto' }
        : { key: 'sdQuoted', params: { text: section.text } };
    case StorefrontSectionKind.Hero:
      return section.fill === StorefrontFill.Auto
        ? { key: 'sdSumHeroAuto' }
        : { key: 'sdSumHeroOwn', params: { count: section.slides.length } };
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
      return {
        key: `sdSum${section.source === ProductRowSource.Newest ? 'Newest' : section.source === ProductRowSource.OnSale ? 'OnSale' : 'Best'}`,
        params: { count: section.count, layout },
      };
    }
    case StorefrontSectionKind.OfferBanners:
      return section.fill === StorefrontFill.Auto
        ? { key: 'sdSumOffersAuto' }
        : { key: 'sdSumOffersOwn', params: { count: section.banners.length } };
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

/** What "Add a section" offers: each kind that fills itself, ready the moment it is added. */
export type AddableKind = 'hero' | 'products' | 'categories' | 'offers' | 'trust' | 'announcement';

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
  { kind: 'trust', icon: 'shield', name: 'sdKTrust', line: 'sdAddTrust' },
  { kind: 'announcement', icon: 'mega', name: 'sdKAnnouncement', line: 'sdAddAnnouncement' },
];

/** SB-9: a new section of this kind, filling itself; product rows start as the newest four in a grid. */
export function newSection(kind: AddableKind, id: string): StorefrontSection {
  const base = { id, visible: true };
  switch (kind) {
    case 'hero':
      return {
        ...base,
        kind: StorefrontSectionKind.Hero,
        fill: StorefrontFill.Auto,
        design: null,
        slides: [],
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
        banners: [],
      };
    case 'trust':
      return { ...base, kind: StorefrontSectionKind.Trust };
    case 'announcement':
      return { ...base, kind: StorefrontSectionKind.Announcement, text: null };
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
