import { StockUnit } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import { countedUnits, quantityRule, stepped, typedQuantity } from '../src/lib/product/quantity';

describe('how much of a product can be ordered (LND-07, UOM-04)', () => {
  it('a kg or a litre moves by half, g and ml by the hundred, and the rest is whole', () => {
    expect(quantityRule(StockUnit.Kg)).toMatchObject({ measured: true, step: 0.5, first: 1 });
    expect(quantityRule(StockUnit.Liter)).toMatchObject({ measured: true, step: 0.5, first: 1 });
    expect(quantityRule(StockUnit.G)).toMatchObject({ measured: true, step: 100, first: 100 });
    expect(quantityRule(StockUnit.Ml)).toMatchObject({ measured: true, step: 100, first: 100 });
    for (const unit of [
      StockUnit.Piece,
      StockUnit.Dozen,
      StockUnit.Pack,
      StockUnit.Box,
      undefined,
    ]) {
      expect(quantityRule(unit)).toMatchObject({ measured: false, step: 1, first: 1 });
    }
  });

  it("a shared stock's packs are whole, whatever their unit (INV-24)", () => {
    expect(quantityRule(StockUnit.Ml, true).measured).toBe(false);
  });

  it('keeps a step to three decimals, and never reaches nothing or past the limit', () => {
    const kg = quantityRule(StockUnit.Kg);
    expect(stepped(0.1, 0.2, kg)).toBe(0.3);
    expect(stepped(0.5, -0.5, kg)).toBe(0.5);
    expect(stepped(0.25, -0.5, kg)).toBe(0.25);
    expect(stepped(99, 0.5, kg)).toBe(99);
  });

  it('takes a typed amount only when it is one', () => {
    const kg = quantityRule(StockUnit.Kg);
    expect(typedQuantity('0.5', kg)).toBe(0.5);
    expect(typedQuantity(' 1.125 ', kg)).toBe(1.125);
    for (const wrong of ['', '0', '-1', '1.2345', 'abc', '100']) {
      expect(typedQuantity(wrong, kg), wrong).toBeNull();
    }
  });

  it('counts a measured line as one thing in the bag', () => {
    expect(countedUnits(StockUnit.Kg, 1.5)).toBe(1);
    expect(countedUnits(StockUnit.Piece, 3)).toBe(3);
    expect(countedUnits(undefined, 3)).toBe(3);
  });
});
