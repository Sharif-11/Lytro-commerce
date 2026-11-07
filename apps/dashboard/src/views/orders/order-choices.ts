import {
  FulfillmentStatus,
  LIVE_PARCEL_STATES,
  OrderStatus,
  ParcelReading,
  ParcelState,
  PaymentMethod,
  Permission,
} from '@lytronix/validators';
import type { Order, OrderPayment } from '@/types/orders';
import { atCounter } from './order-words';

/**
 * ORD-11 (the Phase 6 close-out, Part 36's `c36-edit`): booked with its courier and settled, so only the customer's details
 * and the note can change; its items, totals and where it goes stay as booked, and the courier keeps what it was sent.
 */
export function editsBooked(order: Order): boolean {
  return (
    order.status !== OrderStatus.Cancelled &&
    order.fulfillmentStatus === FulfillmentStatus.Processing &&
    order.parcel?.state === ParcelState.Booked &&
    order.parcel.settled
  );
}

/** What can be done to an order now, by whoever is looking (agreed in the 4.8a read: one next step, the rest in ⋯). */
export function choicesOf(order: Order, may: (permission: Permission) => boolean) {
  const manage = may(Permission.OrdersManage);
  const pay = may(Permission.PaymentsManage);
  const counter = atCounter(order);
  const open =
    order.status !== OrderStatus.Cancelled &&
    order.fulfillmentStatus === FulfillmentStatus.Unfulfilled;
  const livePaid = order.payments.some((payment) => payment.voided === null);
  const toReturn = order.items.some(
    (item) => Number(item.quantity) > Number(item.returnedQuantity),
  );
  const parcel = order.parcel;
  // CRR-08: a booking out with its courier, booked or lost, stands for the order: it can't be booked or shipped again.
  const live = parcel !== null && LIVE_PARCEL_STATES.includes(parcel.state);
  // Booked and taken by the order (moved, counted, its stock out), not yet with the courier.
  const booked =
    order.fulfillmentStatus === FulfillmentStatus.Processing &&
    order.status !== OrderStatus.Cancelled &&
    parcel?.state === ParcelState.Booked;
  // Slice 6.7: the courier says it is coming back, or delivered part of it: what returns is counted with Return items.
  const coming =
    parcel?.reading === ParcelReading.Returning ||
    parcel?.reading === ParcelReading.PartlyDelivered;
  return {
    manage,
    call: manage && open && !counter && order.customerPhone !== null,
    hold: manage && open && !counter && order.status !== OrderStatus.Hold,
    release: manage && order.status === OrderStatus.Hold,
    // CRR-28, ORD-52: a booked order too, until it is on its way; its booking is called off first.
    cancel: manage && (open || booked),
    // Phase 6 (Part 36's `c36-booked-menu`): only the booking, the order kept to book again or ship by hand.
    cancelBooking: manage && booked && parcel.settled,
    // D6-11: a lost answer, settled from the courier's panel.
    settle: manage && parcel?.state === ParcelState.Unknown,
    // A parcel the courier took whose stock couldn't be taken then: Try again.
    retry:
      manage &&
      parcel?.state === ParcelState.Booked &&
      !parcel.settled &&
      parcel.settleProblem !== null,
    // ORD-11: its customer, items, prices or notes, until it ships. Booked (the Phase 6 close-out's `c36-edit`), only its customer's
    // details and note, once the booking is settled: the server refuses an edit while it isn't.
    edit: manage && ((open && !live) || editsBooked(order)),
    delete: may(Permission.OrdersDelete) && open && !livePaid,
    handOver: manage && open && counter,
    ship: manage && open && !counter && order.status === OrderStatus.Confirmed && !live,
    deliver: manage && order.status === OrderStatus.Shipped,
    // ORD-10: once delivered, while any unit is still out (the sketch's next step after Delivered); and once its courier says
    // it is coming back or delivered part of it (Part 36's `c36-returning`, `c36-partly`).
    returnItems:
      manage &&
      toReturn &&
      (order.status === OrderStatus.Delivered ||
        order.status === OrderStatus.PartialDelivered ||
        (order.status === OrderStatus.Shipped && coming)),
    coming,
    // ORD-15: a payment by hand, while something is due (D4-6).
    recordPayment: pay && order.status !== OrderStatus.Cancelled && Number(order.due) > 0,
    // PAY-24 (Part 35): a link the customer pays through, while something is due. At the counter they're standing there.
    paymentLink:
      manage && order.status !== OrderStatus.Cancelled && Number(order.due) > 0 && !counter,
    // Every order prints its label, for anyone who may see it (ORD-19 amended).
    print: true,
  };
}

/**
 * A payment staff may void (agreed 2026-10-30): live, not refunded (Slice 5.3), and not the cash on delivery a delivery
 * collected.
 */
export const voidable = (payment: OrderPayment, may: (permission: Permission) => boolean) =>
  may(Permission.PaymentsManage) &&
  payment.voided === null &&
  payment.refunded === null &&
  payment.method !== PaymentMethod.CashOnDelivery;

/** A payment staff may mark refunded (PAY-20): any live one, cash on delivery collected included. */
export const refundable = (payment: OrderPayment, may: (permission: Permission) => boolean) =>
  may(Permission.PaymentsManage) && payment.voided === null && payment.refunded === null;

export type OrderChoices = ReturnType<typeof choicesOf>;
