import { Inject, Injectable } from '@nestjs/common';
import type {
  NewOrderHistory,
  OrderPatch,
  SelectOrderLineComponent,
  Transaction,
} from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  FulfillmentStatus,
  FulfilmentType,
  OrderHistoryField,
  OrderStatus,
  PaymentMethod,
  ReservationStatus,
  ServerFieldProblemCode,
  StatusOverride,
  TenantState,
  type HandOverOrderInput,
  type ReturnOrderInput,
  type ShipOrderInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { PayAsYouGoBillingService } from '../../balance/services/payg-billing.service';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { CustomerService } from '../../customers/services/customer.service';
import { milli } from '../../inventory/services/stock-state';
import { ReservationService } from '../../inventory/services/reservation.service';
import { StockReturnService } from '../../inventory/services/stock-return.service';
import type { ReservationRecord } from '../../inventory/types/inventory';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';
import type { OrderLineRecord, OrderRecord, OrderView } from '../types/orders';
import { HandlingQuota, type HandlingPassed, type HandlingShop } from './handling-quota';
import { OrderService } from './order.service';
import { PaymentRecorder } from './payment-recorder';

function quantityText(units: number): string {
  return (units / 1000).toFixed(3);
}

/** How a whole order leaves the shop by hand (D4-7): with a courier, or handed to its customer at the counter. */
interface Departure {
  type: 'ship' | 'hand_over';
  serials: { lineId: string; variantId?: string; serials: string[] }[];
  courier: Pick<OrderRecord, 'courierName' | 'trackingCode' | 'trackingLink'> | null;
}

/**
 * ORD-09, ORD-10, ORD-40 to ORD-43, INV-14, INV-15, INV-17, QTA-01 to QTA-07, PYG-02 to PYG-05 (Phase 4 Slice 4.3,
 * read agreed 2026-10-30): moving a whole order by hand until Phase 6's couriers. A delivery order is marked shipped
 * with its courier and a tracking code or link, then delivered; a takeaway or dine-in order is handed over in one
 * step. Either way, the first time an order leaves it is handled once and for all: counted toward the shop's handling
 * limits, charged the pay-as-you-go fee, and its held stock taken out -- earliest expiry first, with the serials
 * named -- all in one transaction, so a refusal leaves the order as it was. An order not yet confirmed by a call is
 * confirmed by whoever sends it. Delivery collects the cash on delivery, so nothing is left due. Units that come back
 * are returned item by item, each sellable again or damaged; the order is returned once every unit is back.
 */
@Injectable()
export class OrderFulfilment {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(HandlingQuota) private readonly quota: HandlingQuota,
    @Inject(PayAsYouGoBillingService) private readonly payg: PayAsYouGoBillingService,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(StockReturnService) private readonly returns: StockReturnService,
    @Inject(CustomerService) private readonly customers: CustomerService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(PaymentRecorder) private readonly payments: PaymentRecorder,
  ) {}

  /** ORD-09, D4-7: a delivery order sent with a courier, the whole order at once. */
  async ship(
    shop: HandlingShop,
    orderId: string,
    input: ShipOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    return this.depart(shop, orderId, actor, {
      type: 'ship',
      serials: input.serials ?? [],
      courier: {
        courierName: input.courierName,
        trackingCode: input.trackingCode ?? null,
        trackingLink: input.trackingLink ?? null,
      },
    });
  }

  /** Agreed 2026-10-30: a takeaway or dine-in order given to its customer -- shipped and delivered in one step. */
  async handOver(
    shop: HandlingShop,
    orderId: string,
    input: HandOverOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    return this.depart(shop, orderId, actor, {
      type: 'hand_over',
      serials: input.serials ?? [],
      courier: null,
    });
  }

  /** ORD-42, agreed 2026-10-30: a shipped order delivered, its cash on delivery collected. */
  async deliver(tenantId: string, orderId: string, actor: CatalogueActor): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId);
      if (order.statusOverride === StatusOverride.Cancelled) {
        throw new ApiError('conflict', 'OrderIsCancelled', {});
      }
      if (order.fulfillmentStatus !== FulfillmentStatus.Shipped) {
        throw new ApiError('conflict', 'OrderNotShipped', {});
      }
      const now = new Date();
      const history: NewOrderHistory[] = [];
      const patch: OrderPatch = {
        fulfillmentStatus: FulfillmentStatus.Delivered,
        deliveredAt: now,
        ...(await this.collectWithin(tx, tenantId, order, who, history)),
      };
      history.push(this.fulfilmentHistory(order, FulfillmentStatus.Delivered, null, who));
      const updated = await this.store.updateOrder(tx, tenantId, order.id, patch);
      await this.store.insertHistory(tx, tenantId, history);
      await this.customers.recountWithin(tx, tenantId, [order.customerId]);
      await this.record(tx, tenantId, who, updated, OrderStatus.Delivered);
      return this.orders.viewWithin(tx, tenantId, updated, []);
    });
  }

  /**
   * ORD-10, INV-17: units of a shipped order that came back, each item's sellable again or damaged, and on a
   * serial-numbered product which serials. Stock comes back only for units marked sellable; the order is returned once
   * every unit of it is back.
   */
  async returnItems(
    tenantId: string,
    orderId: string,
    input: ReturnOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId);
      if (
        order.fulfillmentStatus !== FulfillmentStatus.Shipped &&
        order.fulfillmentStatus !== FulfillmentStatus.Delivered
      ) {
        throw new ApiError('conflict', 'OrderNotShipped', {});
      }
      const lines = new Map(
        (await this.store.listLines(tx, tenantId, [order.id])).map((line) => [line.id, line]),
      );
      const consumed = new Map<string, ReservationRecord[]>();
      for (const held of await this.reservations.listForOrder(tx, tenantId, order.id)) {
        if (held.status !== ReservationStatus.Consumed) continue;
        consumed.set(held.orderLineId, [...(consumed.get(held.orderLineId) ?? []), held]);
      }
      // CMB-05: a combo line's components, as ordered.
      const components = await this.store.listComponents(tx, tenantId, [...lines.keys()]);
      const notes: string[] = [];
      for (const [index, item] of input.items.entries()) {
        const line = lines.get(item.lineId);
        if (!line) {
          throw new FieldsError([
            {
              field: `items.${String(index)}.lineId`,
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'OrderItemNotFound',
            },
          ]);
        }
        const own = components.filter((component) => component.orderLineId === line.id);
        if (own.length > 0) {
          notes.push(
            await this.returnCombo(
              tx,
              tenantId,
              line,
              own,
              consumed.get(line.id) ?? [],
              item,
              index,
              who,
            ),
          );
          const returned = milli(line.returnedQuantity) + milli(String(item.sellable));
          lines.set(line.id, { ...line, returnedQuantity: quantityText(returned) });
          continue;
        }
        if (item.components !== undefined) {
          throw new FieldsError([
            {
              field: `items.${String(index)}.components`,
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'ComboComponentNotOnLine',
            },
          ]);
        }
        const back = milli(String(item.sellable)) + milli(String(item.damaged));
        const returned = milli(line.returnedQuantity) + back;
        if (returned > milli(line.quantity)) {
          throw new ApiError(
            'conflict',
            'MoreReturnedThanShipped',
            { lineId: line.id },
            undefined,
            { product: line.productName },
          );
        }
        const reservationId = consumed.get(line.id)?.[0]?.id;
        if (reservationId !== undefined) {
          await this.returns.receive(
            tx,
            tenantId,
            {
              reservationId,
              sellable: quantityText(milli(String(item.sellable))),
              damaged: quantityText(milli(String(item.damaged))),
              serials: item.serials ?? null,
            },
            who,
          );
        }
        await this.store.updateLine(tx, tenantId, line.id, {
          returnedQuantity: quantityText(returned),
        });
        lines.set(line.id, { ...line, returnedQuantity: quantityText(returned) });
        notes.push(
          `${line.productName}: ${quantityText(milli(String(item.sellable)))} sellable, ${quantityText(milli(String(item.damaged)))} damaged`,
        );
      }
      const allBack = [...lines.values()].every(
        (line) => milli(line.returnedQuantity) === milli(line.quantity),
      );
      const history: NewOrderHistory[] = [
        {
          orderId: order.id,
          field: OrderHistoryField.Return,
          oldValue: null,
          newValue: null,
          note: [...notes, ...(input.note !== undefined ? [input.note] : [])].join('; '),
          changedBy: who.id,
        },
      ];
      let updated = order;
      if (allBack) {
        history.push(this.fulfilmentHistory(order, FulfillmentStatus.Returned, null, who));
        updated = await this.store.updateOrder(tx, tenantId, order.id, {
          fulfillmentStatus: FulfillmentStatus.Returned,
        });
      }
      await this.store.insertHistory(tx, tenantId, history);
      await this.customers.recountWithin(tx, tenantId, [order.customerId]);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderStatusChanged,
        { type: 'order', id: order.id },
        { orderNumber: order.orderNumber, to: 'return', items: input.items.length, allBack },
      );
      return this.orders.viewWithin(tx, tenantId, updated, []);
    });
  }

  /**
   * QTA-01, PYG-02, INV-15, ORD-51: the order leaving the shop for the first time, in one transaction: handled (counted
   * and, on pay-as-you-go, charged), its held stock taken out, confirmed if no call had, and marked shipped -- or, handed
   * over, delivered and its cash collected too.
   */
  private async depart(
    shop: HandlingShop,
    orderId: string,
    actor: CatalogueActor,
    departure: Departure,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(shop.id, actor);
    return this.store.run(shop.id, async (tx) => {
      const order = await this.find(tx, shop.id, orderId);
      this.refuseDeparture(order, departure.type);
      const now = new Date();
      const passed = await this.handleWithin(tx, shop, order, now);
      await this.takeStockWithin(tx, shop.id, order, departure.serials, who);
      const history: NewOrderHistory[] = [];
      const patch: OrderPatch = {
        fulfillmentStatus: FulfillmentStatus.Shipped,
        shippedAt: now,
        handledAt: order.handledAt ?? now,
        ...(departure.courier ?? {}),
      };
      if (order.confirmedAt === null) {
        Object.assign(patch, { confirmedAt: now, confirmedBy: who.id });
        history.push({
          orderId: order.id,
          field: OrderHistoryField.Confirmed,
          oldValue: null,
          newValue: OrderStatus.Confirmed,
          note: null,
          changedBy: who.id,
        });
      }
      const courierNote = departure.courier
        ? [
            departure.courier.courierName,
            departure.courier.trackingCode,
            departure.courier.trackingLink,
          ]
            .filter((part) => part !== null)
            .join(' · ')
        : null;
      history.push(this.fulfilmentHistory(order, FulfillmentStatus.Shipped, courierNote, who));
      let to = OrderStatus.Shipped;
      if (departure.type === 'hand_over') {
        Object.assign(patch, {
          fulfillmentStatus: FulfillmentStatus.Delivered,
          deliveredAt: now,
          ...(await this.collectWithin(tx, shop.id, order, who, history)),
        });
        history.push({
          ...this.fulfilmentHistory(order, FulfillmentStatus.Delivered, null, who),
          oldValue: FulfillmentStatus.Shipped,
        });
        to = OrderStatus.Delivered;
      }
      const updated = await this.store.updateOrder(tx, shop.id, order.id, patch);
      await this.store.insertHistory(tx, shop.id, history);
      await this.customers.recountWithin(tx, shop.id, [order.customerId]);
      await this.record(tx, shop.id, who, updated, to);
      return this.orders.viewWithin(tx, shop.id, updated, [], passed);
    });
  }

  /** D4-7: what may leave: an order not cancelled, held or in review, not sent yet, and of the step's own kind. */
  private refuseDeparture(order: OrderRecord, type: Departure['type']): void {
    if (order.statusOverride === StatusOverride.Cancelled) {
      throw new ApiError('conflict', 'OrderIsCancelled', {});
    }
    if (
      order.statusOverride === StatusOverride.Hold ||
      order.statusOverride === StatusOverride.InReview
    ) {
      throw new ApiError('conflict', 'OrderOnHoldNotSent', {});
    }
    if (order.fulfillmentStatus !== FulfillmentStatus.Unfulfilled) {
      throw new ApiError('conflict', 'OrderAlreadySent', {});
    }
    const delivery = order.fulfilmentType === FulfilmentType.Delivery;
    if (type === 'ship' && !delivery) throw new ApiError('conflict', 'HandOverInstead', {});
    if (type === 'hand_over' && delivery) throw new ApiError('conflict', 'ShipInstead', {});
  }

  /**
   * QTA-01 to QTA-06, PYG-02 to PYG-05: the order's first handling -- counted toward the shop's limits and, on
   * pay-as-you-go, charged its fee from the balance -- in the caller's transaction, once ever.
   */
  private async handleWithin(
    tx: Transaction,
    shop: HandlingShop,
    order: OrderRecord,
    now: Date,
  ): Promise<HandlingPassed | null> {
    if (order.handledAt !== null) return null;
    const passed = await this.quota.admitWithin(tx, shop, now);
    if (shop.state === TenantState.PayAsYouGo) {
      await this.payg.chargeOrderFee(tx, shop.id, order.id, order.grandTotal);
    }
    return passed;
  }

  /**
   * CMB-05 (agreed 2026-10-30: whole combos only): `sellable` counts the combos that came back; every component returns
   * its units of them, sellable unless named damaged, with its serials. The line counts its combos back.
   */
  private async returnCombo(
    tx: Transaction,
    tenantId: string,
    line: OrderLineRecord,
    components: SelectOrderLineComponent[],
    consumed: ReservationRecord[],
    item: ReturnOrderInput['items'][number],
    index: number,
    who: ResolvedActor,
  ): Promise<string> {
    const at = (field: string) => `items.${String(index)}.${field}`;
    const combos = milli(String(item.sellable));
    if (milli(String(item.damaged)) > 0 || combos % 1000 !== 0 || combos === 0) {
      throw new FieldsError([
        {
          field: at('sellable'),
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'ComboReturnsWhole',
        },
      ]);
    }
    const returned = milli(line.returnedQuantity) + combos;
    if (returned > milli(line.quantity)) {
      throw new ApiError('conflict', 'MoreReturnedThanShipped', { lineId: line.id }, undefined, {
        product: line.productName,
      });
    }
    const perCombo = new Map<string, number>();
    for (const component of components) {
      if (component.variantId === null) continue;
      perCombo.set(
        component.variantId,
        (perCombo.get(component.variantId) ?? 0) + milli(component.quantity),
      );
    }
    const named = item.components ?? [];
    named.forEach((entry, position) => {
      if (!perCombo.has(entry.variantId)) {
        throw new FieldsError([
          {
            field: at(`components.${String(position)}.variantId`),
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'ComboComponentNotOnLine',
          },
        ]);
      }
    });
    const damagedNotes: string[] = [];
    for (const reservation of consumed) {
      const per = perCombo.get(reservation.soldVariantId);
      if (per === undefined) continue;
      const units = (per * combos) / 1000;
      const entry = named.find((each) => each.variantId === reservation.soldVariantId);
      const damaged = milli(String(entry?.damaged ?? 0));
      if (damaged > units) {
        throw new ApiError(
          'conflict',
          'MoreReturnedThanShipped',
          { lineId: line.id, variantId: reservation.soldVariantId },
          undefined,
          { product: line.productName },
        );
      }
      await this.returns.receive(
        tx,
        tenantId,
        {
          reservationId: reservation.id,
          sellable: quantityText(units - damaged),
          damaged: quantityText(damaged),
          serials: entry?.serials ?? null,
        },
        who,
      );
      if (damaged > 0) {
        const name = components.find(
          (each) => each.variantId === reservation.soldVariantId,
        )?.productName;
        damagedNotes.push(`${name ?? ''} ${quantityText(damaged)} damaged`);
      }
    }
    await this.store.updateLine(tx, tenantId, line.id, {
      returnedQuantity: quantityText(returned),
    });
    return [`${line.productName}: ${quantityText(combos)} back`, ...damagedNotes].join(', ');
  }

  /** INV-14, INV-15: the stock the order holds taken out, each serial-numbered item with the serials named for it. */
  private async takeStockWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    serials: Departure['serials'],
    who: ResolvedActor,
  ): Promise<void> {
    const lines = new Map(
      (await this.store.listLines(tx, tenantId, [order.id])).map((line) => [line.id, line]),
    );
    const problems = serials.flatMap((item, index) =>
      lines.has(item.lineId)
        ? []
        : [
            {
              field: `serials.${String(index)}.lineId`,
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'OrderItemNotFound' as const,
            },
          ],
    );
    if (problems.length > 0) throw new FieldsError(problems);
    // CMB-05: a combo line's serials are named per component (its variant); any other item's by its line alone.
    const named = new Map(
      serials.map((item) => [`${item.lineId} ${item.variantId ?? ''}`, item.serials]),
    );
    const held = (await this.reservations.listForOrder(tx, tenantId, order.id)).filter(
      (reservation) => reservation.status === ReservationStatus.Active,
    );
    const stray = serials.flatMap((item, index) =>
      item.variantId === undefined ||
      held.some(
        (reservation) =>
          reservation.orderLineId === item.lineId && reservation.soldVariantId === item.variantId,
      )
        ? []
        : [
            {
              field: `serials.${String(index)}.variantId`,
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'ComboComponentNotOnLine' as const,
            },
          ],
    );
    if (stray.length > 0) throw new FieldsError(stray);
    await this.reservations.consume(
      tx,
      tenantId,
      held.map((reservation) => {
        const own = lines.get(reservation.orderLineId)?.variantId === reservation.soldVariantId;
        return {
          reservationId: reservation.id,
          serials:
            named.get(`${reservation.orderLineId} ${reservation.soldVariantId}`) ??
            (own ? named.get(`${reservation.orderLineId} `) : undefined) ??
            null,
        };
      }),
      who,
    );
  }

  /**
   * Agreed 2026-10-30: what is still due is collected on delivery -- recorded as a cash-on-delivery payment, verified by
   * whoever marks it -- so the order is paid and nothing is left due (ORD-43).
   */
  private async collectWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    who: ResolvedActor,
    history: NewOrderHistory[],
  ): Promise<OrderPatch> {
    if (Number(order.due) <= 0) return {};
    return this.payments.addWithin(
      tx,
      tenantId,
      order,
      {
        method: PaymentMethod.CashOnDelivery,
        amount: order.due,
        senderNumber: null,
        transactionId: null,
      },
      who,
      history,
    );
  }

  private fulfilmentHistory(
    order: OrderRecord,
    to: FulfillmentStatus,
    note: string | null,
    who: ResolvedActor,
  ): NewOrderHistory {
    return {
      orderId: order.id,
      field: OrderHistoryField.FulfillmentStatus,
      oldValue: order.fulfillmentStatus,
      newValue: to,
      note,
      changedBy: who.id,
    };
  }

  private record(
    tx: Transaction,
    tenantId: string,
    who: ResolvedActor,
    order: OrderRecord,
    to: OrderStatus,
  ): Promise<void> {
    return this.activity.record(
      tx,
      tenantId,
      who,
      AuditAction.OrderStatusChanged,
      { type: 'order', id: order.id },
      { orderNumber: order.orderNumber, to, courier: order.courierName },
    );
  }

  private async find(tx: Transaction, tenantId: string, orderId: string): Promise<OrderRecord> {
    const order = await this.store.findOrder(tx, tenantId, orderId, true);
    if (!order) throw new ApiError('not_found', 'OrderNotFound', {});
    return order;
  }
}
