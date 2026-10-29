import { describe, expect, it } from 'vitest';
import {
  bdMobileNumber,
  createOrderSchema,
  FulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
  StatusOverride,
  visibleOrderStatus,
} from '../src';

// ORD-41: the one lookup, over every combination of the two axes, the confirming call and the overrides; MNU-04's
// rules for each order type; and the phone form orders keep.
describe('the status an order shows (ORD-41)', () => {
  const expected = (
    payment: OrderPaymentStatus,
    fulfillment: FulfillmentStatus,
    confirmed: boolean,
  ): OrderStatus => {
    if (fulfillment === FulfillmentStatus.Returned) return OrderStatus.Returned;
    if (payment === OrderPaymentStatus.Refunded) return OrderStatus.Refunded;
    if (payment === OrderPaymentStatus.PaymentFailed) return OrderStatus.Rejected;
    if (fulfillment === FulfillmentStatus.Delivered) return OrderStatus.Delivered;
    if (
      fulfillment === FulfillmentStatus.PartiallyDelivered ||
      fulfillment === FulfillmentStatus.PartiallyShipped
    ) {
      return OrderStatus.PartialDelivered;
    }
    if (fulfillment === FulfillmentStatus.Shipped) return OrderStatus.Shipped;
    if (fulfillment === FulfillmentStatus.Processing) return OrderStatus.Processing;
    if (payment === OrderPaymentStatus.PendingVerification) return OrderStatus.Unverified;
    return confirmed ? OrderStatus.Confirmed : OrderStatus.Pending;
  };

  it('gives every combination one status, an override always showing instead', () => {
    let combinations = 0;
    for (const paymentStatus of Object.values(OrderPaymentStatus)) {
      for (const fulfillmentStatus of Object.values(FulfillmentStatus)) {
        for (const confirmed of [false, true]) {
          expect(
            visibleOrderStatus({ paymentStatus, fulfillmentStatus, confirmed, override: null }),
            `${paymentStatus}/${fulfillmentStatus}/${String(confirmed)}`,
          ).toBe(expected(paymentStatus, fulfillmentStatus, confirmed));
          for (const override of Object.values(StatusOverride)) {
            expect(
              visibleOrderStatus({ paymentStatus, fulfillmentStatus, confirmed, override }),
            ).toBe(override);
          }
          combinations += 1;
        }
      }
    }
    expect(combinations).toBe(84);
  });

  it("follows ORD-41's examples", () => {
    expect(
      visibleOrderStatus({
        paymentStatus: OrderPaymentStatus.PartiallyPaid,
        fulfillmentStatus: FulfillmentStatus.PartiallyShipped,
        confirmed: true,
        override: null,
      }),
    ).toBe(OrderStatus.PartialDelivered);
    expect(
      visibleOrderStatus({
        paymentStatus: OrderPaymentStatus.Unverified,
        fulfillmentStatus: FulfillmentStatus.Unfulfilled,
        confirmed: true,
        override: null,
      }),
    ).toBe(OrderStatus.Confirmed);
  });
});

describe('what each order type needs (MNU-04, amended 2026-10-29)', () => {
  const item = { variantId: '7b0d2f62-8f0e-4d55-9a8e-3c2a7a0c9e11', quantity: 1 };
  const fieldsOf = (value: unknown): string[] => {
    const result = createOrderSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  it('needs a delivery to have its customer, thana and address', () => {
    expect(fieldsOf({ items: [item] }).sort()).toEqual([
      'customerName',
      'deliveryAddress',
      'locationId',
      'phone',
    ]);
  });

  it('needs a takeaway to have its customer and no address, and a dine-in only its table', () => {
    expect(
      fieldsOf({
        fulfilmentType: 'takeaway',
        customerName: 'A',
        phone: '01711000000',
        items: [item],
      }),
    ).toEqual([]);
    expect(
      fieldsOf({
        fulfilmentType: 'takeaway',
        customerName: 'A',
        phone: '01711000000',
        locationId: 5,
        items: [item],
      }),
    ).toEqual(['locationId']);
    expect(fieldsOf({ fulfilmentType: 'dine_in', tableRef: 'T4', items: [item] })).toEqual([]);
    expect(fieldsOf({ fulfilmentType: 'dine_in', items: [item] })).toEqual(['tableRef']);
  });
});

describe('a Bangladeshi mobile number (AUTH-02, ORD-01)', () => {
  it('keeps the local form, and refuses anything else', () => {
    expect(bdMobileNumber('+880 1711-000000')).toBe('01711000000');
    expect(bdMobileNumber('8801711000000')).toBe('01711000000');
    expect(bdMobileNumber('01211000000')).toBeNull();
  });
});
