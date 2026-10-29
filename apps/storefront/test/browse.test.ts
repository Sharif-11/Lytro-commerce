import { describe, expect, it } from 'vitest';
import type { PublicCategory } from '../src/lib/api/storefront-api';
import {
  chipsFor,
  deliveryRange,
  findCategory,
  heroLine,
  isNew,
  listHref,
  listParams,
  searchOf,
} from '../src/lib/catalogue/browse';
import { Words } from '../src/lib/i18n/words';

const DAY = 24 * 60 * 60 * 1000;
const category = (slug: string, children: PublicCategory[] = []): PublicCategory => ({
  id: slug,
  slug,
  name: `${(slug[0] ?? '').toUpperCase()}${slug.slice(1)}`,
  image: null,
  productCount: 1,
  children,
});
const tree = [
  category('panjabi'),
  category('sarees', [category('jamdani'), category('silk', [category('katan')])]),
  category('kids'),
  category('hijab'),
];

describe('the storefront browse rules (Slice 12b)', () => {
  it('marks a product New for fourteen days after it was added', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    expect(isNew(new Date(now - 13 * DAY).toISOString(), now)).toBe(true);
    expect(isNew(new Date(now - 14 * DAY).toISOString(), now)).toBe(false);
    expect(isNew('not a date', now)).toBe(false);
  });

  it("writes the hero's line from the first three categories", () => {
    const en = new Words('en');
    expect(heroLine(tree, en)).toBe('Panjabi, Sarees, Kids and more');
    expect(heroLine(tree.slice(0, 2), en)).toBe('Panjabi, Sarees');
    expect(heroLine([], en)).toBeNull();
    expect(heroLine(tree, new Words('bn'))).toBe('Panjabi, Sarees, Kids এবং আরও অনেক কিছু');
  });

  it('gives the delivery range across the zones that deliver', () => {
    const zone = (charge: string, noDelivery = false) => ({
      id: charge,
      name: { en: charge, bn: charge },
      charge,
      noDelivery,
    });
    expect(deliveryRange([zone('130.00'), zone('70.00'), zone('0.00', true)])).toEqual({
      from: 70,
      to: 130,
    });
    expect(deliveryRange([zone('60.00', true)])).toBeNull();
  });

  it('finds a category anywhere, with its parent and its top-level category', () => {
    const found = findCategory(tree, 'katan');
    expect(found?.category.slug).toBe('katan');
    expect(found?.parent?.slug).toBe('silk');
    expect(found?.top.slug).toBe('sarees');
    expect(findCategory(tree, 'panjabi')?.top.slug).toBe('panjabi');
    expect(findCategory(tree, 'missing')).toBeNull();
  });

  it("chips a category's subcategories after All, or else the categories beside it", () => {
    const sarees = findCategory(tree, 'sarees');
    const kids = findCategory(tree, 'kids');
    if (!sarees || !kids) throw new Error('fixture');
    expect(chipsFor(sarees)).toEqual({ all: true, chips: sarees.category.children });
    expect(chipsFor(kids).all).toBe(false);
    expect(chipsFor(kids).chips.map((chip) => chip.slug)).toEqual([
      'panjabi',
      'sarees',
      'kids',
      'hijab',
    ]);
  });

  it("reads a list's order and stock filter, and writes them back without the default", () => {
    const params = listParams({ sort: 'price_low', stock: 'in' }, 'featured');
    expect(params).toEqual({ sort: 'price_low', inStock: true });
    expect(listParams({ sort: 'relevance', stock: 'yes' }, 'featured')).toEqual({
      sort: 'featured',
      inStock: false,
    });
    expect(listHref('/c/panjabi', params, 'featured')).toBe('/c/panjabi?sort=price_low&stock=in');
    expect(listHref('/c/panjabi', { sort: 'featured', inStock: false }, 'featured')).toBe(
      '/c/panjabi',
    );
  });

  it('reads a search, its spacing folded; blank is none', () => {
    expect(searchOf({ q: '  lal   panjabi ' })).toBe('lal panjabi');
    expect(searchOf({ q: '   ' })).toBeNull();
    expect(searchOf({ q: ['a', 'b'] })).toBeNull();
  });
});
