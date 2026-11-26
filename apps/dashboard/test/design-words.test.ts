import {
  AnnouncementItemKind,
  BannerLayout,
  CategoryTileStyle,
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  StorefrontFill,
  StorefrontSectionKind,
  StorefrontThemeKey,
  STOREFRONT_SECTIONS_MAX,
  startingDesign,
  storefrontDesignSchema,
  type StorefrontSection,
} from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import bn from '../src/i18n/locales/menu/bn.json';
import en from '../src/i18n/locales/menu/en.json';
import {
  ADDABLE,
  addSection,
  canAddSection,
  changesOf,
  fillsItself,
  moveSection,
  moveSectionTo,
  newSection,
  removeSection,
  rowCount,
  sectionName,
  sectionRows,
  sectionSummary,
  toggleSection,
  type Words,
} from '../src/views/design/design-words';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-12: the design editor's list, its edits and what Publish changes.

const start = startingDesign(StorefrontThemeKey.Royal);
const editor = { design: start, categories: [] };

describe('the section list (SB-8)', () => {
  it('puts the fixed header after a leading announcement and the footer last', () => {
    const rows = sectionRows(start);
    expect(rows[0]).toMatchObject({
      kind: 'section',
      section: { kind: StorefrontSectionKind.Announcement },
    });
    expect(rows[1]).toEqual({ kind: 'fixed', key: 'header' });
    expect(rows.at(-1)).toEqual({ kind: 'fixed', key: 'footer' });
    // SB-32 as amended: and "সব প্রোডাক্ট".
    expect(rows).toHaveLength(start.sections.length + 3);
    const noAnnouncement = { ...start, sections: start.sections.slice(1) };
    expect(sectionRows(noAnnouncement)[0]).toEqual({ kind: 'fixed', key: 'header' });
  });

  it('puts "সব প্রোডাক্ট" after the last row of products shown, else before the trust strip, else last (de-sections)', () => {
    const kindsOf = (design: typeof start) =>
      sectionRows(design).map((row) =>
        row.kind === 'section' ? row.section.kind : row.kind === 'all' ? 'all' : row.key,
      );
    const kinds = kindsOf(start);
    const lastRow = kinds.lastIndexOf(StorefrontSectionKind.Products);
    expect(kinds[lastRow + 1]).toBe('all');
    // Every row of products switched off: before the trust strip.
    const hidden = {
      ...start,
      sections: start.sections.map((section) =>
        section.kind === StorefrontSectionKind.Products ? { ...section, visible: false } : section,
      ),
    };
    const off = kindsOf(hidden);
    expect(off[off.indexOf(StorefrontSectionKind.Trust) - 1]).toBe('all');
    // No row and no trust strip: last, before the footer.
    const bare = {
      ...start,
      sections: start.sections.filter(
        (section) =>
          section.kind !== StorefrontSectionKind.Products &&
          section.kind !== StorefrontSectionKind.Trust,
      ),
    };
    expect(kindsOf(bare).slice(-2)).toEqual(['all', 'footer']);
  });

  it('counts a grid in whole lines of four (SB-32 as amended)', () => {
    expect(rowCount({ layout: ProductRowLayout.Grid, count: 6 })).toBe(4);
    expect(rowCount({ layout: ProductRowLayout.Grid, count: 8 })).toBe(8);
    expect(rowCount({ layout: ProductRowLayout.Carousel, count: 6 })).toBe(6);
  });

  it('names a row by its title, else by what it lists, and says what each section fills itself with', () => {
    const row = start.sections.find((section) => section.kind === StorefrontSectionKind.Products);
    if (row?.kind !== StorefrontSectionKind.Products)
      throw new Error('a starting design has a row');
    expect(sectionName(row)).toEqual({ key: 'sdRowBest' });
    expect(sectionName({ ...row, title: 'Our picks' })).toEqual({
      key: 'sdNamed',
      params: { name: 'Our picks' },
    });
    expect(sectionSummary(row, editor)).toEqual({
      key: 'sdSumBest',
      params: { count: 4, layout: { key: 'sdGrid' } },
    });
    expect(sectionSummary({ ...row, visible: false }, editor)).toEqual({ key: 'sdOff' });
  });
});

describe('the edits a list makes (SB-8)', () => {
  const [first, second] = start.sections;
  if (!first || !second) throw new Error('a starting design has sections');

  it('drags a section to any place, and leaves one not found or a place past the ends as it was (BL-1)', () => {
    const ids = (design: typeof start) => design.sections.map((section) => section.id);
    const [first, second, third] = ids(start);
    if (!first || !second || !third) throw new Error('a starting design has three sections');
    const moved = moveSectionTo(start, third, 0);
    expect(ids(moved).slice(0, 3)).toEqual([third, first, second]);
    expect(ids(moveSectionTo(moved, third, 2)).slice(0, 3)).toEqual([first, second, third]);
    expect(moveSectionTo(start, 'gone', 0)).toBe(start);
    expect(moveSectionTo(start, first, start.sections.length)).toBe(start);
    expect(moveSectionTo(start, first, 0)).toBe(start);
  });

  it('moves a section up or down, and leaves the ends as they are', () => {
    expect(moveSection(start, second.id, -1).sections.slice(0, 2)).toEqual([second, first]);
    expect(moveSection(start, first.id, -1)).toBe(start);
  });

  it('hides a section keeping what it holds, removes one, and adds each kind ready to show', () => {
    const hidden = toggleSection(start, second.id);
    expect(hidden.sections[1]).toEqual({ ...second, visible: false });
    expect(removeSection(start, second.id).sections).toHaveLength(start.sections.length - 1);
    for (const [at, addable] of ADDABLE.entries()) {
      // A wide banner, testimonials and About open their sheet first (section-drafts.test.ts).
      if (!fillsItself(addable.kind)) continue;
      const id = `00000000-0000-4000-8000-${String(900 + at).padStart(12, '0')}`;
      const added = addSection(start, newSection(addable.kind, id));
      expect(storefrontDesignSchema.safeParse(added).success).toBe(true);
      // An announcement goes first, over the header; anything else at the end.
      const where = addable.kind === 'announcement' ? 0 : added.sections.length - 1;
      expect(added.sections[where]?.id).toBe(id);
    }
  });

  it(`stops at ${String(STOREFRONT_SECTIONS_MAX)} sections`, () => {
    const full = {
      ...start,
      sections: Array.from({ length: STOREFRONT_SECTIONS_MAX }, (_, at) =>
        newSection('trust', `00000000-0000-4000-8000-${String(at).padStart(12, '0')}`),
      ),
    };
    expect(canAddSection(full)).toBe(false);
    expect(canAddSection(start)).toBe(true);
  });
});

describe('what Publish changes (SB-12)', () => {
  it('names the theme change, the sections added, hidden, edited, removed and reordered', () => {
    const [first, second, third] = start.sections;
    if (!first || !second || !third) throw new Error('a starting design has sections');
    const draft = {
      ...start,
      theme: StorefrontThemeKey.Soft,
      sections: [
        second,
        { ...first, visible: false },
        ...start.sections.slice(3),
        newSection('trust', '00000000-0000-4000-8000-000000000999'),
      ],
    };
    const changes = changesOf(start, draft, 'en').map((change) => change.words.key);
    expect(changes).toEqual(['sdChTheme', 'sdChOff', 'sdChAdded', 'sdChRemoved', 'sdChOrder']);
    expect(changesOf(start, draft, 'en')[0]?.words.params).toEqual({ from: 'Royal', to: 'Soft' });
    expect(changesOf(start, start, 'en')).toEqual([]);
    const edited = {
      ...start,
      sections: start.sections.map((section) =>
        section.kind === StorefrontSectionKind.Products
          ? { ...section, source: ProductRowSource.Newest }
          : section,
      ),
    };
    expect(changesOf(start, edited, 'bn').map((change) => change.words.key)).toContain(
      'sdChEdited',
    );
  });
});

describe('the words the editor builds (I18N-01)', () => {
  /** Every key a word and its nested words name, as i18next reads it: a counted one in its plural forms. */
  function keysOf(words: Words): string[] {
    const own =
      words.params?.['count'] === undefined
        ? [words.key]
        : [`${words.key}_one`, `${words.key}_other`];
    return [
      ...own,
      ...Object.values(words.params ?? {}).flatMap((value) =>
        typeof value === 'object' ? keysOf(value) : [],
      ),
    ];
  }

  it('finds each in both dictionaries, for every kind of section, every source and every tile', () => {
    const sections: StorefrontSection[] = [
      ...Object.values(StorefrontThemeKey).flatMap((theme) => startingDesign(theme).sections),
      ...ADDABLE.flatMap((addable, at) =>
        fillsItself(addable.kind)
          ? [newSection(addable.kind, `00000000-0000-4000-8000-${String(at).padStart(12, '0')}`)]
          : [],
      ),
      ...Object.values(ProductRowSource).map(
        (source) =>
          ({
            ...newSection('products', '00000000-0000-4000-8000-000000000050'),
            source,
            layout: ProductRowLayout.Carousel,
          }) as StorefrontSection,
      ),
      ...Object.values(CategoryTileStyle).map(
        (style) =>
          ({
            ...newSection('categories', '00000000-0000-4000-8000-000000000060'),
            style,
          }) as StorefrontSection,
      ),
      {
        ...newSection('hero', '00000000-0000-4000-8000-000000000070'),
        fill: StorefrontFill.Own,
      } as StorefrontSection,
      {
        ...newSection('offers', '00000000-0000-4000-8000-000000000071'),
        fill: StorefrontFill.Own,
      } as StorefrontSection,
      {
        ...newSection('announcement', '00000000-0000-4000-8000-000000000072'),
        items: [{ kind: AnnouncementItemKind.Own, text: 'Eid sale' }],
      } as StorefrontSection,
      // BL-3, BL-6: every source an auto hero shows, every banner layout.
      ...[ProductRowSource.OnSale, ProductRowSource.Newest, ProductRowSource.BestSellers].map(
        (source) =>
          ({
            ...newSection('hero', '00000000-0000-4000-8000-000000000073'),
            source,
            design: HeroDesign.SlideTiles,
          }) as StorefrontSection,
      ),
      ...Object.values(BannerLayout).map(
        (layout) =>
          ({
            ...newSection('offers', '00000000-0000-4000-8000-000000000074'),
            layout,
          }) as StorefrontSection,
      ),
    ];
    const used = new Set<string>(ADDABLE.flatMap((addable) => [addable.name, addable.line]));
    for (const section of sections) {
      for (const words of [
        sectionName(section),
        sectionSummary(section, editor),
        sectionSummary({ ...section, visible: false }, editor),
      ]) {
        for (const key of keysOf(words)) used.add(key);
      }
    }
    const draft = { ...start, theme: StorefrontThemeKey.Bold, sections: sections.slice(0, 5) };
    for (const change of [
      ...changesOf(start, draft, 'en'),
      ...changesOf(start, { ...start, palette: 1 }, 'en'),
    ]) {
      for (const key of keysOf(change.words)) used.add(key);
    }
    expect(used.size).toBeGreaterThan(40);
    const missing = (dictionary: object) => [...used].filter((key) => !(key in dictionary));
    expect(missing(en)).toEqual([]);
    expect(missing(bn)).toEqual([]);
  });
});
