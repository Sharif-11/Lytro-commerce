import { describe, expect, it } from 'vitest';
import { AttributeDataType, AttributeRole, StockTracking } from '@lytronix/validators';
import { settingsBody } from '../src/lib/product-settings';
import {
  blankRow,
  type Description,
  type SplitAttribute,
  type VariantRow,
} from '../src/lib/variant-matrix';
import type { ProductDetail } from '../src/types/product';
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
  ...NEW_PRODUCT,
  name: 'Cotton T-shirt',
  price: '450',
  description: '100% cotton.',
  categoryIds: ['c-tshirts'],
  primaryCategoryId: 'c-tshirts',
  active: true,
  imageIds: ['m-1', 'm-2'],
  videoId: null,
};

const SIZE: SplitAttribute = {
  attributeId: 'a-size',
  name: 'Size',
  dataType: AttributeDataType.EnumSingle,
  unitKind: null,
  options: [
    { id: 'o-1lb', value: '1 lb', swatchColor: null, swatchImage: null },
    { id: 'o-2lb', value: '2 lb', swatchColor: null, swatchImage: null },
  ],
};
const ROW: VariantRow = blankRow([]);
/** A blank row as a save sends it: nothing of its own beyond its options. */
const SENT = {
  sku: null,
  barcode: null,
  weightKg: null,
  deliveryCharge: null,
  deliveryMode: null,
  active: true,
};
const MESSAGE: Description = {
  attributeId: 'a-msg',
  name: 'Message on the cake',
  dataType: AttributeDataType.Text,
  unitKind: null,
  role: AttributeRole.CapturedAtOrder,
  optionIds: [],
  optionValues: [],
  text: '',
  number: '',
  bool: null,
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
      ...settingsBody(NEW_PRODUCT.settings),
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

  it('a new product takes its zones, chart and one variant in its one request (Slice 11.7c)', () => {
    const typed: ProductForm = {
      ...NEW_PRODUCT,
      name: 'Pather Panchali',
      price: '320',
      deliveryZoneIds: ['z-in'],
      chart: { own: true, mode: 'table', rows: [['', 'Chest']], image: null },
      single: { sku: ' PP-0320 ', barcode: '' },
      openingStock: '12',
    };
    expect(createBody(typed)).toMatchObject({
      deliveryZoneIds: ['z-in'],
      sizeChart: { rows: [['', 'Chest']] },
      variantAttributes: [],
      variants: [{ optionIds: [], sku: 'PP-0320', barcode: null, openingStock: 12 }],
    });
    // Made to order, nothing opens on a shelf.
    const made = {
      ...typed,
      settings: { ...typed.settings, stockTracking: StockTracking.NotTracked },
    };
    expect(createBody(made)).toMatchObject({
      variants: [{ optionIds: [], sku: 'PP-0320', barcode: null }],
    });
    expect(JSON.stringify(createBody(made))).not.toContain('openingStock');
  });

  it('saves where it delivers and its chart as two more parts; a chart dropped is taken off', () => {
    const own = { own: true, mode: 'table' as const, rows: [['', 'Chest']], image: null };
    expect(changedParts(SAVED, { ...SAVED, deliveryZoneIds: ['z-in'], chart: own })).toEqual([
      { part: 'zones', body: { zoneIds: ['z-in'] } },
      { part: 'chart', body: { rows: [['', 'Chest']] } },
    ]);
    expect(changedParts({ ...SAVED, chart: own }, SAVED)).toEqual([{ part: 'chart', body: null }]);
    expect(
      changedParts(SAVED, {
        ...SAVED,
        settings: { ...SAVED.settings, weightKg: '0.4', lowStockThreshold: '3' },
      }),
    ).toEqual([
      { part: 'fields', body: { lowStockThreshold: 3, weightKg: 0.4, deliveryMode: 'adjustable' } },
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
  it('makes a new product with its options, variants and descriptions in the same request (ATR-11)', () => {
    const typed: ProductForm = {
      ...NEW_PRODUCT,
      name: 'Cake',
      price: '850',
      splits: [SIZE],
      variants: [
        { ...ROW, optionIds: ['o-1lb'], price: '850', openingStock: '' },
        { ...ROW, optionIds: ['o-2lb'], price: '1600', sku: ' CK-2 ', openingStock: '3' },
      ],
      descriptions: [MESSAGE],
    };
    expect(createBody(typed)).toMatchObject({
      variantAttributes: [{ attributeId: 'a-size', optionIds: ['o-1lb', 'o-2lb'] }],
      variants: [
        { optionIds: ['o-1lb'], price: 850, sku: null },
        { optionIds: ['o-2lb'], price: 1600, sku: 'CK-2', openingStock: 3 },
      ],
      attributes: [{ attributeId: 'a-msg', role: AttributeRole.CapturedAtOrder }],
    });
    // A product made to order has no stock on the shelf to open with (INV-02).
    const madeToOrder = {
      ...typed,
      settings: { ...typed.settings, stockTracking: StockTracking.NotTracked },
    };
    expect((createBody(madeToOrder) as { variants: object[] }).variants[1]).not.toHaveProperty(
      'openingStock',
    );
    // INV-24: sharing, each variant says how much it uses and the stock opens in the product's unit.
    expect(
      createBody({
        ...typed,
        sharedStock: true,
        sharedOpeningStock: '240',
        variants: typed.variants.map((row) => ({ ...row, packAmount: '5' })),
      }),
    ).toMatchObject({
      sharedStock: true,
      sharedOpeningStock: 240,
      variants: [{ packAmount: 5 }, { packAmount: 5 }],
    });
  });

  it('saves changed options and descriptions as two more parts, the variants first (Slice 11.7b)', () => {
    const saved: ProductForm = {
      ...SAVED,
      splits: [SIZE],
      variants: [
        { ...ROW, optionIds: ['o-1lb'], id: 'v-1' },
        { ...ROW, optionIds: ['o-2lb'], id: 'v-2' },
      ],
    };
    expect(changedParts(saved, saved)).toEqual([]);
    const typed: ProductForm = {
      ...saved,
      variants: [
        saved.variants[0] ?? ROW,
        { ...ROW, optionIds: ['o-2lb'], id: 'v-2', price: '1650' },
      ],
      descriptions: [MESSAGE],
    };
    expect(changedParts(saved, typed)).toEqual([
      {
        part: 'variants',
        body: {
          variantAttributes: [{ attributeId: 'a-size', optionIds: ['o-1lb', 'o-2lb'] }],
          variants: [
            { ...SENT, optionIds: ['o-1lb'], price: null },
            { ...SENT, optionIds: ['o-2lb'], price: 1650 },
          ],
        },
      },
      {
        part: 'attributes',
        body: { attributes: [{ attributeId: 'a-msg', role: AttributeRole.CapturedAtOrder }] },
      },
    ]);
    // Taking every splitting attribute away leaves the one default variant.
    expect(changedParts(saved, { ...saved, splits: [], variants: [] })).toEqual([
      {
        part: 'variants',
        body: { variantAttributes: [], variants: [{ optionIds: [], sku: null, barcode: null }] },
      },
    ]);
  });

  it('gives the variants a save made their ids', () => {
    const typed: ProductForm = {
      ...SAVED,
      splits: [SIZE],
      variants: [{ ...ROW, optionIds: ['o-1lb'] }],
    };
    const product = { variants: [{ id: 'v-9', optionIds: ['o-1lb'] }] } as unknown as ProductDetail;
    expect(withSaved(SAVED, typed, ['variants'], product).variants).toEqual([
      { ...ROW, optionIds: ['o-1lb'], id: 'v-9' },
    ]);
  });
});
