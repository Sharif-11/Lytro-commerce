import {
  ProductRowLayout,
  ProductRowSource,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  StorefrontThemeKey,
  storefrontDesignSchema,
  type StorefrontSection,
} from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import bn from '../src/i18n/locales/menu/bn.json';
import en from '../src/i18n/locales/menu/en.json';
import { newSection } from '../src/views/design/design-words';
import {
  finishSection,
  itemDraftOf,
  itemOf,
  itemProblems,
  linkWords,
  moveItem,
  newItemDraft,
  quoteDraftOf,
  quoteOf,
  quoteProblems,
  sectionProblems,
  withSource,
} from '../src/views/design/section-drafts';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-15, SB-16 (PR 3b): a section's sheet -- an item's and a quote's fields, what a
// section still needs before Done, a section made ready for the draft, a row moved between sources.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = { mediaId: id(500), focusX: 40, focusY: 60 };
const names = {
  categories: new Map([[id(7), 'Lipstick']]),
  products: new Map([[id(8), 'Matte lipstick']]),
};

/** The section, alone in a design, as the server's schema reads it. */
function accepted(section: StorefrontSection): boolean {
  return storefrontDesignSchema.safeParse({
    theme: StorefrontThemeKey.Soft,
    palette: 0,
    sections: [section],
  }).success;
}

describe('a slide or a banner (SB-8, SB-15)', () => {
  it('needs a photo, a headline and the button’s words, and keeps optional words empty as none', () => {
    const draft = newItemDraft('Shop now');
    expect(itemProblems(draft)).toEqual(['photo', 'headline']);
    expect(itemOf(draft)).toBeNull();
    const filled = { ...draft, photo, headline: '  Glow for Eid ', kicker: ' ', button: ' Shop ' };
    expect(itemProblems(filled)).toEqual([]);
    expect(itemOf(filled)).toEqual({
      photo,
      kicker: null,
      headline: 'Glow for Eid',
      description: null,
      button: 'Shop',
      link: { kind: StorefrontLinkKind.JustIn },
    });
    expect(itemProblems({ ...filled, button: '' })).toEqual(['button']);
  });

  it('opens a saved one as it was', () => {
    const slide = itemOf({
      ...newItemDraft('Shop'),
      photo,
      headline: 'Sale',
      description: 'All week',
    });
    if (!slide) throw new Error('a filled slide is one');
    expect(itemOf(itemDraftOf(slide))).toEqual(slide);
  });
});

describe('a quote (SB-8)', () => {
  it('needs a name and the words; the place is optional', () => {
    expect(quoteProblems(quoteDraftOf(null))).toEqual(['name', 'text']);
    expect(quoteOf({ name: ' Ratri ', place: '', text: ' Quick delivery. ' })).toEqual({
      name: 'Ratri',
      place: null,
      text: 'Quick delivery.',
    });
  });
});

describe('what a section needs before Done (SB-8, SB-9)', () => {
  const row = newSection('products', id(1));
  if (row.kind !== StorefrontSectionKind.Products) throw new Error('a row of products');

  it('asks for a slide, a banner, a category, a product or a quote where the section has none', () => {
    const hero = { ...newSection('hero', id(2)), fill: StorefrontFill.Own } as StorefrontSection;
    const offers = {
      ...newSection('offers', id(3)),
      fill: StorefrontFill.Own,
    } as StorefrontSection;
    const category = withSource(row, ProductRowSource.Category, {
      categoryId: null,
      productIds: [],
    });
    const picked = withSource(row, ProductRowSource.Picked, { categoryId: null, productIds: [] });
    const quotes: StorefrontSection = {
      id: id(4),
      visible: true,
      kind: StorefrontSectionKind.Testimonials,
      title: null,
      quotes: [],
    };
    const about: StorefrontSection = {
      id: id(5),
      visible: true,
      kind: StorefrontSectionKind.About,
      title: ' ',
      text: '',
      photo: null,
    };
    const line: StorefrontSection = {
      id: id(6),
      visible: true,
      kind: StorefrontSectionKind.Announcement,
      text: '  ',
    };
    const fields = (section: StorefrontSection) =>
      sectionProblems(section).map((each) => each.field);
    expect(fields(hero)).toEqual(['slides']);
    expect(fields(offers)).toEqual(['banners']);
    expect(fields(category)).toEqual(['category']);
    expect(fields(picked)).toEqual(['products']);
    expect(fields(quotes)).toEqual(['quotes']);
    expect(fields(about)).toEqual(['title', 'text']);
    expect(fields(line)).toEqual(['line']);
    // What it needs is just what the server's schema refuses.
    for (const section of [hero, offers, category, picked, quotes, about]) {
      expect(accepted(finishSection(section))).toBe(false);
    }
  });

  it('lets a section that holds what it needs into the draft, its words trimmed', () => {
    const titled = finishSection({ ...row, title: '  ' });
    expect(titled).toMatchObject({ title: null });
    expect(accepted(titled)).toBe(true);
    const own = finishSection({
      id: id(6),
      visible: true,
      kind: StorefrontSectionKind.Announcement,
      text: ' Eid sale ',
    });
    expect(own).toMatchObject({ text: 'Eid sale' });
    expect(sectionProblems(own)).toEqual([]);
    expect(accepted(own)).toBe(true);
  });

  it('moves a row between sources keeping its look, and finds what a source had when it comes back', () => {
    const kept = { categoryId: id(7), productIds: [id(8), id(9)] };
    const category = withSource(
      { ...row, layout: ProductRowLayout.Carousel },
      ProductRowSource.Category,
      kept,
    );
    expect(category).toMatchObject({
      categoryId: id(7),
      productIds: [],
      layout: ProductRowLayout.Carousel,
    });
    expect(accepted(category)).toBe(true);
    const picked = withSource(category, ProductRowSource.Picked, kept);
    expect(picked).toMatchObject({ categoryId: null, productIds: [id(8), id(9)] });
    expect(accepted(picked)).toBe(true);
    expect(withSource(picked, ProductRowSource.OnSale, kept)).toMatchObject({
      categoryId: null,
      productIds: [],
    });
  });
});

describe('the words a sheet builds (SB-16, I18N-01)', () => {
  it('names where a button leads, and every word it needs is in both dictionaries', () => {
    const links = [
      { kind: StorefrontLinkKind.OnSale },
      { kind: StorefrontLinkKind.JustIn },
      { kind: StorefrontLinkKind.BestSellers },
      { kind: StorefrontLinkKind.Category, categoryId: id(7) },
      { kind: StorefrontLinkKind.Product, productId: id(8) },
    ] as const;
    expect(linkWords(links[3], names)).toEqual({
      key: 'ssLinkCategory',
      params: { name: 'Lipstick' },
    });
    const keys = [
      ...links.map((link) => linkWords(link, names).key),
      'ssNeedSlide',
      'ssNeedBanner',
      'ssNeedCategory',
      'ssNeedProducts',
      'ssNeedQuote',
      'ssNeedTitle',
      'ssNeedText',
      'ssNeedLine',
      'ssItemLine',
    ];
    for (const dictionary of [en, bn] as Record<string, unknown>[]) {
      expect(keys.filter((key) => !(key in dictionary))).toEqual([]);
    }
  });

  it('moves an item up or down its list, and leaves the ends as they are', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
