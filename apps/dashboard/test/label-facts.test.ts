import { describe, expect, it } from 'vitest';
import { CourierKey, ParcelState } from '@lytronix/validators';
import type { OrderParcel } from '../src/types/couriers';
import type { Order, OrderItem } from '../src/types/orders';
import { formatPrintedAt } from '../src/lib/dates';
import { labelCode, labelCourier, labelId, labelWeightKg } from '../src/views/orders/label-facts';

// The courier label laid out as Steadfast's (TENANT-DASHBOARD-DESIGN §7.47, 2026-11-18): the barcode and QR hold the
// courier's consignment ID once booked through Lytro, the order number otherwise.

type LabelOrder = Pick<Order, 'orderNumber' | 'courierName' | 'trackingCode' | 'parcel' | 'items'>;

function parcel(given: Partial<OrderParcel> = {}): OrderParcel {
  return {
    courierKey: CourierKey.Steadfast,
    state: ParcelState.Booked,
    invoice: '261113-0001',
    consignmentId: '320306388',
    trackingCode: '15BAEB8A',
    weightKg: null,
    ...given,
  } as OrderParcel;
}

function item(weightKg: string | null, quantity: string): OrderItem {
  return { weightKg, quantity } as OrderItem;
}

function order(given: Partial<LabelOrder> = {}): LabelOrder {
  return {
    orderNumber: '261113-0001',
    courierName: null,
    trackingCode: null,
    parcel: null,
    items: [item('0.400', '2.000')],
    ...given,
  };
}

describe('labelCode', () => {
  it('is the consignment ID of a parcel booked through Lytro', () => {
    expect(labelCode(order({ parcel: parcel() }))).toBe('320306388');
    expect(labelCode(order({ parcel: parcel({ state: ParcelState.Unknown }) }))).toBe('320306388');
  });

  it('is the order number before a booking, after one ends, or by hand', () => {
    expect(labelCode(order())).toBe('261113-0001');
    expect(labelCode(order({ parcel: parcel({ state: ParcelState.Cancelled }) }))).toBe(
      '261113-0001',
    );
    expect(labelCode(order({ parcel: parcel({ state: ParcelState.Refused }) }))).toBe(
      '261113-0001',
    );
    expect(
      labelCode(order({ parcel: parcel({ state: ParcelState.Booking, consignmentId: null }) })),
    ).toBe('261113-0001');
    expect(labelCode(order({ courierName: 'Steadfast', trackingCode: 'SF-2610-4471' }))).toBe(
      '261113-0001',
    );
  });
});

describe('labelId and labelCourier', () => {
  it("name a booked parcel's consignment ID and courier", () => {
    const booked = order({ parcel: parcel(), courierName: 'Steadfast', trackingCode: '15BAEB8A' });
    expect(labelId(booked)).toBe('320306388');
    expect(labelCourier(booked)).toBe('Steadfast');
    expect(labelCourier(order({ parcel: parcel({ courierKey: CourierKey.Pathao }) }))).toBe(
      'Pathao',
    );
  });

  it('name what was typed for a parcel sent by hand, and nothing before shipping', () => {
    const byHand = order({ courierName: 'Sundarban', trackingCode: 'SB-77' });
    expect(labelId(byHand)).toBe('SB-77');
    expect(labelCourier(byHand)).toBe('Sundarban');
    expect(labelId(order())).toBeNull();
    expect(labelCourier(order())).toBeNull();
  });
});

describe('labelWeightKg', () => {
  it("is the weight sent with the booking, else the items' weights, else nothing", () => {
    expect(labelWeightKg(order({ parcel: parcel({ weightKg: '1.250' }) }))).toBe(1.25);
    expect(labelWeightKg(order({ parcel: parcel() }))).toBe(0.8);
    expect(labelWeightKg(order({ items: [item('0.750', '2.000'), item(null, '1.000')] }))).toBe(
      1.5,
    );
    expect(labelWeightKg(order({ items: [item(null, '1.000')] }))).toBeNull();
  });
});

describe('formatPrintedAt', () => {
  it("writes the label's print time as Steadfast does, in Dhaka", () => {
    // 11:18 UTC is 17:18 in Dhaka (UTC+6).
    expect(formatPrintedAt('2026-11-18T11:18:00Z')).toBe('18/11/26 05:18pm');
    expect(formatPrintedAt('2026-11-18T18:05:00Z')).toBe('19/11/26 12:05am');
    expect(formatPrintedAt('2026-11-19T06:30:00Z')).toBe('19/11/26 12:30pm');
  });
});
