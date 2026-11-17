import { describe, expect, it } from 'vitest';
import {
  AUTO_SKU_LAST_SUFFIX,
  SKU_MAX_LENGTH,
  autoSkuChoices,
  autoSkuDesignPart,
  autoSkuOf,
} from '../src';

// PD-10, ATR-05: the one rule for a SKU nobody typed, which the server fills and the product screen shows greyed.
describe('the automatic SKU (PD-10)', () => {
  it('takes initials from the first three Latin words of the link name, then the values in capitals', () => {
    expect(autoSkuOf('irani-burka', [autoSkuDesignPart(2), '54'])).toBe('IB-D2-54');
    expect(autoSkuOf('polo-jersey', ['S', 'White'])).toBe('PJ-S-WHITE');
    expect(autoSkuOf('cotton-t-shirt-for-men', [])).toBe('CTS');
    expect(autoSkuOf('lamp', [])).toBe('L');
  });

  it('reads a name as it reads its link name', () => {
    expect(autoSkuOf("Men's Polo Jersey", ['XL'])).toBe('MSP-XL');
    expect(autoSkuOf('Cotton T-Shirt', ['S'])).toBe(autoSkuOf('cotton-t-shirt', ['S']));
    expect(autoSkuOf('3 Piece set', [])).toBe('3PS');
  });

  it('gives a name with no Latin word or digit the letter P, and keeps only letters, digits and dots of a value', () => {
    expect(autoSkuOf('ইরানি বোরকা', ['৫৪'])).toBe('P');
    expect(autoSkuOf('ইরানি burka', ['2.5 kg', 'লাল'])).toBe('B-2.5KG');
    expect(autoSkuOf('', ['Navy / Blue'])).toBe('P-NAVYBLUE');
  });

  it('leaves room for its longest suffix inside the SKU limit', () => {
    const long = autoSkuOf('a-b-c', ['x'.repeat(200)]);
    expect(long.length).toBe(SKU_MAX_LENGTH - 3);
    expect(autoSkuChoices(long).every((choice) => choice.length <= SKU_MAX_LENGTH)).toBe(true);
  });

  it('tries the SKU itself, then -2 up to the last suffix', () => {
    expect(autoSkuChoices('IB', 1, 3)).toEqual(['IB', 'IB-2', 'IB-3']);
    expect(autoSkuChoices('IB', 10, 11)).toEqual(['IB-10', 'IB-11']);
    const all = autoSkuChoices('IB');
    expect(all).toHaveLength(AUTO_SKU_LAST_SUFFIX);
    expect(all.at(-1)).toBe(`IB-${String(AUTO_SKU_LAST_SUFFIX)}`);
    expect(new Set(all).size).toBe(all.length);
  });
});
