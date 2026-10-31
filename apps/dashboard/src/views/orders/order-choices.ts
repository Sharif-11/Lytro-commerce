import { FulfillmentStatus, OrderStatus, PaymentMethod, Permission } from '@lytronix/validators';
import type { Order, OrderPayment } from '@/types/orders';
import { atCounter } from './order-words';

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
  return {
    manage,
    call: manage && open && !counter && order.customerPhone !== null,
    hold: manage && open && !counter && order.status !== OrderStatus.Hold,
    release: manage && order.status === OrderStatus.Hold,
    cancel: manage && open,
    // ORD-11: its customer, items, prices or notes, until it ships.
    edit: manage && open,
    delete: may(Permission.OrdersDelete) && open && !livePaid,
    handOver: manage && open && counter,
    ship: manage && open && !counter && order.status === OrderStatus.Confirmed,
    deliver: manage && order.status === OrderStatus.Shipped,
    // ORD-10: once delivered, while any unit is still out (the sketch's next step after Delivered).
    returnItems: manage && order.status === OrderStatus.Delivered && toReturn,
    // ORD-15: a payment by hand, while something is due (D4-6).
    recordPayment: pay && order.status !== OrderStatus.Cancelled && Number(order.due) > 0,
    // Every order prints its label, for anyone who may see it (ORD-19 amended).
    print: true,
  };
}

/** A payment staff may void (agreed 2026-10-30): live, and not the cash on delivery a delivery collected. */
export const voidable = (payment: OrderPayment, may: (permission: Permission) => boolean) =>
  may(Permission.PaymentsManage) &&
  payment.voided === null &&
  payment.method !== PaymentMethod.CashOnDelivery;

export type OrderChoices = ReturnType<typeof choicesOf>;
