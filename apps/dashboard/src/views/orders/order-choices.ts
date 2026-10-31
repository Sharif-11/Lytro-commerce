import { FulfillmentStatus, OrderStatus, Permission } from '@lytronix/validators';
import type { Order } from '@/types/orders';
import { atCounter } from './order-words';

/** What can be done to an order now, by whoever is looking (agreed in the 4.8a read: one next step, the rest in ⋯). */
export function choicesOf(order: Order, may: (permission: Permission) => boolean) {
  const manage = may(Permission.OrdersManage);
  const counter = atCounter(order);
  const open =
    order.status !== OrderStatus.Cancelled &&
    order.fulfillmentStatus === FulfillmentStatus.Unfulfilled;
  const livePaid = order.payments.some((payment) => payment.voided === null);
  return {
    manage,
    call: manage && open && !counter && order.customerPhone !== null,
    hold: manage && open && !counter && order.status !== OrderStatus.Hold,
    release: manage && order.status === OrderStatus.Hold,
    cancel: manage && open,
    delete: may(Permission.OrdersDelete) && open && !livePaid,
    handOver: manage && open && counter,
    deliver: manage && order.status === OrderStatus.Shipped,
  };
}

export type OrderChoices = ReturnType<typeof choicesOf>;
