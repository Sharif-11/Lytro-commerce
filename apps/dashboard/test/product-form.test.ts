import { describe, expect, it } from 'vitest';
import {
  changedParts,
  createBody,
  isDirty,
  NEW_PRODUCT,
  priceText,
  problemsOf,
  toggleCategory,
  withSaved,
  type ProductForm,
} from '../src/lib/product-form';

const SAVED: ProductForm = {
  name: 'Cotton T-shirt',
  price: '450',
  description: '100% cotton.',
  categoryIds: ['c-tshirts'],
  primaryCategoryId: 'c-tshirts',
  active: true,
  imageIds: ['m-1', 'm-2'],
  videoId: null,
};

describe('the product form (TENANT-DASHBOARD-DESIGN §7.4)', () => {
  it('shows a stored price as it was typed', () => {
    expect(priceText('450.00')).toBe('450');
    expect(priceText('99.50')).toBe('99.5');
  });

  it('needs a name and a price, a price being a number with at most two decimals (PRD-01)', () => {
    expect(problemsOf(NEW_PRODUCT)).toEqual({ name: 'required', price: 'required' });
    expect(problemsOf({ ...SAVED, name: '  ', price: '12.345' })).toEqual({
      name: 'required',
      price: 'notAPrice',
    });
    expect(problemsOf({ ...SAVED, price: '১২' })).toEqual({ price: 'notAPrice' });
    expect(problemsOf({ ...SAVED, price: '0' })).toEqual({});
  });

  it('makes a new product one request, with its photos and video only when it has them', () => {
    expect(createBody({ ...NEW_PRODUCT, name: ' Kurta ', price: '1250' })).toEqual({
      name: 'Kurta',
      basePrice: 1250,
      description: null,
      categoryIds: [],
      primaryCategoryId: null,
      active: true,
    });
    expect(createBody({ ...SAVED, videoId: 'v-1' })).toMatchObject({
      imageIds: ['m-1', 'm-2'],
      videoId: 'v-1',
    });
  });

  it('sends only what changed, each part by its own request (agreed point 7)', () => {
    expect(changedParts(SAVED, SAVED)).toEqual([]);
    expect(isDirty(SAVED, { ...SAVED, name: 'Cotton T-shirt ' })).toBe(false);
    expect(changedParts(SAVED, { ...SAVED, price: '470' })).toEqual([
      { part: 'fields', body: { basePrice: 470 } },
    ]);
    // The categories go with their primary, whichever of the two changed.
    expect(changedParts(SAVED, { ...SAVED, primaryCategoryId: null, categoryIds: [] })).toEqual([
      { part: 'fields', body: { categoryIds: [], primaryCategoryId: null } },
    ]);
    expect(
      changedParts(SAVED, { ...SAVED, description: '', imageIds: ['m-2', 'm-1'], videoId: 'v-1' }),
    ).toEqual([
      { part: 'fields', body: { description: null } },
      { part: 'images', body: { mediaIds: ['m-2', 'm-1'] } },
      { part: 'video', body: { mediaId: 'v-1' } },
    ]);
  });

  it('keeps as saved only the parts that went through', () => {
    const typed = { ...SAVED, name: 'Tee', imageIds: ['m-1'] };
    const saved = withSaved(SAVED, typed, ['fields']);
    expect(saved).toEqual({ ...SAVED, name: 'Tee' });
    expect(changedParts(saved, typed)).toEqual([{ part: 'images', body: { mediaIds: ['m-1'] } }]);
  });

  it('files the first category ticked as primary, and passes it on when unticked (PRD-15)', () => {
    let chosen = toggleCategory({ categoryIds: [], primaryCategoryId: null }, 'a');
    expect(chosen).toEqual({ categoryIds: ['a'], primaryCategoryId: 'a' });
    chosen = toggleCategory(chosen, 'b');
    expect(chosen).toEqual({ categoryIds: ['a', 'b'], primaryCategoryId: 'a' });
    expect(toggleCategory(chosen, 'a')).toEqual({ categoryIds: ['b'], primaryCategoryId: 'b' });
    expect(toggleCategory(chosen, 'b')).toEqual({ categoryIds: ['a'], primaryCategoryId: 'a' });
    expect(toggleCategory({ categoryIds: ['a'], primaryCategoryId: 'a' }, 'a')).toEqual({
      categoryIds: [],
      primaryCategoryId: null,
    });
  });
});
