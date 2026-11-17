import {
  ORDER_CONFIRMED_BY_PAYMENT_NOTE,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderStatus,
  StockUnit,
  VerificationLevel,
} from '@lytronix/validators';
import type { Order, OrderHistory, OrderItem, OrderPayment, OrderSummary } from '@/types/orders';

// The fixes PR (the owner's, 2026-11-14): what the order page and list read from an order that confirmed itself, a
// payment verified automatically, and an item's quantity in its unit. Plain functions, so the tests read them too.

/** A history entry the server wrote when a verified advance payment confirmed the order, with no call (item 2). */
export const confirmedByPayment = (entry: Pick<OrderHistory, 'field' | 'note'>): boolean =>
  entry.field === OrderHistoryField.Confirmed && entry.note === ORDER_CONFIRMED_BY_PAYMENT_NOTE;

/** An order its verified advance payment confirmed: no confirm call is needed. */
export const autoConfirmed = (order: Pick<Order, 'history'>): boolean =>
  order.history.some(confirmedByPayment);

/**
 * A payment verified with no one's hand on it -- the shopper's gateway checkout, or the listener matching its SMS (item
 * 4). It can be refunded, never voided. A payment from a server that doesn't say how counts as staff's.
 */
export const autoVerified = (payment: Pick<OrderPayment, 'verificationLevel'>): boolean =>
  payment.verificationLevel === VerificationLevel.Listener ||
  payment.verificationLevel === VerificationLevel.Gateway;

/** A confirmed order with money already verified on it: the list says so beside its items (item 2). */
export const advancePaid = (order: Pick<OrderSummary, 'status' | 'paymentStatus'>): boolean =>
  order.status === OrderStatus.Confirmed &&
  (order.paymentStatus === OrderPaymentStatus.Paid ||
    order.paymentStatus === OrderPaymentStatus.PartiallyPaid);

/**
 * How many of an item, in its unit (item 3): "2" pieces, "1.5" kg. A pack of a shared stock counts in pieces, its size
 * named by its variant.
 */
export function quantityOf(item: Pick<OrderItem, 'quantity' | 'stockUnit' | 'packAmount'>): {
  amount: string;
  unit: StockUnit;
} {
  return {
    amount: String(Number(item.quantity)),
    unit: item.packAmount !== null ? StockUnit.Piece : item.stockUnit,
  };
}

/** The pictures the lightbox steps through, in the order's item order: one for each item that has one. */
export function picturesOf(items: readonly OrderItem[]): { itemId: string; url: string }[] {
  return items.flatMap((item) =>
    item.thumbnail ? [{ itemId: item.id, url: item.thumbnail.largeUrl ?? item.thumbnail.url }] : [],
  );
}
