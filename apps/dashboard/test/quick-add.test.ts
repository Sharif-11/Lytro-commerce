import { describe, expect, it } from 'vitest';
import { AttributeDataType, StockTracking } from '@lytronix/validators';
import { NEW_PRODUCT, type ProductForm } from '../src/lib/product-form';
import {
  gridOf,
  quickBody,
  quickStockMode,
  quickStockProblems,
  sharedWhat,
  sizePreset,
  withRowStock,
} from '../src/lib/quick-add';
import { reconcile, type SplitAttribute } from '../src/lib/variant-matrix';

// Quick add's stock rules (TENANT-DASHBOARD-DESIGN §7.4b): one shared box by default, the split a tap away, no silent 0.
const DESIGN = 'design-attribute';

const split = (attributeId: string, values: string[]): SplitAttribute => ({
  attributeId,
  name: attributeId,
  dataType: AttributeDataType.EnumSingle,
  unitKind: null,
  options: values.map((value) => ({
    id: `${attributeId}:${value}`,
    value,
    swatchColor: null,
    swatchImage: null,
  })),
});

function formWith(splits: SplitAttribute[], patch: Partial<ProductForm> = {}): ProductForm {
  return { ...NEW_PRODUCT, splits, variants: reconcile(splits, [], []), ...patch };
}

const designs = split(DESIGN, ['D1', 'D2', 'D3']);
const sizes = split('size', ['S', 'M', 'L']);

describe('quick add: the stock box (§7.4b)', () => {
  it('asks one box by default, and none for made to order', () => {
    expect(quickStockMode(formWith([designs, sizes]), false, DESIGN)).toBe('one');
    const made = formWith([designs], {
      settings: { ...NEW_PRODUCT.settings, stockTracking: StockTracking.NotTracked },
    });
    expect(quickStockMode(made, true, DESIGN)).toBe('made');
  });

  it('splits by design under the photos when only designs split it, else in the grid', () => {
    expect(quickStockMode(formWith([designs]), true, DESIGN)).toBe('designs');
    expect(quickStockMode(formWith([designs, sizes]), true, DESIGN)).toBe('grid');
    expect(quickStockMode(formWith([sizes]), true, DESIGN)).toBe('grid');
    // One variant has nothing to split.
    expect(quickStockMode(formWith([split(DESIGN, ['D1'])]), true, DESIGN)).toBe('one');
  });

  it('says what the shared box counts', () => {
    expect(sharedWhat(formWith([designs, sizes]), DESIGN)).toBe('designsSizes');
    expect(sharedWhat(formWith([designs]), DESIGN)).toBe('designs');
    expect(sharedWhat(formWith([sizes]), DESIGN)).toBe('sizes');
    expect(sharedWhat(formWith([]), DESIGN)).toBeNull();
  });

  it('lays the grid out by design rows and size columns', () => {
    const grid = gridOf([designs, sizes], DESIGN);
    expect(grid.rows.map((row) => row.label)).toEqual(['D1', 'D2', 'D3']);
    expect(grid.columns.map((column) => column.label)).toEqual(['S', 'M', 'L']);
  });

  it('never lets an empty box through silently; "০ রেখেই সেভ করুন" does', () => {
    const form = formWith([designs]);
    expect(quickStockProblems(form, 'one', false).empty).toBe(true);
    expect(quickStockProblems(form, 'one', true).empty).toBe(false);
    expect(quickStockProblems({ ...form, sharedOpeningStock: '5' }, 'one', false).empty).toBe(
      false,
    );
    const split = { ...form, variants: withRowStock(form.variants, ['design-attribute:D1'], '4') };
    expect(quickStockProblems(split, 'designs', false).cells).toHaveLength(2);
  });
});

describe('quick add: what the server is sent (§7.4b, INV-24)', () => {
  it("keeps one variant's box as its own stock", () => {
    const body = quickBody({ ...formWith([]), sharedOpeningStock: '10' }, 'one');
    expect(body.sharedStock).toBe(false);
    expect(body.openingStock).toBe('10');
  });

  it('shares the box between several variants, a pack of one each', () => {
    const body = quickBody({ ...formWith([designs, sizes]), sharedOpeningStock: '40' }, 'one');
    expect(body.sharedStock).toBe(true);
    expect(body.sharedOpeningStock).toBe('40');
    expect(new Set(body.variants.map((row) => row.packAmount))).toEqual(new Set(['1']));
  });

  it("sends each split box as its variant's own, and nothing for made to order", () => {
    const form = formWith([designs]);
    const typed = {
      ...form,
      variants: form.variants.map((row) => ({ ...row, openingStock: '3' })),
    };
    const split = quickBody(typed, 'designs');
    expect(split.sharedStock).toBe(false);
    expect(split.variants.map((row) => row.openingStock)).toEqual(['3', '3', '3']);
    const made = quickBody({ ...form, sharedOpeningStock: '9' }, 'made');
    expect([made.sharedStock, made.sharedOpeningStock, made.openingStock]).toEqual([false, '', '']);
  });

  it('gives the size button to clothing and shoes-and-bags shops only', () => {
    expect(sizePreset('clothing')).toBe('clothing');
    expect(sizePreset('shoes_bags')).toBe('shoes');
    expect(sizePreset('cosmetics')).toBeNull();
    expect(sizePreset(null)).toBeNull();
  });
});
