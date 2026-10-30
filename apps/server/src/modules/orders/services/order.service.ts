import { Inject, Injectable } from '@nestjs/common';
import type { InsertOrder, NewOrderHistory, OrderPatch, Transaction } from '@lytronix/db';
import {
  AttributeDataType,
  AuditAction,
  bdMobileNumber,
  CallOutcome,
  FieldProblemCode,
  FulfilmentType,
  fulfilmentProblems,
  MEASURED_STOCK_UNITS,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  PaymentPolicy,
  ServerFieldProblemCode,
  SHIPPED_FULFILLMENT,
  StatusOverride,
  visibleOrderStatus,
  type CancelOrderInput,
  type CancelReason,
  type CreateOrderInput,
  type LogCallInput,
  type OrderListQuery,
  type OverrideOrderInput,
  type UpdateOrderInput,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { OrderKept } from '../../../common/errors/order-kept';
import {
  IdempotencyService,
  type IdempotencyClaim,
} from '../../../common/idempotency/idempotency.service';
import { DAY_MS, dhakaDate, dhakaDayStart } from '../../../common/time';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor, OrderableVariant } from '../../catalogue/types/catalogue';
import { CustomerService } from '../../customers/services/customer.service';
import { LocationService } from '../../delivery/services/location.service';
import type { ResolvedZoneView } from '../../delivery/types/delivery';
import { ReservationService } from '../../inventory/services/reservation.service';
import { milli } from '../../inventory/services/stock-state';
import { StaffService } from '../../staff/services/staff.service';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';
import type {
  LineCapturedSnapshot,
  NewOrderLine,
  OrderCreated,
  OrderItemView,
  OrderLineRecord,
  OrderPage,
  OrderPerson,
  OrderQuote,
  OrderRecord,
  OrderView,
  OrderWarning,
  UnnumberedOrder,
} from '../types/orders';
import { newTrackingId, orderNumberOf } from './order-numbers';
import { OrderPricing, type OrderPrice, type PricingLine } from './order-pricing';

// ORD-05: how many tracking IDs are drawn before giving up; a clash is one in a trillion.
const TRACKING_DRAWS = 5;
// LIF-16: how many orders the export reads at a time.
const EXPORT_BATCH = 500;
// ORD-12: an order with any of these has had money verified on it, so it is cancelled or returned instead.
const PAID: readonly OrderPaymentStatus[] = [
  OrderPaymentStatus.PartiallyPaid,
  OrderPaymentStatus.Paid,
  OrderPaymentStatus.Refunded,
];

function money(value: number): string {
  return value.toFixed(2);
}

function quantityText(value: number): string {
  return value.toFixed(3);
}

/** An item as entered, and (ORD-11) the stored line it keeps, when it is one already on the order. */
interface ItemEntry {
  item: CreateOrderInput['items'][number];
  kept: OrderLineRecord | null;
}

/** One item ready to price and store: its snapshot, and what pricing reads of it. */
interface PlannedLine {
  row: Omit<NewOrderLine, 'position' | 'itemTotal' | 'deliveryCharge' | 'advance'>;
  pricing: PricingLine;
  kept: OrderLineRecord | null;
}

/** What makes one new order, whoever enters it: staff from the dashboard (ORD-01), or a shopper through a key (ORD-02). */
export interface NewOrderSpec {
  source: OrderSource;
  type: FulfilmentType;
  customerName: string | null;
  phone: string | null;
  location: ResolvedZoneView['location'] | null;
  deliveryAddress: string | null;
  tableRef: string | null;
  items: CreateOrderInput['items'];
  discount: string;
  /** ORD-06: the delivery charge staff set by hand, or null to work it out. */
  byHand: string | null;
  confirmed: boolean;
  notes: string | null;
  /** LND-07: what the shopper wrote for the shop. */
  shopperNote: string | null;
  /** The staff member who entered it, or null for a shopper's order. */
  by: string | null;
  /** Whom the activity entry names (API-21: the key, for a shopper's order), and what else it records. */
  actor: ResolvedActor;
  audited: Record<string, unknown>;
  /** ORD-02: refused what a shopper may not order, rather than warned. */
  shopper: boolean;
}

/** A new order as made, for its caller to word, or the reply its idempotency key already holds. */
export type OrderMade =
  | { replayed: true; body: unknown }
  | {
      replayed: false;
      order: OrderRecord;
      lines: OrderLineRecord[];
      warnings: OrderWarning[];
    };

/** Where an order goes: the thana, and the zone and rate per kg it was priced with. */
interface Destination {
  location: ResolvedZoneView['location'] | null;
  zone: {
    id: string;
    name: { en: string; bn: string };
    charge: string;
    noDelivery: boolean;
  } | null;
  extraChargePerKg: string;
}

function totalsOf(
  price: OrderPrice,
): Pick<
  OrderRecord,
  'subtotal' | 'deliveryCharge' | 'discount' | 'grandTotal' | 'advanceDue' | 'codAmount' | 'due'
> {
  return {
    subtotal: price.subtotal,
    deliveryCharge: price.deliveryCharge,
    discount: price.discount,
    grandTotal: price.grandTotal,
    advanceDue: price.advanceDue,
    codAmount: price.codAmount,
    // ORD-06: verified payments come off what is due (Slice 4.3); none are recorded yet.
    due: price.grandTotal,
  };
}

function itemView(line: OrderLineRecord): OrderItemView {
  return {
    id: line.id,
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    sku: line.sku,
    attributes: line.attributeValues,
    captured: line.capturedValues,
    thumbnail:
      line.thumbnailMediaId !== null && line.thumbnailUrl !== null
        ? { mediaId: line.thumbnailMediaId, url: line.thumbnailUrl }
        : null,
    stockUnit: line.stockUnit,
    listPrice: line.listPrice,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    packAmount: line.packAmount,
    itemDiscount: line.itemDiscount,
    itemTotal: line.itemTotal,
    weightKg: line.weightKg,
    ownDeliveryCharge: line.ownDeliveryCharge,
    deliveryMode: line.deliveryMode,
    deliveryCharge: line.deliveryCharge,
    paymentPolicy: line.paymentPolicy,
    advance: line.advance,
  };
}

function statusOf(order: OrderRecord): OrderStatus {
  return visibleOrderStatus({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    confirmed: order.confirmedAt !== null,
    override: order.statusOverride,
  });
}

/**
 * ORD-01 to ORD-14, ORD-41, ORD-45, ORD-46, ORD-51, ORD-52, PRD-07, MNU-04 (Phase 4 Slice 4.1): a shop's orders as staff
 * enter and handle them. An order is made in one transaction -- its idempotency key, the day's number, its customer, its
 * items priced by `priceOrder` and snapshotted, the stock they hold, its history and its activity entry -- all or
 * nothing. Its items change until it ships, holding their stock afresh; a call confirms it, holds it until a call-back
 * time, or cancels it with its reason, letting its stock go; staff may hold it or put it in review by hand; and before it
 * ships, with nothing paid, it may be deleted. Every change works its customer's figures out again (CUS-01).
 */
@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(OrderPricing) private readonly pricing: OrderPricing,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(CustomerService) private readonly customers: CustomerService,
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  /** ORD-01, ORD-07, PRD-07, D4-8: an order entered by staff, holding its stock, once per idempotency key. */
  async create(
    tenantId: string,
    input: CreateOrderInput,
    actor: CatalogueActor,
    claim: IdempotencyClaim,
  ): Promise<OrderCreated> {
    const type = input.fulfilmentType ?? FulfilmentType.Delivery;
    const location =
      type === FulfilmentType.Delivery && input.locationId != null
        ? await this.pricing.thanaOf(input.locationId)
        : null;
    const who = await this.activity.resolve(tenantId, actor);
    const byHand = type === FulfilmentType.Delivery && input.deliveryCharge != null;
    return this.store.run(tenantId, async (tx) => {
      const made = await this.makeWithin(tx, tenantId, claim, {
        source: OrderSource.Dashboard,
        type,
        customerName: input.customerName ?? null,
        phone: input.phone ?? null,
        location,
        deliveryAddress: input.deliveryAddress ?? null,
        tableRef: input.tableRef ?? null,
        items: input.items,
        discount: money(input.discount ?? 0),
        byHand: byHand ? money(input.deliveryCharge ?? 0) : null,
        confirmed: input.status === OrderStatus.Confirmed,
        notes: input.notes ?? null,
        shopperNote: null,
        by: who.id,
        actor: who,
        audited: {},
        shopper: false,
      });
      if (made.replayed) return made;
      const view = await this.viewWithin(tx, tenantId, made.order, made.warnings);
      await this.idempotency.completeWithin(tx, claim, 201, view);
      return { replayed: false, order: view };
    });
  }

  /** Runs `work` in one of the shop's transactions, for a caller making an order with `makeWithin` (ORD-02). */
  inTransaction<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.run(tenantId, work);
  }

  /**
   * ORD-01, ORD-02, ORD-07, PRD-07, D4-8: one new order, whoever enters it, in the caller's transaction: its
   * idempotency key, its customer, its items priced by `priceOrder` and snapshotted, the stock they hold, its history,
   * the day's number and its activity entry. A shopper's order is refused what staff are only warned of (DLV-06,
   * DLV-07) and what a shopper may not order (PRD-06, D4-2). The caller words the reply and stores it with the key.
   */
  async makeWithin(
    tx: Transaction,
    tenantId: string,
    claim: IdempotencyClaim,
    spec: NewOrderSpec,
  ): Promise<OrderMade> {
    const claimed = await this.idempotency.claimWithin(tx, claim);
    if (claimed.replay) return { replayed: true, body: claimed.body };
    const now = new Date();
    // KNOWN-GAPS §75 and §98's lock order: products and levels, then the customer, then the day's counter.
    const customerId =
      spec.phone !== null ? await this.customers.claimWithin(tx, tenantId, spec.phone) : null;
    const variants = await this.pricing.variantsWithin(
      tx,
      tenantId,
      spec.items.map((item) => item.variantId),
    );
    const destination = await this.destinationWithin(tx, tenantId, spec.type, spec.location);
    const planned = this.plan(
      spec.items.map((item) => ({ item, kept: null })),
      variants,
    );
    if (spec.shopper) this.refuseForShopper(destination, planned, variants);
    const price = this.priceOf(spec.type, destination, planned, spec.discount, {
      byHand: spec.byHand,
    });
    const made = await this.insertOrder(tx, {
      tenantId,
      source: spec.source,
      fulfilmentType: spec.type,
      customerId,
      customerName: spec.customerName,
      customerPhone: spec.phone,
      locationId: destination.location?.id ?? null,
      deliveryAddress: spec.deliveryAddress,
      tableRef: spec.tableRef,
      ...this.zoneColumns(destination),
      confirmedAt: spec.confirmed ? now : null,
      confirmedBy: spec.confirmed ? spec.by : null,
      ...totalsOf(price),
      deliveryChargeByHand: spec.byHand !== null,
      notes: spec.notes,
      shopperNote: spec.shopperNote,
      createdBy: spec.by,
      createdAt: now,
      updatedAt: now,
    });
    const lines = await this.store.insertLines(tx, tenantId, made.id, this.rowsOf(planned, price));
    await this.reservations.reserve(
      tx,
      tenantId,
      { orderId: made.id, awaitingPayment: false, lines: this.holdsOf(lines) },
      now,
    );
    const by = { id: spec.by, ip: spec.actor.ip };
    await this.store.insertHistory(tx, tenantId, [
      {
        orderId: made.id,
        field: OrderHistoryField.Created,
        oldValue: null,
        newValue: spec.confirmed ? OrderStatus.Confirmed : OrderStatus.Pending,
        note: null,
        changedBy: spec.by,
      },
      ...this.byHandHistory(made.id, planned, by),
      ...(spec.byHand !== null
        ? [
            this.deliveryHistory(
              made.id,
              this.workedOut(spec.type, destination, planned, price),
              price,
              by,
            ),
          ]
        : []),
    ]);
    await this.customers.recountWithin(tx, tenantId, [customerId]);
    // ORD-04 (D4-4), KNOWN-GAPS §98: the number last, so the day's counter is held only while the order is finished
    // and other orders of the shop wait on it briefly; a rollback still gives the number back.
    const day = dhakaDate(now);
    const order = await this.store.numberOrder(
      tx,
      tenantId,
      made.id,
      orderNumberOf(day, await this.store.nextNumber(tx, tenantId, day)),
    );
    await this.activity.record(
      tx,
      tenantId,
      spec.actor,
      AuditAction.OrderCreated,
      { type: 'order', id: order.id },
      {
        orderNumber: order.orderNumber,
        items: lines.length,
        grandTotal: order.grandTotal,
        ...spec.audited,
      },
    );
    return {
      replayed: false,
      order,
      lines,
      warnings: this.warningsOf(destination, planned, variants),
    };
  }

  /** D4-9: what an order would come to, priced as creation prices it, without making it or holding stock. */
  async quote(tenantId: string, input: CreateOrderInput): Promise<OrderQuote> {
    const type = input.fulfilmentType ?? FulfilmentType.Delivery;
    const location =
      type === FulfilmentType.Delivery && input.locationId != null
        ? await this.pricing.thanaOf(input.locationId)
        : null;
    return this.store.run(tenantId, async (tx) => {
      const variants = await this.pricing.variantsWithin(
        tx,
        tenantId,
        input.items.map((item) => item.variantId),
      );
      const destination = await this.destinationWithin(tx, tenantId, type, location);
      const planned = this.plan(
        input.items.map((item) => ({ item, kept: null })),
        variants,
      );
      const price = this.priceOf(type, destination, planned, money(input.discount ?? 0), {
        byHand:
          type === FulfilmentType.Delivery && input.deliveryCharge != null
            ? money(input.deliveryCharge)
            : null,
      });
      return {
        items: planned.map((line, index) => ({
          variantId: line.row.variantId ?? '',
          productName: line.row.productName,
          listPrice: line.row.listPrice,
          unitPrice: line.row.unitPrice,
          quantity: line.row.quantity,
          itemTotal: price.lines[index]?.itemTotal ?? '0.00',
          deliveryCharge: price.lines[index]?.deliveryCharge ?? '0.00',
          advance: price.lines[index]?.advance ?? '0.00',
        })),
        deliveryZone: destination.zone
          ? {
              id: destination.zone.id,
              name: destination.zone.name,
              charge: destination.zone.charge,
            }
          : null,
        subtotal: price.subtotal,
        deliveryCharge: price.deliveryCharge,
        discount: price.discount,
        grandTotal: price.grandTotal,
        advanceDue: price.advanceDue,
        codAmount: price.codAmount,
        warnings: this.warningsOf(destination, planned, variants),
      };
    });
  }

  /** ORD-14: one order, everything its detail shows. */
  get(tenantId: string, orderId: string): Promise<OrderView> {
    return this.store.run(tenantId, async (tx) =>
      this.viewWithin(tx, tenantId, await this.find(tx, tenantId, orderId, false), []),
    );
  }

  /** ORD-13, ORD-45, ORD-52: a page of the shop's orders, newest first. */
  async list(tenantId: string, query: OrderListQuery): Promise<OrderPage> {
    const from = query.dateFrom !== undefined ? dhakaDayStart(query.dateFrom) : null;
    const before =
      query.dateTo !== undefined ? new Date(dhakaDayStart(query.dateTo).getTime() + DAY_MS) : null;
    if (from !== null && before !== null && from >= before) {
      throw new FieldsError([
        {
          field: 'dateTo',
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'PeriodEndsBeforeItStarts',
        },
      ]);
    }
    const search = query.q !== undefined ? (bdMobileNumber(query.q) ?? query.q) : null;
    return this.store.run(tenantId, async (tx) => {
      const { rows, total } = await this.store.listOrders(
        tx,
        tenantId,
        {
          status: query.status ?? null,
          paymentStatus: query.paymentStatus ?? null,
          fulfillmentStatus: query.fulfillmentStatus ?? null,
          source: query.source ?? null,
          cancelReason: query.cancelReason ?? null,
          from,
          before,
          search,
        },
        { offset: (query.page - 1) * query.limit, limit: query.limit },
      );
      return {
        orders: rows.map((row) => ({
          id: row.id,
          orderNumber: row.orderNumber,
          status: statusOf(row),
          paymentStatus: row.paymentStatus,
          fulfillmentStatus: row.fulfillmentStatus,
          source: row.source,
          fulfilmentType: row.fulfilmentType,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          tableRef: row.tableRef,
          items: row.items,
          grandTotal: row.grandTotal,
          codAmount: row.codAmount,
          cancelReason: row.cancelReason,
          holdUntil: row.holdUntil,
          createdAt: row.createdAt,
        })),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  /**
   * ORD-11: changes the customer's details, the items, the prices and the notes until the order ships. Changed items
   * hold their stock afresh in the same transaction, so an edit asking for more than is free is refused and the order
   * stays as it was; an item already on the order keeps the price, weight and delivery it was ordered at unless set
   * again. A changed thana takes its zone as it stands now.
   */
  async update(
    tenantId: string,
    orderId: string,
    input: UpdateOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const location = input.locationId != null ? await this.pricing.thanaOf(input.locationId) : null;
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId, true);
      this.refuseClosed(order);
      const merged = {
        customerName: input.customerName !== undefined ? input.customerName : order.customerName,
        phone: input.phone !== undefined ? input.phone : order.customerPhone,
        fulfilmentType: input.fulfilmentType ?? order.fulfilmentType,
        locationId: input.locationId !== undefined ? input.locationId : order.locationId,
        deliveryAddress:
          input.deliveryAddress !== undefined ? input.deliveryAddress : order.deliveryAddress,
        tableRef: input.tableRef !== undefined ? input.tableRef : order.tableRef,
        deliveryCharge:
          input.deliveryCharge !== undefined
            ? input.deliveryCharge
            : order.deliveryChargeByHand
              ? Number(order.deliveryCharge)
              : null,
      };
      const problems = fulfilmentProblems(merged);
      if (problems.length > 0) {
        throw new FieldsError(problems.map(({ field, problem }) => ({ field, problem })));
      }
      const type = merged.fulfilmentType;
      const delivering = type === FulfilmentType.Delivery;
      // A thana chosen again takes its zone as it stands now; otherwise the order keeps the zone it was priced with.
      const moved = delivering && (location !== null || order.fulfilmentType !== type);
      const destination: Destination = moved
        ? await this.destinationWithin(
            tx,
            tenantId,
            type,
            location ?? (await this.pricing.thanaOf(merged.locationId ?? 0)),
          )
        : delivering
          ? {
              location: null,
              zone:
                order.deliveryZoneId !== null &&
                order.deliveryZoneName !== null &&
                order.zoneCharge !== null
                  ? {
                      id: order.deliveryZoneId,
                      name: order.deliveryZoneName,
                      charge: order.zoneCharge,
                      noDelivery: false,
                    }
                  : null,
              extraChargePerKg: order.extraChargePerKg,
            }
          : { location: null, zone: null, extraChargePerKg: '0.00' };

      const current = await this.store.listLines(tx, tenantId, [order.id]);
      const byId = new Map(current.map((line) => [line.id, line]));
      const entries: ItemEntry[] = (
        input.items ??
        current.map((line) => ({
          lineId: line.id,
          variantId: line.variantId ?? '',
          quantity: Number(line.quantity),
        }))
      ).map((item, index) => {
        if (!('lineId' in item) || item.lineId === undefined) return { item, kept: null };
        const kept = byId.get(item.lineId);
        if (!kept) {
          throw new FieldsError([
            {
              field: `items.${String(index)}.lineId`,
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'OrderItemNotFound',
            },
          ]);
        }
        if (kept.variantId !== item.variantId) {
          throw new ApiError('conflict', 'OrderItemChanged', { lineId: kept.id });
        }
        return { item, kept };
      });
      const variants = await this.pricing.variantsWithin(
        tx,
        tenantId,
        entries.map((entry) => entry.item.variantId),
      );
      const planned = this.plan(entries, variants);
      const byHand = delivering && merged.deliveryCharge !== null;
      const price = this.priceOf(
        type,
        destination,
        planned,
        input.discount !== undefined ? money(input.discount) : order.discount,
        { byHand: byHand ? money(merged.deliveryCharge ?? 0) : null },
      );

      const now = new Date();
      const customerId =
        merged.phone !== null ? await this.customers.claimWithin(tx, tenantId, merged.phone) : null;
      const patch: OrderPatch = {
        fulfilmentType: type,
        customerId,
        customerName: merged.customerName,
        customerPhone: merged.phone,
        locationId: delivering ? merged.locationId : null,
        deliveryAddress: delivering ? merged.deliveryAddress : null,
        tableRef: type === FulfilmentType.DineIn ? merged.tableRef : null,
        ...(moved || !delivering ? this.zoneColumns(destination) : {}),
        ...totalsOf(price),
        deliveryChargeByHand: byHand,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };
      const updated = await this.store.updateOrder(tx, tenantId, order.id, patch);

      const rows = this.rowsOf(planned, price);
      if (input.items !== undefined) {
        const keptIds = new Set(planned.flatMap((line) => (line.kept ? [line.kept.id] : [])));
        const fresh: NewOrderLine[] = [];
        for (const [index, row] of rows.entries()) {
          const kept = planned[index]?.kept ?? null;
          if (kept) {
            await this.store.updateLine(tx, tenantId, kept.id, {
              position: row.position,
              unitPrice: row.unitPrice,
              quantity: row.quantity,
              itemDiscount: row.itemDiscount,
              itemTotal: row.itemTotal,
              deliveryCharge: row.deliveryCharge,
              advance: row.advance,
              capturedValues: row.capturedValues,
            });
          } else {
            fresh.push(row);
          }
        }
        await this.store.insertLines(tx, tenantId, order.id, fresh);
        const lines = await this.store.listLines(tx, tenantId, [order.id]);
        const held = lines.filter((line) => keptIds.has(line.id) || !byId.has(line.id));
        await this.reservations.replaceForOrder(
          tx,
          tenantId,
          { orderId: order.id, awaitingPayment: false, lines: this.holdsOf(held) },
          now,
        );
        // A released hold goes with the item it was for (migration 0083).
        await this.store.deleteLines(
          tx,
          tenantId,
          current.filter((line) => !keptIds.has(line.id)).map((line) => line.id),
        );
      } else {
        for (const [index, row] of rows.entries()) {
          const kept = planned[index]?.kept;
          if (kept) {
            await this.store.updateLine(tx, tenantId, kept.id, {
              itemTotal: row.itemTotal,
              deliveryCharge: row.deliveryCharge,
              advance: row.advance,
            });
          }
        }
      }

      const deliveryChanged =
        byHand && (!order.deliveryChargeByHand || order.deliveryCharge !== price.deliveryCharge);
      await this.store.insertHistory(tx, tenantId, [
        ...this.byHandHistory(order.id, planned, who),
        ...(deliveryChanged
          ? [
              this.deliveryHistory(
                order.id,
                this.workedOut(type, destination, planned, price),
                price,
                who,
              ),
            ]
          : []),
      ]);
      await this.customers.recountWithin(tx, tenantId, [order.customerId, customerId]);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderUpdated,
        { type: 'order', id: order.id },
        { orderNumber: order.orderNumber, fields: Object.keys(input) },
      );
      return this.viewWithin(
        tx,
        tenantId,
        updated,
        this.warningsOf(destination, planned, variants),
      );
    });
  }

  /**
   * ORD-51: one call to the customer. Any call ends a call-back hold; a confirming call confirms a pending order; a call
   * back later holds it until that time; a cancelling call cancels it with its reason (ORD-52), letting its stock go.
   */
  async logCall(
    tenantId: string,
    orderId: string,
    input: LogCallInput,
    actor: CatalogueActor,
    now = new Date(),
  ): Promise<OrderView> {
    if (input.callBackAt !== undefined && input.callBackAt.getTime() <= now.getTime()) {
      throw new FieldsError([
        {
          field: 'callBackAt',
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'CallBackInPast',
        },
      ]);
    }
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId, true);
      if (order.statusOverride === StatusOverride.Cancelled) {
        throw new ApiError('conflict', 'OrderIsCancelled', {});
      }
      if (input.outcome === CallOutcome.Cancelled && this.shipped(order)) {
        throw new ApiError('conflict', 'OrderShippedReturnInstead', {});
      }
      await this.store.insertCall(tx, tenantId, {
        orderId: order.id,
        outcome: input.outcome,
        callBackAt: input.callBackAt ?? null,
        note: input.note ?? null,
        calledBy: who.id,
      });
      const history: NewOrderHistory[] = [];
      const patch: OrderPatch = {};
      // The call-back hold ends with the next call, whatever it says.
      let override = order.statusOverride;
      if (order.holdUntil !== null) {
        override = null;
        Object.assign(patch, { statusOverride: null, holdUntil: null });
      }
      if (input.outcome === CallOutcome.Confirmed && order.confirmedAt === null) {
        Object.assign(patch, { confirmedAt: now, confirmedBy: who.id });
        history.push({
          orderId: order.id,
          field: OrderHistoryField.Confirmed,
          oldValue: null,
          newValue: OrderStatus.Confirmed,
          note: input.note ?? null,
          changedBy: who.id,
        });
      }
      if (input.outcome === CallOutcome.CallBackLater && input.callBackAt !== undefined) {
        override = StatusOverride.Hold;
        Object.assign(patch, { statusOverride: StatusOverride.Hold, holdUntil: input.callBackAt });
      }
      if (override !== order.statusOverride) {
        history.push({
          orderId: order.id,
          field: OrderHistoryField.StatusOverride,
          oldValue: order.statusOverride,
          newValue: override,
          note: input.note ?? null,
          changedBy: who.id,
        });
      }
      let updated = await this.store.updateOrder(tx, tenantId, order.id, patch);
      await this.store.insertHistory(tx, tenantId, history);
      if (input.outcome === CallOutcome.Cancelled && input.reason !== undefined) {
        updated = await this.cancelWithin(
          tx,
          tenantId,
          updated,
          input.reason,
          input.note ?? null,
          who,
          now,
        );
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderCallLogged,
        { type: 'order', id: order.id },
        {
          orderNumber: order.orderNumber,
          outcome: input.outcome,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        },
      );
      return this.viewWithin(tx, tenantId, updated, []);
    });
  }

  /** ORD-10, ORD-52: cancels an order that has not shipped, with its reason, letting its stock go. Final. */
  async cancel(
    tenantId: string,
    orderId: string,
    input: CancelOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId, true);
      if (order.statusOverride === StatusOverride.Cancelled) {
        throw new ApiError('conflict', 'OrderIsCancelled', {});
      }
      if (this.shipped(order)) throw new ApiError('conflict', 'OrderShippedReturnInstead', {});
      const updated = await this.cancelWithin(
        tx,
        tenantId,
        order,
        input.reason,
        input.note ?? null,
        who,
        new Date(),
      );
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderStatusChanged,
        { type: 'order', id: order.id },
        { orderNumber: order.orderNumber, to: StatusOverride.Cancelled, reason: input.reason },
      );
      return this.viewWithin(tx, tenantId, updated, []);
    });
  }

  /** ORD-41: holds the order, puts it in review, or (null) clears either; the worked-out status shows again. */
  async override(
    tenantId: string,
    orderId: string,
    input: OverrideOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId, true);
      if (order.statusOverride === StatusOverride.Cancelled) {
        throw new ApiError('conflict', 'OrderIsCancelled', {});
      }
      const to = input.override as StatusOverride | null;
      if (to === order.statusOverride && order.holdUntil === null) {
        return this.viewWithin(tx, tenantId, order, []);
      }
      const updated = await this.store.updateOrder(tx, tenantId, order.id, {
        statusOverride: to,
        holdUntil: null,
      });
      await this.store.insertHistory(tx, tenantId, [
        {
          orderId: order.id,
          field: OrderHistoryField.StatusOverride,
          oldValue: order.statusOverride,
          newValue: to,
          note: input.note ?? null,
          changedBy: who.id,
        },
      ]);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderStatusChanged,
        { type: 'order', id: order.id },
        { orderNumber: order.orderNumber, from: order.statusOverride, to },
      );
      return this.viewWithin(tx, tenantId, updated, []);
    });
  }

  /**
   * ORD-12, agreed 2026-10-29: deletes an order that has not shipped and has no verified payment, letting its stock go;
   * its number is never given again, and the activity log keeps its summary. Anything else is cancelled or returned.
   */
  async delete(tenantId: string, orderId: string, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId, true);
      if (this.shipped(order) || PAID.includes(order.paymentStatus)) {
        throw new ApiError('conflict', 'OrderCannotBeDeleted', {});
      }
      await this.reservations.releaseOrder(tx, tenantId, order.id);
      try {
        await this.store.deleteOrder(tx, tenantId, order.id);
      } catch (error) {
        if (error instanceof OrderKept) throw new ApiError('conflict', 'OrderCannotBeDeleted', {});
        throw error;
      }
      await this.customers.recountWithin(tx, tenantId, [order.customerId]);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderDeleted,
        { type: 'order', id: order.id },
        {
          orderNumber: order.orderNumber,
          grandTotal: order.grandTotal,
          status: statusOf(order),
        },
      );
    });
  }

  /** LIF-16: every order of the shop with its items, oldest first, for its data export. */
  exportAll(tenantId: string): Promise<{ order: OrderRecord; items: OrderLineRecord[] }[]> {
    return this.store.run(tenantId, async (tx) => {
      const all: { order: OrderRecord; items: OrderLineRecord[] }[] = [];
      let after: { createdAt: Date; id: string } | null = null;
      for (;;) {
        const batch = await this.store.listForExport(tx, tenantId, after, EXPORT_BATCH);
        const items = new Map<string, OrderLineRecord[]>();
        for (const line of await this.store.listLines(
          tx,
          tenantId,
          batch.map((order) => order.id),
        )) {
          items.set(line.orderId, [...(items.get(line.orderId) ?? []), line]);
        }
        all.push(...batch.map((order) => ({ order, items: items.get(order.id) ?? [] })));
        const last = batch.at(-1);
        if (!last || batch.length < EXPORT_BATCH) return all;
        after = { createdAt: last.createdAt, id: last.id };
      }
    });
  }

  // --- Building blocks ---

  private async find(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    lock: boolean,
  ): Promise<OrderRecord> {
    const order = await this.store.findOrder(tx, tenantId, orderId, lock);
    if (!order) throw new ApiError('not_found', 'OrderNotFound', {});
    return order;
  }

  /** ORD-52: goods that left the shop come back by a return, never by a cancellation or an edit. */
  private shipped(order: OrderRecord): boolean {
    return SHIPPED_FULFILLMENT.includes(order.fulfillmentStatus);
  }

  /** ORD-11: a cancelled order is final, and a shipped one changes by a return. */
  private refuseClosed(order: OrderRecord): void {
    if (order.statusOverride === StatusOverride.Cancelled) {
      throw new ApiError('conflict', 'OrderIsCancelled', {});
    }
    if (this.shipped(order)) throw new ApiError('conflict', 'OrderHasShipped', {});
  }

  /** ORD-10, ORD-52: lets the order's stock go and marks it cancelled with its reason, in the caller's transaction. */
  private async cancelWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    reason: CancelReason,
    note: string | null,
    who: ResolvedActor,
    now: Date,
  ): Promise<OrderRecord> {
    await this.reservations.releaseOrder(tx, tenantId, order.id);
    const updated = await this.store.updateOrder(tx, tenantId, order.id, {
      statusOverride: StatusOverride.Cancelled,
      holdUntil: null,
      cancelReason: reason,
      cancelNote: note,
      cancelledAt: now,
    });
    await this.store.insertHistory(tx, tenantId, [
      {
        orderId: order.id,
        field: OrderHistoryField.StatusOverride,
        oldValue: order.statusOverride,
        newValue: StatusOverride.Cancelled,
        note: note ?? reason,
        changedBy: who.id,
      },
    ]);
    await this.customers.recountWithin(tx, tenantId, [order.customerId]);
    return updated;
  }

  /** ORD-05: the order, not yet numbered, with a tracking ID no other order on the platform has. */
  private async insertOrder(
    tx: Transaction,
    values: Omit<InsertOrder, 'trackingId' | 'orderNumber'>,
  ): Promise<UnnumberedOrder> {
    for (let draw = 0; draw < TRACKING_DRAWS; draw += 1) {
      const order = await this.store.insertOrder(tx, { ...values, trackingId: newTrackingId() });
      if (order) return order;
    }
    throw new Error('no free tracking ID after several draws');
  }

  /** DLV-02, MNU-04: a delivery's thana, zone and rate per kg, read now; nothing for a takeaway or dine-in. */
  private async destinationWithin(
    tx: Transaction,
    tenantId: string,
    type: FulfilmentType,
    location: ResolvedZoneView['location'] | null,
  ): Promise<Destination> {
    if (type !== FulfilmentType.Delivery || location === null) {
      return { location: null, zone: null, extraChargePerKg: '0.00' };
    }
    const { zone, extraChargePerKg } = await this.pricing.deliveryWithin(tx, tenantId, location);
    return {
      location,
      zone: { id: zone.id, name: zone.label, charge: zone.charge, noDelivery: zone.noDelivery },
      extraChargePerKg,
    };
  }

  private zoneColumns(
    destination: Destination,
  ): Pick<OrderRecord, 'deliveryZoneId' | 'deliveryZoneName' | 'zoneCharge' | 'extraChargePerKg'> {
    return {
      deliveryZoneId: destination.zone?.id ?? null,
      deliveryZoneName: destination.zone?.name ?? null,
      zoneCharge: destination.zone?.charge ?? null,
      extraChargePerKg: destination.extraChargePerKg,
    };
  }

  /**
   * ORD-46, ATR-08, ATR-09, UOM-04: each item as it will be stored: an item already on the order keeps its snapshot; a
   * new one is read from its variant now. Every problem is refused at once, naming its field.
   */
  private plan(entries: ItemEntry[], variants: Map<string, OrderableVariant>): PlannedLine[] {
    const problems: InvalidField[] = [];
    const planned: PlannedLine[] = [];
    entries.forEach(({ item, kept }, index) => {
      const at = (field: string) => `items.${String(index)}.${field}`;
      const variant = variants.get(item.variantId) ?? null;
      if (!kept && !variant) {
        problems.push({
          field: at('variantId'),
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'ProductNotFound',
        });
        return;
      }
      const stockUnit = kept?.stockUnit ?? variant?.stockUnit;
      const packAmount = kept ? kept.packAmount : (variant?.packAmount ?? null);
      const quantity = quantityText(item.quantity);
      const whole = milli(quantity) % 1000 === 0;
      const measured = stockUnit !== undefined && MEASURED_STOCK_UNITS.includes(stockUnit);
      if (!whole && (packAmount !== null || !measured)) {
        problems.push({ field: at('quantity'), problem: FieldProblemCode.NotWholeNumber });
      }
      let captured: LineCapturedSnapshot[] = kept?.capturedValues ?? [];
      if (item.captured !== undefined) {
        const asked = new Map((variant?.captured ?? []).map((row) => [row.attributeId, row]));
        captured = item.captured.flatMap((entry, position) => {
          const attribute = asked.get(entry.attributeId);
          if (!attribute) {
            problems.push({
              field: at(`captured.${String(position)}.attributeId`),
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'NotAskedWhenOrdering',
            });
            return [];
          }
          if (
            attribute.dataType === AttributeDataType.NumberWithUnit &&
            !Number.isFinite(Number(entry.value))
          ) {
            problems.push({
              field: at(`captured.${String(position)}.value`),
              problem: FieldProblemCode.NotANumber,
            });
          }
          return [{ attributeId: attribute.attributeId, name: attribute.name, value: entry.value }];
        });
      }
      const unitPrice =
        item.unitPrice !== undefined
          ? money(item.unitPrice)
          : (kept?.unitPrice ?? variant?.price ?? '0.00');
      const itemDiscount =
        item.itemDiscount !== undefined ? money(item.itemDiscount) : (kept?.itemDiscount ?? '0.00');
      const snapshot = kept
        ? {
            productId: kept.productId,
            variantId: kept.variantId,
            productName: kept.productName,
            sku: kept.sku,
            attributeValues: kept.attributeValues,
            thumbnailMediaId: kept.thumbnailMediaId,
            thumbnailUrl: kept.thumbnailUrl,
            stockUnit: kept.stockUnit,
            listPrice: kept.listPrice,
            weightKg: kept.weightKg,
            ownDeliveryCharge: kept.ownDeliveryCharge,
            deliveryMode: kept.deliveryMode,
            paymentPolicy: kept.paymentPolicy,
            policyAdvance: kept.policyAdvance,
          }
        : variant && {
            productId: variant.productId,
            variantId: variant.variantId,
            productName: variant.productName,
            sku: variant.sku,
            attributeValues: variant.attributes,
            thumbnailMediaId: variant.thumbnail?.mediaId ?? null,
            thumbnailUrl: variant.thumbnail?.url ?? null,
            stockUnit: variant.stockUnit,
            listPrice: variant.price,
            weightKg: variant.weightKg,
            ownDeliveryCharge: variant.deliveryCharge,
            deliveryMode: variant.deliveryMode,
            paymentPolicy: variant.paymentPolicy,
            policyAdvance: variant.advanceAmount,
          };
      if (!snapshot) return;
      planned.push({
        row: {
          ...snapshot,
          capturedValues: captured,
          unitPrice,
          quantity,
          packAmount,
          itemDiscount,
        },
        pricing: {
          unitPrice,
          quantity,
          itemDiscount,
          weightKg: snapshot.weightKg,
          ownDeliveryCharge: snapshot.ownDeliveryCharge,
          deliveryMode: snapshot.deliveryMode,
          paymentPolicy: snapshot.paymentPolicy,
          policyAdvance: snapshot.policyAdvance,
        },
        kept,
      });
    });
    if (problems.length > 0) throw new FieldsError(problems);
    return planned;
  }

  private priceOf(
    type: FulfilmentType,
    destination: Destination,
    planned: PlannedLine[],
    discount: string,
    delivery: { byHand: string | null },
  ): OrderPrice {
    return this.pricing.price({
      fulfilmentType: type,
      zoneCharge: destination.zone?.charge ?? null,
      extraChargePerKg: destination.extraChargePerKg,
      lines: planned.map((line) => line.pricing),
      discount,
      deliveryChargeByHand: delivery.byHand,
    });
  }

  /** ORD-06: the delivery charge the order would have had, had staff not set one by hand. */
  private workedOut(
    type: FulfilmentType,
    destination: Destination,
    planned: PlannedLine[],
    price: OrderPrice,
  ): string {
    return this.priceOf(type, destination, planned, price.discount, { byHand: null })
      .deliveryCharge;
  }

  private rowsOf(planned: PlannedLine[], price: OrderPrice): NewOrderLine[] {
    return planned.map((line, index) => {
      const priced = price.lines[index];
      if (!priced) throw new Error('every planned line is priced');
      return {
        ...line.row,
        position: index,
        itemTotal: priced.itemTotal,
        deliveryCharge: priced.deliveryCharge,
        advance: priced.advance,
      };
    });
  }

  /** PRD-07, INV-15: what the order's items hold; a made-to-order item holds nothing (the reservations decide). */
  private holdsOf(
    lines: OrderLineRecord[],
  ): { orderLineId: string; variantId: string; quantity: string }[] {
    return lines.flatMap((line) =>
      line.variantId !== null
        ? [{ orderLineId: line.id, variantId: line.variantId, quantity: line.quantity }]
        : [],
    );
  }

  /** ORD-06: each price staff set by hand, new or changed, kept in the order's history. */
  private byHandHistory(
    orderId: string,
    planned: PlannedLine[],
    who: ResolvedActor,
  ): NewOrderHistory[] {
    return planned.flatMap((line) => {
      const { unitPrice, listPrice, productName } = line.row;
      const previous = line.kept ? line.kept.unitPrice : listPrice;
      if (unitPrice === previous) return [];
      return [
        {
          orderId,
          field: OrderHistoryField.UnitPrice,
          oldValue: previous,
          newValue: unitPrice,
          note: productName,
          changedBy: who.id,
        },
      ];
    });
  }

  private deliveryHistory(
    orderId: string,
    workedOut: string,
    price: OrderPrice,
    who: ResolvedActor,
  ): NewOrderHistory {
    return {
      orderId,
      field: OrderHistoryField.DeliveryCharge,
      oldValue: workedOut,
      newValue: price.deliveryCharge,
      note: null,
      changedBy: who.id,
    };
  }

  /** DLV-06, DLV-07: where the shop does not deliver, or a product may not go; staff are told and may go ahead. */
  private warningsOf(
    destination: Destination,
    planned: PlannedLine[],
    variants: Map<string, OrderableVariant>,
  ): OrderWarning[] {
    const zone = destination.zone;
    if (zone === null) return [];
    const warnings: OrderWarning[] = [];
    if (zone.noDelivery) {
      warnings.push({ code: 'zone_no_delivery', zone: zone.name, productName: null });
    }
    const named = new Set<string>();
    for (const line of planned) {
      const variant = line.row.variantId !== null ? variants.get(line.row.variantId ?? '') : null;
      if (!variant || named.has(variant.productId)) continue;
      if (variant.deliveryZoneIds.length > 0 && !variant.deliveryZoneIds.includes(zone.id)) {
        named.add(variant.productId);
        warnings.push({
          code: 'product_not_delivered_here',
          zone: zone.name,
          productName: variant.productName,
        });
      }
    }
    return warnings;
  }

  /**
   * ORD-02, PRD-06, ATR-07, D4-2, DLV-06, DLV-07: what a shopper may not order, refused before anything is held, each
   * naming its product: one not on sale, one needing an advance (until Phase 5's payments), and an address the shop or
   * a product does not deliver to -- what staff are only warned of. Stock is checked as it is held, so a sold-out item
   * is refused there (ATR-07).
   */
  private refuseForShopper(
    destination: Destination,
    planned: PlannedLine[],
    variants: Map<string, OrderableVariant>,
  ): void {
    for (const line of planned) {
      const variant = variants.get(line.row.variantId ?? '');
      if (!variant) continue;
      const named = { productId: variant.productId, variantId: variant.variantId };
      const product = { product: variant.productName };
      if (!variant.active) {
        throw new ApiError(
          'conflict',
          'ProductNotOnSale',
          { reason: 'product_unavailable', ...named },
          undefined,
          product,
        );
      }
      if (variant.paymentPolicy !== PaymentPolicy.None) {
        throw new ApiError(
          'conflict',
          'ProductNeedsAdvance',
          { reason: 'advance_needed', ...named },
          undefined,
          product,
        );
      }
    }
    const [warning] = this.warningsOf(destination, planned, variants);
    if (warning?.code === 'zone_no_delivery') {
      throw new ApiError('conflict', 'ShopDoesNotDeliverHere', {
        reason: warning.code,
        zone: warning.zone,
      });
    }
    if (warning?.code === 'product_not_delivered_here') {
      throw new ApiError(
        'conflict',
        'ProductNotDeliveredHere',
        { reason: warning.code, zone: warning.zone },
        undefined,
        { product: warning.productName ?? '' },
      );
    }
  }

  /**
   * ORD-14: the order with its items, calls, history and payments, and who made each, in the caller's transaction;
   * with what it was just told (warnings, QTA-03's prompt) when it was just made or moved.
   */
  async viewWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    warnings: OrderWarning[],
    limitPrompt: OrderView['limitPrompt'] = null,
  ): Promise<OrderView> {
    const [lines, calls, history, payments] = [
      await this.store.listLines(tx, tenantId, [order.id]),
      await this.store.listCalls(tx, tenantId, order.id),
      await this.store.listHistory(tx, tenantId, order.id),
      await this.store.listPayments(tx, tenantId, order.id),
    ];
    const names = await this.staff.namesWithin(tx, tenantId, [
      ...calls.flatMap((call) => (call.calledBy !== null ? [call.calledBy] : [])),
      ...history.flatMap((row) => (row.changedBy !== null ? [row.changedBy] : [])),
      ...payments.flatMap((row) => (row.verifiedBy !== null ? [row.verifiedBy] : [])),
      ...(order.confirmedBy !== null ? [order.confirmedBy] : []),
      ...(order.createdBy !== null ? [order.createdBy] : []),
    ]);
    const person = (id: string | null): OrderPerson | null =>
      id === null ? null : { id, name: names.get(id) ?? null };
    const location =
      order.locationId !== null ? await this.locations.thana(order.locationId) : null;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      trackingId: order.trackingId,
      source: order.source,
      status: statusOf(order),
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      override: order.statusOverride,
      holdUntil: order.holdUntil,
      confirmedAt: order.confirmedAt,
      confirmedBy: person(order.confirmedBy),
      fulfilmentType: order.fulfilmentType,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      location,
      deliveryAddress: order.deliveryAddress,
      tableRef: order.tableRef,
      deliveryZone:
        order.deliveryZoneId !== null &&
        order.deliveryZoneName !== null &&
        order.zoneCharge !== null
          ? { id: order.deliveryZoneId, name: order.deliveryZoneName, charge: order.zoneCharge }
          : null,
      extraChargePerKg: order.extraChargePerKg,
      cancelReason: order.cancelReason,
      cancelNote: order.cancelNote,
      cancelledAt: order.cancelledAt,
      subtotal: order.subtotal,
      deliveryCharge: order.deliveryCharge,
      deliveryChargeByHand: order.deliveryChargeByHand,
      discount: order.discount,
      grandTotal: order.grandTotal,
      advanceDue: order.advanceDue,
      codAmount: order.codAmount,
      due: order.due,
      courierName: order.courierName,
      trackingCode: order.trackingCode,
      trackingLink: order.trackingLink,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      handledAt: order.handledAt,
      notes: order.notes,
      shopperNote: order.shopperNote,
      createdBy: person(order.createdBy),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: lines.map(itemView),
      calls: calls.map((call) => ({
        id: call.id,
        outcome: call.outcome,
        callBackAt: call.callBackAt,
        note: call.note,
        by: person(call.calledBy),
        at: call.calledAt,
      })),
      unansweredCalls: calls.filter((call) => call.outcome === CallOutcome.NoAnswer).length,
      history: history.map((row) => ({
        field: row.field,
        from: row.oldValue,
        to: row.newValue,
        note: row.note,
        by: person(row.changedBy),
        at: row.changedAt,
      })),
      payments: payments.map((row) => ({
        id: row.id,
        method: row.method,
        amount: row.amount,
        senderNumber: row.senderNumber,
        transactionId: row.transactionId,
        verifiedBy: person(row.verifiedBy),
        verifiedAt: row.verifiedAt,
      })),
      warnings,
      limitPrompt,
    };
  }
}
