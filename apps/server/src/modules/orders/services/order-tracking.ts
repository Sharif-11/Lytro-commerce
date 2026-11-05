import { Inject, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  SHIPPED_FULFILLMENT,
  StatusOverride,
  TRACKED_MESSAGE_MAX_LENGTH,
  visibleOrderStatus,
} from '@lytronix/validators';
import type { SelectCourierEvent, SelectOrderLineComponent } from '@lytronix/db';
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
  TrackedItemView,
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
      modifiers: line.modifiers.map((row) => ({
        groupName: row.groupName,
        optionName: row.optionName,
        priceChange: row.priceChange,
      })),
    }));
}

/** ORD-17 (Slice 4.8e): the items as tracking shows them, each with its answers and a combo's parts. */
function trackedItemsOf(
  lines: OrderLineRecord[],
  components: readonly SelectOrderLineComponent[],
): TrackedItemView[] {
  const sorted = [...lines].sort((a, b) => a.position - b.position);
  return itemsOf(sorted).map((item, index) => {
    const line = sorted[index];
    return {
      ...item,
      captured: (line?.capturedValues ?? []).map(({ name, value }) => ({ name, value })),
      components: components
        .filter((component) => component.orderLineId === line?.id)
        .sort((a, b) => a.partPosition - b.partPosition)
        .map((component) => ({
          productName: component.productName,
          attributes: component.attributeValues.filter((value) => value.variantDefining),
          quantity: component.quantity,
        })),
    };
  });
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
    payment: null,
  };
}

/** ORD-17, SFT-08: what tracking shows; the courier once the order has shipped, never the address or phone. */
export function trackedViewOf(
  order: OrderRecord,
  lines: OrderLineRecord[],
  components: readonly SelectOrderLineComponent[],
  latest: SelectCourierEvent | null = null,
): TrackedOrderView {
  const shipped = SHIPPED_FULFILLMENT.includes(order.fulfillmentStatus);
  return {
    orderNumber: order.orderNumber,
    trackingId: order.trackingId,
    status: shopperStatusOf(order),
    timeline: timelineOf(order),
    items: trackedItemsOf(lines, components),
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
    // CRR-12, read agreed 2026-11-05: never before it ships, and never more than the courier's words about the parcel.
    courierMessage:
      shipped && latest !== null
        ? {
            en: latest.messageEn?.slice(0, TRACKED_MESSAGE_MAX_LENGTH) ?? null,
            bn: latest.messageBn?.slice(0, TRACKED_MESSAGE_MAX_LENGTH) ?? null,
            at: latest.receivedAt,
          }
        : null,
    payment: null,
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
      const lines = await this.store.listLines(tx, tenantId, [order.id]);
      const components = await this.store.listComponents(
        tx,
        tenantId,
        lines.map((line) => line.id),
      );
      const latest = await this.store.latestCourierMessage(tx, tenantId, order.id);
      return trackedViewOf(order, lines, components, latest);
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
