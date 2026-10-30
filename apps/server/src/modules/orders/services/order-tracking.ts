import { Inject, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  SHIPPED_FULFILLMENT,
  StatusOverride,
  visibleOrderStatus,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';
import { taxesOf } from './order-pricing';
import type {
  OrderLineRecord,
  OrderRecord,
  PlacedOrderView,
  ShopperItemView,
  ShopperOrderPage,
  ShopperTotals,
  TrackedOrderView,
  TrackingStep,
  TrackingStepName,
} from '../types/orders';

/** LND-16: the one ID a shopper's purchase is told to Meta by, from the browser and the server alike. */
export function purchaseEventIdOf(trackingId: string): string {
  return `purchase.${trackingId}`;
}

function itemsOf(lines: OrderLineRecord[]): ShopperItemView[] {
  return [...lines]
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      variantId: line.variantId,
      productName: line.productName,
      attributes: line.attributeValues.filter((value) => value.variantDefining),
      quantity: line.quantity,
      stockUnit: line.stockUnit,
      unitPrice: line.unitPrice,
      itemTotal: line.itemTotal,
    }));
}

function totalsOf(order: OrderRecord, lines: readonly OrderLineRecord[]): ShopperTotals {
  return {
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    grandTotal: order.grandTotal,
    codAmount: order.codAmount,
    taxes: taxesOf(lines),
  };
}

/**
 * ORD-17 (agreed 2026-10-30): the status a shopper sees, from the same lookup staff see (ORD-41). A hold or a review is
 * the shop's own, so the status under it shows; a cancellation shows.
 */
export function shopperStatusOf(order: OrderRecord): OrderStatus {
  return visibleOrderStatus({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    confirmed: order.confirmedAt !== null,
    override: order.statusOverride === StatusOverride.Cancelled ? StatusOverride.Cancelled : null,
  });
}

/** ORD-17: the steps the order has taken, oldest first. */
export function timelineOf(order: OrderRecord): TrackingStep[] {
  const steps: [TrackingStepName, Date | null][] = [
    ['placed', order.createdAt],
    ['confirmed', order.confirmedAt],
    ['shipped', order.shippedAt],
    ['delivered', order.deliveredAt],
    ['cancelled', order.statusOverride === StatusOverride.Cancelled ? order.cancelledAt : null],
  ];
  return steps.flatMap(([step, at]) => (at === null ? [] : [{ step, at }]));
}

/** ORD-02, LND-11: the confirmation a shopper is shown once the order is placed. */
export function placedViewOf(order: OrderRecord, lines: OrderLineRecord[]): PlacedOrderView {
  return {
    orderNumber: order.orderNumber,
    trackingId: order.trackingId,
    status: shopperStatusOf(order),
    createdAt: order.createdAt,
    items: itemsOf(lines),
    ...totalsOf(order, lines),
    purchaseEventId: purchaseEventIdOf(order.trackingId),
  };
}

/** ORD-17, SFT-08: what tracking shows; the courier once the order has shipped, never the address or phone. */
export function trackedViewOf(order: OrderRecord, lines: OrderLineRecord[]): TrackedOrderView {
  const shipped = SHIPPED_FULFILLMENT.includes(order.fulfillmentStatus);
  return {
    orderNumber: order.orderNumber,
    trackingId: order.trackingId,
    status: shopperStatusOf(order),
    timeline: timelineOf(order),
    items: itemsOf(lines),
    ...totalsOf(order, lines),
    due: order.due,
    courier:
      shipped && (order.courierName ?? order.trackingCode ?? order.trackingLink) !== null
        ? {
            name: order.courierName,
            trackingCode: order.trackingCode,
            trackingLink: order.trackingLink,
          }
        : null,
  };
}

/** ORD-17, LND-16: a shop's order as a shopper or Meta is told of it, read by its tracking ID or its id. */
@Injectable()
export class OrderTracking {
  constructor(@Inject(ORDER_STORE) private readonly store: OrderStore) {}

  /** ORD-17: the order with this tracking ID in this shop; any other is `not_found`. */
  async track(tenantId: string, trackingId: string): Promise<TrackedOrderView> {
    return this.store.run(tenantId, async (tx) => {
      const order = await this.store.findByTrackingId(tx, tenantId, trackingId);
      if (!order) throw new ApiError('not_found', 'OrderNotFound', {});
      return trackedViewOf(order, await this.store.listLines(tx, tenantId, [order.id]));
    });
  }

  /**
   * ORD-18, agreed 2026-10-30: the shop's orders with a signed-in shopper's phone, from any source -- staff-entered
   * ones too, the phone being proved by the shopper's sign-up code -- each with what opens its tracking.
   */
  ordersOfPhone(
    tenantId: string,
    phone: string,
    page: { page: number; limit: number },
  ): Promise<ShopperOrderPage> {
    return this.store.run(tenantId, async (tx) => {
      const { rows, total } = await this.store.listForPhone(tx, tenantId, phone, {
        offset: (page.page - 1) * page.limit,
        limit: page.limit,
      });
      return {
        orders: rows.map((order) => ({
          orderNumber: order.orderNumber,
          trackingId: order.trackingId,
          status: shopperStatusOf(order),
          grandTotal: order.grandTotal,
          createdAt: order.createdAt,
        })),
        page: page.page,
        limit: page.limit,
        total,
        pages: Math.ceil(total / page.limit),
      };
    });
  }

  /** LND-16: an order and its items, for the purchase told to Meta; null once the order is gone. */
  async orderWithLines(
    tenantId: string,
    orderId: string,
  ): Promise<{ order: OrderRecord; lines: OrderLineRecord[] } | null> {
    return this.store.run(tenantId, async (tx) => {
      const order = await this.store.findOrder(tx, tenantId, orderId, false);
      if (!order) return null;
      return { order, lines: await this.store.listLines(tx, tenantId, [order.id]) };
    });
  }
}
