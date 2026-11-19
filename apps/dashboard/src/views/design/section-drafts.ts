import {
  AnnouncementItemKind,
  ProductRowSource,
  STOREFRONT_BANNER_HEADLINE_MAX,
  STOREFRONT_HEADLINE_MAX,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  type HeroSlide,
  type StorefrontBanner,
  type StorefrontCollection,
  type StorefrontLink,
  type StorefrontPhoto,
  type StorefrontSection,
  type Testimonial,
} from '@lytronix/validators';
import type { Words } from './design-words';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-15, SB-16 (PR 3b): a section's sheet as plain functions -- a slide's, a
// banner's and a quote's fields while they are typed, what each still needs before Done, a section made ready for the
// draft, and a row of products moved to another source -- so they are tested without the screen.

/** A slide's or a banner's fields while they are typed: the photo may not be there yet, the words may be empty. */
export interface ItemDraft {
  photo: StorefrontPhoto | null;
  kicker: string;
  headline: string;
  description: string;
  button: string;
  link: StorefrontLink;
}

/** A slide's headline is longer than a banner's (SB-8). */
export type ItemKind = 'slide' | 'banner';

export const HEADLINE_MAX: Readonly<Record<ItemKind, number>> = {
  slide: STOREFRONT_HEADLINE_MAX,
  banner: STOREFRONT_BANNER_HEADLINE_MAX,
};

/** A new item leads to the newest products until the seller chooses, with the button's usual words. */
export function newItemDraft(button: string): ItemDraft {
  return {
    photo: null,
    kicker: '',
    headline: '',
    description: '',
    button,
    link: { kind: StorefrontLinkKind.JustIn },
  };
}

export function itemDraftOf(item: HeroSlide | StorefrontBanner): ItemDraft {
  return {
    photo: item.photo,
    kicker: item.kicker ?? '',
    headline: item.headline,
    description: item.description ?? '',
    button: item.button,
    link: item.link,
  };
}

/** What an item still needs before Done: a photo, a headline, the button's words. */
export function itemProblems(draft: ItemDraft): ('photo' | 'headline' | 'button')[] {
  const problems: ('photo' | 'headline' | 'button')[] = [];
  if (draft.photo === null) problems.push('photo');
  if (draft.headline.trim() === '') problems.push('headline');
  if (draft.button.trim() === '') problems.push('button');
  return problems;
}

const optional = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/** The item as the design holds it; null while it still needs something. */
export function itemOf(draft: ItemDraft): HeroSlide | null {
  if (draft.photo === null || itemProblems(draft).length > 0) return null;
  return {
    photo: draft.photo,
    kicker: optional(draft.kicker),
    headline: draft.headline.trim(),
    description: optional(draft.description),
    button: draft.button.trim(),
    link: draft.link,
  };
}

/** A quote's fields while they are typed. */
export interface QuoteDraft {
  name: string;
  place: string;
  text: string;
}

export function quoteDraftOf(quote: Testimonial | null): QuoteDraft {
  return { name: quote?.name ?? '', place: quote?.place ?? '', text: quote?.text ?? '' };
}

export function quoteProblems(draft: QuoteDraft): ('name' | 'text')[] {
  const problems: ('name' | 'text')[] = [];
  if (draft.name.trim() === '') problems.push('name');
  if (draft.text.trim() === '') problems.push('text');
  return problems;
}

export function quoteOf(draft: QuoteDraft): Testimonial | null {
  if (quoteProblems(draft).length > 0) return null;
  return { name: draft.name.trim(), place: optional(draft.place), text: draft.text.trim() };
}

/**
 * A row moved to another source keeps its layout, size and title, and takes only what that source reads: a category
 * for one category, its chosen products for hand-picked (SB-9). Coming back to a source finds what it had.
 */
export function withSource(
  section: Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>,
  source: ProductRowSource,
  kept: { categoryId: string | null; productIds: string[] },
): Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }> {
  return {
    ...section,
    source,
    categoryId: source === ProductRowSource.Category ? kept.categoryId : null,
    productIds: source === ProductRowSource.Picked ? kept.productIds : [],
  };
}

/** One thing a section still needs before Done, under the field it belongs to. */
export interface SectionProblem {
  field: 'slides' | 'banners' | 'category' | 'products' | 'quotes' | 'title' | 'text';
  words: Words;
}

/** What a section still needs before it goes into the draft; none, and Done saves it. */
export function sectionProblems(section: StorefrontSection): SectionProblem[] {
  switch (section.kind) {
    case StorefrontSectionKind.Hero:
      return section.fill === StorefrontFill.Own && section.slides.length === 0
        ? [{ field: 'slides', words: { key: 'ssNeedSlide' } }]
        : [];
    case StorefrontSectionKind.OfferBanners:
      return section.fill === StorefrontFill.Own && section.banners.length === 0
        ? [{ field: 'banners', words: { key: 'ssNeedBanner' } }]
        : [];
    case StorefrontSectionKind.Products:
      if (section.source === ProductRowSource.Category && section.categoryId === null) {
        return [{ field: 'category', words: { key: 'ssNeedCategory' } }];
      }
      if (section.source === ProductRowSource.Picked && section.productIds.length === 0) {
        return [{ field: 'products', words: { key: 'ssNeedProducts' } }];
      }
      return [];
    case StorefrontSectionKind.Testimonials:
      return section.quotes.length === 0
        ? [{ field: 'quotes', words: { key: 'ssNeedQuote' } }]
        : [];
    case StorefrontSectionKind.About: {
      const problems: SectionProblem[] = [];
      if (section.title.trim() === '')
        problems.push({ field: 'title', words: { key: 'ssNeedTitle' } });
      if (section.text.trim() === '')
        problems.push({ field: 'text', words: { key: 'ssNeedText' } });
      return problems;
    }
    default:
      return [];
  }
}

/** The section as the draft keeps it: its words trimmed, an optional one left empty as none. */
export function finishSection(section: StorefrontSection): StorefrontSection {
  switch (section.kind) {
    case StorefrontSectionKind.Announcement:
      return {
        ...section,
        items: section.items.map((item) =>
          item.kind === AnnouncementItemKind.Own ? { ...item, text: item.text.trim() } : item,
        ),
      };
    case StorefrontSectionKind.Categories:
    case StorefrontSectionKind.Testimonials:
      return { ...section, title: section.title === null ? null : optional(section.title) };
    case StorefrontSectionKind.Products:
      return { ...section, title: section.title === null ? null : optional(section.title) };
    case StorefrontSectionKind.About:
      return { ...section, title: section.title.trim(), text: section.text.trim() };
    default:
      return section;
  }
}

/** BL-3, BL-9: what a collection is, in a line under its name. */
export function collectionLine(collection: StorefrontCollection): Words {
  switch (collection.kind) {
    case StorefrontLinkKind.OnSale:
      return { key: 'ssLinkOnSaleLine' };
    case StorefrontLinkKind.JustIn:
      return { key: 'ssLinkJustInLine' };
    case StorefrontLinkKind.BestSellers:
      return { key: 'ssLinkBestLine' };
    case StorefrontLinkKind.Category:
      return { key: 'ssCollectionCategoryLine' };
  }
}

/** Where a button leads, in words, naming the category or product it names. */
export function linkWords(
  link: StorefrontLink,
  names: { categories: Map<string, string>; products: Map<string, string> },
): Words {
  switch (link.kind) {
    case StorefrontLinkKind.OnSale:
      return { key: 'ssLinkOnSale' };
    case StorefrontLinkKind.JustIn:
      return { key: 'ssLinkJustIn' };
    case StorefrontLinkKind.BestSellers:
      return { key: 'ssLinkBest' };
    case StorefrontLinkKind.Category:
      return {
        key: 'ssLinkCategory',
        params: { name: names.categories.get(link.categoryId) ?? '…' },
      };
    case StorefrontLinkKind.Product:
      return {
        key: 'ssLinkProduct',
        params: { name: names.products.get(link.productId) ?? '…' },
      };
    // OFFERS-PLAN: a button to an offer's page (chosen in the editor from PR 2).
    case StorefrontLinkKind.Offer:
      return { key: 'ssLinkOffer' };
  }
}

/** The line under an item in its section's list: the button's words and where it leads. */
export function itemLine(
  item: Pick<HeroSlide, 'button' | 'link'>,
  names: { categories: Map<string, string>; products: Map<string, string> },
): Words {
  return { key: 'ssItemLine', params: { button: item.button, to: linkWords(item.link, names) } };
}

/** An item moved one place up (-1) or down (1) in its list; at either end, the list as it was. */
export function moveItem<T>(items: readonly T[], at: number, by: -1 | 1): T[] {
  const to = at + by;
  if (at < 0 || at >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moving] = next.splice(at, 1);
  if (moving !== undefined) next.splice(to, 0, moving);
  return next;
}
