import { describe, expect, it } from 'vitest';
import { DeliveryMode, FulfilmentType, PaymentPolicy } from '@lytronix/validators';
import { FieldsError } from '../src/common/api-error';
import { newTrackingId, orderNumberOf } from '../src/modules/orders/services/order-numbers';
import { priceOrder, type PricingLine } from '../src/modules/orders/services/order-pricing';

// D4-9: the one pricing rule (ORD-06, ORD-06a, ORD-16, PRD-08, MNU-04, RAT-14), and the order number and tracking ID
// (ORD-04, ORD-05), checked without a database.

function line(overrides: Partial<PricingLine> = {}): PricingLine {
  return {
    unitPrice: '500.00',
    quantity: '1.000',
    itemDiscount: '0.00',
    weightKg: null,
    ownDeliveryCharge: null,
    deliveryMode: DeliveryMode.Default,
    paymentPolicy: PaymentPolicy.None,
    policyAdvance: null,
    taxRate: null,
    ...overrides,
  };
}

function delivered(lines: PricingLine[], extra: { discount?: string; byHand?: string } = {}) {
  return priceOrder({
    fulfilmentType: FulfilmentType.Delivery,
    zoneCharge: '70.00',
    extraChargePerKg: '20.00',
    lines,
    discount: extra.discount ?? '0.00',
    deliveryChargeByHand: extra.byHand ?? null,
  });
}

describe('pricing an order (D4-9)', () => {
  it("prices ORD-06's example: 2 x 500 and 1 x 300, delivery 60, discount 40", () => {
    const price = delivered([line({ quantity: '2.000' }), line({ unitPrice: '300.00' })], {
      discount: '40.00',
      byHand: '60.00',
    });
    expect(price).toMatchObject({
      subtotal: '1300.00',
      deliveryCharge: '60.00',
      grandTotal: '1320.00',
      advanceDue: '0.00',
      codAmount: '1320.00',
    });
  });

  it('charges the zone once for any number of zone lines (ORD-06a)', () => {
    const price = delivered([line(), line({ quantity: '2.000' }), line()]);
    expect(price.zoneCharged).toBe('70.00');
    expect(price.deliveryCharge).toBe('70.00');
  });

  it("charges ORD-06a's examples: Default per unit, Adjustable once, plus the rate past 1 kg", () => {
    const own = { ownDeliveryCharge: '120.00' };
    const byUnit = delivered([line({ ...own, quantity: '3.000' })]);
    expect(byUnit.lines[0]?.deliveryCharge).toBe('360.00');
    expect(byUnit.zoneCharged).toBeNull();
    const light = delivered([
      line({ ...own, quantity: '3.000', weightKg: '0.300', deliveryMode: DeliveryMode.Adjustable }),
    ]);
    expect(light.lines[0]?.deliveryCharge).toBe('120.00');
    const heavy = delivered([
      line({ ...own, quantity: '3.000', weightKg: '0.600', deliveryMode: DeliveryMode.Adjustable }),
    ]);
    expect(heavy.lines[0]?.deliveryCharge).toBe('136.00');
    const both = delivered([
      line({ ...own, quantity: '3.000' }),
      line({ ...own, quantity: '3.000', weightKg: '0.600', deliveryMode: DeliveryMode.Adjustable }),
    ]);
    expect(both.deliveryCharge).toBe('496.00');
  });

  it("adds the rate on an Adjustable zone line's weight over 1 kg to the zone's charge", () => {
    const price = delivered([
      line({ weightKg: '1.500', quantity: '2.000', deliveryMode: DeliveryMode.Adjustable }),
    ]);
    expect(price.lines[0]?.deliveryCharge).toBe('40.00');
    expect(price.deliveryCharge).toBe('110.00');
  });

  it('charges no delivery to a takeaway or a dine-in (MNU-04)', () => {
    for (const fulfilmentType of [FulfilmentType.Takeaway, FulfilmentType.DineIn]) {
      const price = priceOrder({
        fulfilmentType,
        zoneCharge: null,
        extraChargePerKg: '0.00',
        lines: [line({ ownDeliveryCharge: '120.00' })],
        discount: '0.00',
        deliveryChargeByHand: '60.00',
      });
      expect(price).toMatchObject({ deliveryCharge: '0.00', grandTotal: '500.00' });
    }
  });

  it('asks each partial advance up to its line, a prepaid line in full, and delivery once (PRD-08, ORD-16)', () => {
    const partial = delivered([
      line({ paymentPolicy: PaymentPolicy.PartialAdvance, policyAdvance: '300.00' }),
      line({
        unitPrice: '200.00',
        paymentPolicy: PaymentPolicy.PartialAdvance,
        policyAdvance: '300.00',
      }),
    ]);
    expect(partial).toMatchObject({ advanceDue: '500.00', codAmount: '270.00' });
    const deliveryOnly = delivered([
      line({ unitPrice: '1200.00', paymentPolicy: PaymentPolicy.DeliveryChargeOnly }),
      line({ unitPrice: '100.00', paymentPolicy: PaymentPolicy.DeliveryChargeOnly }),
    ]);
    expect(deliveryOnly).toMatchObject({ advanceDue: '70.00', codAmount: '1300.00' });
    const prepaid = delivered([line({ paymentPolicy: PaymentPolicy.FullPrepayment })], {
      discount: '50.00',
    });
    expect(prepaid).toMatchObject({
      grandTotal: '520.00',
      advanceDue: '520.00',
      codAmount: '0.00',
    });
  });

  it('prices a measured quantity to the paisa, less its own discount', () => {
    const price = delivered([
      line({ unitPrice: '90.00', quantity: '2.500', itemDiscount: '5.00' }),
    ]);
    expect(price.lines[0]?.itemTotal).toBe('220.00');
  });

  it('refuses a discount larger than what it comes off, naming its field', () => {
    expect(() => delivered([line({ itemDiscount: '600.00' })])).toThrow(FieldsError);
    try {
      delivered([line()], { discount: '501.00' });
    } catch (error) {
      expect((error as FieldsError).fields).toMatchObject([
        { field: 'discount', problem: 'too_large', max: 500 },
      ]);
    }
  });
});

describe('order numbers and tracking IDs (ORD-04, ORD-05)', () => {
  it('reads the day and its sequence, growing to five digits past 9999', () => {
    expect(orderNumberOf('2026-10-27', 41)).toBe('261027-0041');
    expect(orderNumberOf('2026-01-05', 10_000)).toBe('260105-10000');
  });

  it('draws eight characters without 0, O, 1 or I, with no repeat among 100,000', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 100_000; n += 1) {
      const id = newTrackingId();
      expect(id).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(100_000);
  });
});
