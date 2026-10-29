import { FulfillmentStatus, OrderPaymentStatus, OrderStatus, StatusOverride } from '../db/enums';

/** What an order's visible status is worked out from (ORD-41). */
export interface OrderStatusAxes {
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  /** A call confirmed it (ORD-51). */
  confirmed: boolean;
  /** Set by hand; shows instead of the worked-out status until cleared. */
  override: StatusOverride | null;
}

/** One row of the lookup: the status shown when every condition it names holds. */
export interface OrderStatusRule {
  status: OrderStatus;
  fulfillment?: readonly FulfillmentStatus[];
  payment?: readonly OrderPaymentStatus[];
  confirmed?: true;
}

/**
 * ORD-41: the fixed lookup, read top down after a manual override; the first rule that holds gives the status, and the
 * last holds always. Goods returned or money refunded outrank the rest, a failed payment rejects the order, and an
 * order not yet sent on its way is waiting on a payment check, confirmed by a call, or pending. A partly shipped order
 * shows partly delivered (ORD-41's pass criterion), the list having no partly shipped status (§2.3.1). `completed` is
 * reached by no event yet. The server's list filter is built from these same rows, so the two never disagree.
 */
export const ORDER_STATUS_RULES: readonly OrderStatusRule[] = [
  { status: OrderStatus.Returned, fulfillment: [FulfillmentStatus.Returned] },
  { status: OrderStatus.Refunded, payment: [OrderPaymentStatus.Refunded] },
  { status: OrderStatus.Rejected, payment: [OrderPaymentStatus.PaymentFailed] },
  { status: OrderStatus.Delivered, fulfillment: [FulfillmentStatus.Delivered] },
  {
    status: OrderStatus.PartialDelivered,
    fulfillment: [FulfillmentStatus.PartiallyDelivered, FulfillmentStatus.PartiallyShipped],
  },
  { status: OrderStatus.Shipped, fulfillment: [FulfillmentStatus.Shipped] },
  { status: OrderStatus.Processing, fulfillment: [FulfillmentStatus.Processing] },
  { status: OrderStatus.Unverified, payment: [OrderPaymentStatus.PendingVerification] },
  { status: OrderStatus.Confirmed, confirmed: true },
  { status: OrderStatus.Pending },
];

/** ORD-41: what each manual override shows. */
const OVERRIDE_STATUS: Readonly<Record<StatusOverride, OrderStatus>> = {
  [StatusOverride.Hold]: OrderStatus.Hold,
  [StatusOverride.Cancelled]: OrderStatus.Cancelled,
  [StatusOverride.InReview]: OrderStatus.InReview,
};

function holds(rule: OrderStatusRule, axes: OrderStatusAxes): boolean {
  return (
    (rule.fulfillment?.includes(axes.fulfillmentStatus) ?? true) &&
    (rule.payment?.includes(axes.paymentStatus) ?? true) &&
    (rule.confirmed === undefined || axes.confirmed)
  );
}

/** ORD-41: the status an order shows. */
export function visibleOrderStatus(axes: OrderStatusAxes): OrderStatus {
  if (axes.override !== null) return OVERRIDE_STATUS[axes.override];
  const rule = ORDER_STATUS_RULES.find((candidate) => holds(candidate, axes));
  if (!rule) throw new Error('the last order status rule holds always');
  return rule.status;
}

/** ORD-52: goods that have left the shop come back by a return, never by a cancellation. */
export const SHIPPED_FULFILLMENT: readonly FulfillmentStatus[] = [
  FulfillmentStatus.PartiallyShipped,
  FulfillmentStatus.Shipped,
  FulfillmentStatus.PartiallyDelivered,
  FulfillmentStatus.Delivered,
  FulfillmentStatus.Returned,
];
