import { describe, expect, it } from 'vitest';
import {
  DeliveryMode,
  PaymentPolicy,
  SerialFormat,
  StockTracking,
  StockUnit,
} from '@lytronix/validators';
import {
  applyDefaults,
  chartBody,
  chartOf,
  changedSettings,
  settingsBody,
  settingsFrom,
  settingsOf,
  type TypeSetting,
} from '../src/lib/product-settings';
import type { ProductDefaults } from '../src/types/attribute';
import type { ProductDetail } from '../src/types/product';

const CLOTHING: ProductDefaults = {
  businessType: 'clothing',
  presetKey: 'clothing',
  fromCategoryId: null,
  stockUnit: StockUnit.Piece,
  stockTracking: StockTracking.Tracked,
  batchTracked: false,
  serialTracked: false,
  serialFormat: SerialFormat.Any,
  lowStockThreshold: '5.000',
  suggestedAttributeIds: [],
  suggestedCategories: [],
  upFrontFields: [],
  shopPaymentPolicy: { defaultPaymentPolicy: PaymentPolicy.None, defaultAdvanceAmount: null },
};
const PHONES: ProductDefaults = {
  ...CLOTHING,
  presetKey: 'electronics',
  fromCategoryId: 'c-phones',
  serialTracked: true,
  serialFormat: SerialFormat.Imei,
  lowStockThreshold: '2.000',
};
/** A saved product's settings as GET /products/:id answers them. */
const SAVED_PRODUCT = {
  stockTracking: StockTracking.Tracked,
  stockUnit: StockUnit.Piece,
  lowStockThreshold: '5.000',
  batchTracked: false,
  serialTracked: false,
  serialFormat: SerialFormat.Any,
  condition: 'new',
  weightKg: null,
  deliveryCharge: null,
  deliveryMode: DeliveryMode.Default,
  paymentPolicy: null,
  advanceAmount: null,
};

describe('the type defaults a new product takes (PST-02, PST-06)', () => {
  it('starts from its type, the stored threshold as typed', () => {
    const settings = settingsFrom(CLOTHING);
    expect(settings.lowStockThreshold).toBe('5');
    expect(settings.paymentPolicy).toBeNull();
  });

  it("takes another type's settings and says which moved", () => {
    const { settings, moved } = applyDefaults(settingsFrom(CLOTHING), PHONES, new Set());
    expect(settings.serialTracked).toBe(true);
    expect(settings.serialFormat).toBe(SerialFormat.Imei);
    expect(moved).toEqual(['lowStockThreshold', 'serialTracked', 'serialFormat']);
  });

  it('never overwrites what was changed by hand', () => {
    const typed = { ...settingsFrom(CLOTHING), lowStockThreshold: '9' };
    const touched = new Set<TypeSetting>(['lowStockThreshold']);
    const { settings, moved } = applyDefaults(typed, PHONES, touched);
    expect(settings.lowStockThreshold).toBe('9');
    expect(moved).not.toContain('lowStockThreshold');
  });
});

describe('the settings as the server takes them', () => {
  it('a product saved with no weight adjusts by one typed later; one turned off stays off (PRD-16)', () => {
    const saved = (weightKg: string | null, deliveryMode: DeliveryMode) =>
      settingsOf({ ...SAVED_PRODUCT, weightKg, deliveryMode } as unknown as ProductDetail);
    expect(saved(null, DeliveryMode.Default).adjustByWeight).toBe(true);
    expect(saved('0.400', DeliveryMode.Default).adjustByWeight).toBe(false);
    expect(saved('0.400', DeliveryMode.Adjustable).adjustByWeight).toBe(true);
  });

  it('a charge grows with a weight only when there is one (PRD-16)', () => {
    const settings = settingsFrom(CLOTHING);
    expect(settingsBody(settings).deliveryMode).toBe(DeliveryMode.Default);
    expect(settingsBody({ ...settings, weightKg: '0.4' })).toMatchObject({
      weightKg: 0.4,
      deliveryMode: DeliveryMode.Adjustable,
    });
    expect(settingsBody({ ...settings, weightKg: '0.4', adjustByWeight: false }).deliveryMode).toBe(
      DeliveryMode.Default,
    );
  });

  it('made to order holds no batches or serials (INV-02)', () => {
    const settings = {
      ...settingsFrom(PHONES),
      stockTracking: StockTracking.NotTracked,
    };
    expect(settingsBody(settings)).toMatchObject({ batchTracked: false, serialTracked: false });
  });

  it('an advance is only a partial advance’s (PRD-08)', () => {
    const settings = {
      ...settingsFrom(CLOTHING),
      paymentPolicy: PaymentPolicy.FullPrepayment,
      advanceAmount: '200',
    };
    expect(settingsBody(settings).advanceAmount).toBeNull();
  });

  it('sends only what changed, a policy with its amount', () => {
    const saved = settingsFrom(CLOTHING);
    expect(changedSettings(saved, saved)).toEqual({});
    expect(changedSettings(saved, { ...saved, lowStockThreshold: '3' })).toEqual({
      lowStockThreshold: 3,
    });
    expect(
      changedSettings(saved, {
        ...saved,
        paymentPolicy: PaymentPolicy.PartialAdvance,
        advanceAmount: '200',
      }),
    ).toEqual({ paymentPolicy: PaymentPolicy.PartialAdvance, advanceAmount: 200 });
    // Only the amount changed: the policy goes with it.
    const partial = { ...saved, paymentPolicy: PaymentPolicy.PartialAdvance, advanceAmount: '200' };
    expect(changedSettings(partial, { ...partial, advanceAmount: '300' })).toEqual({
      paymentPolicy: PaymentPolicy.PartialAdvance,
      advanceAmount: 300,
    });
  });
});

describe('the size chart (PRD-17)', () => {
  it("follows the category's when it has none of its own", () => {
    const chart = chartOf({
      source: 'category',
      categoryId: 'c-tshirts',
      rows: [['Size', 'Chest']],
      image: null,
    });
    expect(chart.own).toBe(false);
    expect(chartBody(chart)).toBeNull();
  });

  it('sends its own table trimmed, or its picture', () => {
    const table = chartOf({
      source: 'product',
      categoryId: null,
      rows: [[' Size ', 'Chest ']],
      image: null,
    });
    expect(chartBody(table)).toEqual({ rows: [['Size', 'Chest']] });
    expect(
      chartBody({
        ...table,
        mode: 'picture',
        image: { id: 'm-9', urls: { main: '/m-9.webp', thumbnail: '/m-9-t.webp' } },
      }),
    ).toEqual({ imageId: 'm-9' });
  });
});
