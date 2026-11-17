import { describe, expect, it } from 'vitest';
import {
  ORDER_CONFIRMED_BY_PAYMENT_NOTE,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  Permission,
  StockUnit,
  VerificationLevel,
} from '@lytronix/validators';
import type { OrderItem, OrderPayment } from '../src/types/orders';
import {
  advancePaid,
  autoConfirmed,
  autoVerified,
  confirmedByPayment,
  picturesOf,
  quantityOf,
} from '../src/views/orders/order-auto';
import { refundable, voidable } from '../src/views/orders/order-choices';

// The fixes PR (the owner's, 2026-11-14): an order its verified advance payment confirmed, a payment verified with no
// one's hand on it (never voided), an item's quantity in its unit, and the pictures the lightbox steps through.

const entry = (field: OrderHistoryField, note: string | null) => ({
  field,
  from: null,
  to: null,
  note,
  by: null,
  at: '2026-10-31T05:43:00.000Z',
});

function payment(given: Partial<OrderPayment> = {}): OrderPayment {
  return {
    id: 'pay',
    method: PaymentMethod.Bkash,
    amount: '500.00',
    senderNumber: '01819876543',
    transactionId: '9F2KQ7M1',
    verifiedBy: null,
    verifiedAt: '2026-10-31T05:44:00.000Z',
    voided: null,
    refunded: null,
    verificationLevel: VerificationLevel.Manual,
    ...given,
  };
}

const item = (given: Partial<OrderItem>): OrderItem =>
  ({
    id: 'line',
    quantity: '2.000',
    stockUnit: StockUnit.Piece,
    packAmount: null,
    thumbnail: null,
    ...given,
  }) as OrderItem;

const all = (): boolean => true;

describe('an order its verified advance payment confirmed', () => {
  it('is known by the note the server writes on its Confirmed entry', () => {
    expect(
      confirmedByPayment(entry(OrderHistoryField.Confirmed, ORDER_CONFIRMED_BY_PAYMENT_NOTE)),
    ).toBe(true);
    // A call's own note, or none, is someone's confirmation.
    expect(confirmedByPayment(entry(OrderHistoryField.Confirmed, null))).toBe(false);
    expect(confirmedByPayment(entry(OrderHistoryField.Confirmed, 'wants it by Friday'))).toBe(
      false,
    );
    // The note alone, on another kind of entry, means nothing.
    expect(
      confirmedByPayment(entry(OrderHistoryField.Created, ORDER_CONFIRMED_BY_PAYMENT_NOTE)),
    ).toBe(false);
  });

  it('needs no call when any of its history says so', () => {
    expect(
      autoConfirmed({
        history: [
          entry(OrderHistoryField.Created, null),
          entry(OrderHistoryField.Confirmed, ORDER_CONFIRMED_BY_PAYMENT_NOTE),
        ],
      }),
    ).toBe(true);
    expect(autoConfirmed({ history: [entry(OrderHistoryField.Confirmed, null)] })).toBe(false);
    expect(autoConfirmed({ history: [] })).toBe(false);
  });

  it('is tagged in the Confirmed list while money is verified on it', () => {
    const order = (status: OrderStatus, paymentStatus: OrderPaymentStatus) => ({
      status,
      paymentStatus,
    });
    expect(advancePaid(order(OrderStatus.Confirmed, OrderPaymentStatus.PartiallyPaid))).toBe(true);
    expect(advancePaid(order(OrderStatus.Confirmed, OrderPaymentStatus.Paid))).toBe(true);
    // Confirmed on a call, nothing paid yet.
    expect(advancePaid(order(OrderStatus.Confirmed, OrderPaymentStatus.Unverified))).toBe(false);
    // Paid, but past Confirmed: its own status says where it is.
    expect(advancePaid(order(OrderStatus.Shipped, OrderPaymentStatus.Paid))).toBe(false);
    expect(advancePaid(order(OrderStatus.Pending, OrderPaymentStatus.PartiallyPaid))).toBe(false);
  });
});

describe('a payment verified automatically', () => {
  it('is the gateway’s or the listener’s, never staff’s', () => {
    expect(autoVerified(payment({ verificationLevel: VerificationLevel.Listener }))).toBe(true);
    expect(autoVerified(payment({ verificationLevel: VerificationLevel.Gateway }))).toBe(true);
    expect(autoVerified(payment({ verificationLevel: VerificationLevel.Manual }))).toBe(false);
  });

  it('can be refunded but not voided; a staff-verified one can be both', () => {
    for (const level of [VerificationLevel.Listener, VerificationLevel.Gateway]) {
      const auto = payment({ verificationLevel: level });
      expect(voidable(auto, all)).toBe(false);
      expect(refundable(auto, all)).toBe(true);
    }
    expect(voidable(payment(), all)).toBe(true);
    expect(refundable(payment(), all)).toBe(true);
  });

  it('leaves the other rules of Void as they were', () => {
    const none = (permission: Permission): boolean => permission !== Permission.PaymentsManage;
    expect(voidable(payment(), none)).toBe(false);
    expect(voidable(payment({ method: PaymentMethod.CashOnDelivery }), all)).toBe(false);
    expect(
      voidable(payment({ voided: { by: null, at: '2026-10-31T06:00:00.000Z', reason: 'x' } }), all),
    ).toBe(false);
    expect(
      voidable(payment({ refunded: { by: null, at: '2026-10-31T06:00:00.000Z', note: 'x' } }), all),
    ).toBe(false);
  });
});

describe('an item’s quantity in its unit', () => {
  it('is whole pieces, or a measure as typed', () => {
    expect(quantityOf(item({ quantity: '2.000', stockUnit: StockUnit.Piece }))).toEqual({
      amount: '2',
      unit: StockUnit.Piece,
    });
    expect(quantityOf(item({ quantity: '1.500', stockUnit: StockUnit.Kg }))).toEqual({
      amount: '1.5',
      unit: StockUnit.Kg,
    });
  });

  it('counts packs of a shared stock in pieces, whatever the stock is kept in', () => {
    expect(
      quantityOf(item({ quantity: '3.000', stockUnit: StockUnit.Kg, packAmount: '5.000' })),
    ).toEqual({ amount: '3', unit: StockUnit.Piece });
  });
});

describe('the pictures an order’s lightbox steps through', () => {
  it('are the large ones, in item order, an item without a picture left out', () => {
    const items = [
      item({ id: 'a', thumbnail: { mediaId: 'm1', url: 'a-small', largeUrl: 'a-large' } }),
      item({ id: 'b', thumbnail: null }),
      item({ id: 'c', thumbnail: { mediaId: 'm2', url: 'c-small', largeUrl: 'c-large' } }),
    ];
    expect(picturesOf(items)).toEqual([
      { itemId: 'a', url: 'a-large' },
      { itemId: 'c', url: 'c-large' },
    ]);
  });

  it('fall back to the small picture from a server that sends no large one', () => {
    expect(picturesOf([item({ id: 'a', thumbnail: { mediaId: 'm1', url: 'a-small' } })])).toEqual([
      { itemId: 'a', url: 'a-small' },
    ]);
  });
});
