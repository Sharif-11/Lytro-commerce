import { describe, expect, it } from 'vitest';
import { StockUnit } from '@lytronix/validators';
import { quickAdditions, quickTotal } from '../src/lib/quick-stock';

// The fixes PR (the owner's, 2026-11-14), item 7: a saved product's quick Add stock boxes.

describe('the quick Add stock boxes', () => {
  it('add each number above 0, and nothing for an empty box or 0', () => {
    const read = quickAdditions({ s: '5', m: ' 10 ', l: '', xl: '7', xxl: '0' }, StockUnit.Piece);
    expect(read.additions).toEqual([
      { variantId: 's', quantity: 5 },
      { variantId: 'm', quantity: 10 },
      { variantId: 'xl', quantity: 7 },
    ]);
    expect(read.problems).toEqual({});
    expect(quickTotal(read.additions)).toBe(22);
  });

  it('refuse a number below 0, and what is not a number', () => {
    const read = quickAdditions({ s: '-2', m: 'ten', l: '3' }, StockUnit.Piece);
    expect(read.problems).toEqual({ s: 'negative', m: 'negative' });
    expect(read.additions).toEqual([{ variantId: 'l', quantity: 3 }]);
  });

  it('refuse half a piece, a pack, a dozen or a box', () => {
    for (const unit of [StockUnit.Piece, StockUnit.Pack, StockUnit.Dozen, StockUnit.Box]) {
      expect(quickAdditions({ l: '8.5' }, unit).problems).toEqual({ l: 'whole' });
    }
  });

  it('take a part of a kg, a gram, a litre or a ml', () => {
    for (const unit of [StockUnit.Kg, StockUnit.G, StockUnit.Liter, StockUnit.Ml]) {
      const read = quickAdditions({ loose: '2.5' }, unit);
      expect(read.problems).toEqual({});
      expect(read.additions).toEqual([{ variantId: 'loose', quantity: 2.5 }]);
    }
  });
});
