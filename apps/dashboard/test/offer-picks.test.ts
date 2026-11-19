import { describe, expect, it } from 'vitest';
import type { OfferItem } from '../src/types/offers';
import {
  designsPicked,
  isWhole,
  productCount,
  removePick,
  rowsOf,
  toggleDesign,
  toggleProduct,
} from '../src/views/offers/offer-picks';

// OFFERS-PLAN OF-9, OF-25: what the picker holds -- a product whole, or some of its designs, all of them being the
// product whole -- and an offer's rows, a product's picked designs together.

const DESIGNS = ['d1', 'd2', 'd3'];

describe('picking products and designs (OF-9)', () => {
  it('ticks a product whole, and untick takes everything of it out', () => {
    const picked = toggleProduct([], 'p');
    expect(isWhole(picked, 'p')).toBe(true);
    expect(toggleProduct(picked, 'p')).toEqual([]);
    expect(toggleProduct([{ productId: 'p', designId: 'd1' }], 'p')).toEqual([]);
  });

  it('ticks designs one by one, all of them being the product whole, none taking it out', () => {
    let picks = toggleDesign([], 'p', DESIGNS, 'd2');
    expect([...designsPicked(picks, 'p')]).toEqual(['d2']);
    picks = toggleDesign(picks, 'p', DESIGNS, 'd1');
    expect(picks).toEqual([
      { productId: 'p', designId: 'd1' },
      { productId: 'p', designId: 'd2' },
    ]);
    picks = toggleDesign(picks, 'p', DESIGNS, 'd3');
    expect(picks).toEqual([{ productId: 'p', designId: null }]);
    // Unticking one design of a whole product keeps the others.
    picks = toggleDesign(picks, 'p', DESIGNS, 'd2');
    expect([...designsPicked(picks, 'p')]).toEqual(['d1', 'd3']);
    picks = toggleDesign(toggleDesign(picks, 'p', DESIGNS, 'd1'), 'p', DESIGNS, 'd3');
    expect(picks).toEqual([]);
  });

  it('counts products, not designs, and removes one pick', () => {
    const picks = [
      { productId: 'p', designId: 'd1' },
      { productId: 'p', designId: 'd2' },
      { productId: 'q', designId: null },
    ];
    expect(productCount(picks)).toBe(2);
    expect(removePick(picks, { productId: 'p', designId: 'd1' })).toHaveLength(2);
  });
});

describe("an offer's rows", () => {
  const item = (productId: string, designId: string | null): OfferItem => ({
    productId,
    designId,
    name: productId,
    designName: designId,
    designNumber: null,
    designCount: 3,
    image: null,
    active: true,
    stockState: 'in',
    price: null,
    was: null,
    offer: null,
    belowOne: false,
    heldBy: null,
  });

  it("puts a product's picked designs in one row, a whole product in its own", () => {
    const rows = rowsOf([item('p', 'd1'), item('p', 'd2'), item('q', null), item('r', 'd1')]);
    expect(rows.map((row) => row.items.length)).toEqual([2, 1, 1]);
  });
});
