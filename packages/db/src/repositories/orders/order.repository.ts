import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  ORDER_STATUS_RULES,
  type CancelReason,
  type FulfillmentStatus,
  type OrderPaymentStatus,
  type OrderSource,
  type OrderStatus,
} from '@lytronix/validators';
import {
  orderCalls,
  orderCounters,
  orderLines,
  orderPayments,
  orders,
  orderStatusHistory,
  type InsertOrder,
  type InsertOrderLine,
  type InsertOrderPayment,
  type SelectOrder,
  type SelectOrderCall,
  type SelectOrderHistory,
  type SelectOrderLine,
  type SelectOrderPayment,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';
import { escapeLike } from '../like';
import { isEmptyPatch } from '../patch';

/** ORD-13, ORD-45, ORD-52: what the order list is narrowed by; null leaves a filter out. */
export interface OrderListFilter {
  status: OrderStatus | null;
  paymentStatus: OrderPaymentStatus | null;
  fulfillmentStatus: FulfillmentStatus | null;
  source: OrderSource | null;
  cancelReason: CancelReason | null;
  /** Made at or after this moment, and before `before`. */
  from: Date | null;
  before: Date | null;
  /** Part of the customer's name or phone, or of the order number. */
  search: string | null;
}

/**
 * An order with its number. Every committed order has one (migration 0083's deferred check); only the transaction
 * making an order sees it without, between its insert and `numberOrder`.
 */
export type OrderRow = Omit<SelectOrder, 'orderNumber'> & { orderNumber: string };

/** An order as its list shows it, with how many items it holds. */
export interface OrderSummaryRow extends OrderRow {
  items: number;
}

function numbered(row: SelectOrder): OrderRow {
  const { orderNumber } = row;
  if (orderNumber === null) throw new Error('an order is numbered before it is read');
  return { ...row, orderNumber };
}

/** What an order's update may change. */
export type OrderPatch = Partial<
  Omit<
    SelectOrder,
    'id' | 'tenantId' | 'orderNumber' | 'trackingId' | 'source' | 'createdAt' | 'createdBy'
  >
>;

/** What an item's update may change. */
export type OrderLinePatch = Partial<
  Pick<
    SelectOrderLine,
    | 'position'
    | 'unitPrice'
    | 'quantity'
    | 'itemDiscount'
    | 'itemTotal'
    | 'deliveryCharge'
    | 'advance'
    | 'capturedValues'
    | 'returnedQuantity'
  >
>;

export type NewOrderLine = Omit<InsertOrderLine, 'tenantId' | 'orderId'>;
export type NewOrderPayment = Omit<InsertOrderPayment, 'id' | 'tenantId' | 'verifiedAt'>;
export type NewOrderHistory = Omit<
  typeof orderStatusHistory.$inferInsert,
  'id' | 'tenantId' | 'changedAt'
>;
export type NewOrderCall = Omit<typeof orderCalls.$inferInsert, 'id' | 'tenantId' | 'calledAt'>;

/**
 * ORD-41: the visible status in SQL, built from the same rows `visibleOrderStatus` reads, so the list's filter and
 * every response always agree. A manual override shows first; the last rule holds always.
 */
function visibleStatusSql(): SQL {
  const branches = ORDER_STATUS_RULES.map((rule) => {
    const conditions: SQL[] = [];
    if (rule.fulfillment) conditions.push(inArray(orders.fulfillmentStatus, [...rule.fulfillment]));
    if (rule.payment) conditions.push(inArray(orders.paymentStatus, [...rule.payment]));
    if (rule.confirmed) conditions.push(isNotNull(orders.confirmedAt));
    const status = sql`${rule.status}::text`;
    return conditions.length > 0
      ? sql`WHEN ${and(...conditions)} THEN ${status}`
      : sql`ELSE ${status}`;
  });
  return sql`(CASE WHEN ${orders.statusOverride} IS NOT NULL THEN ${orders.statusOverride}::text ${sql.join(branches, sql` `)} END)`;
}

// ORD-01 to ORD-14, ORD-51: a shop's orders, their items, history and calls, and the daily counters that number them.
// Every method sets the shop's tenant context. The database keeps an order's number, tracking ID and source, refuses
// to delete one that shipped or was paid, and keeps its history and calls as written (migration 0083).
export class OrderRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * ORD-04: the shop's next number on this day (Asia/Dhaka). The day's counter row stays locked until the transaction
   * ends, so two orders made at once take consecutive numbers; a rollback gives the number back.
   */
  async nextNumber(tx: Transaction, tenantId: string, day: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(orderCounters)
      .values({ tenantId, day, lastNumber: 1 })
      .onConflictDoUpdate({
        target: [orderCounters.tenantId, orderCounters.day],
        set: { lastNumber: sql`${orderCounters.lastNumber} + 1` },
      })
      .returning({ lastNumber: orderCounters.lastNumber });
    if (!row) throw new Error('the order counter returned no number');
    return row.lastNumber;
  }

  /**
   * ORD-05: the order, still without its number, or null when its tracking ID is already taken anywhere on the platform
   * (draw another).
   */
  async insertOrder(tx: Transaction, values: InsertOrder): Promise<SelectOrder | null> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx
      .insert(orders)
      .values(values)
      .onConflictDoNothing({ target: orders.trackingId })
      .returning();
    return row ?? null;
  }

  /** One order; `lock` holds its row until the transaction ends. */
  async findOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<OrderRow | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const query = tx
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)));
    const [row] = lock ? await query.for('update') : await query;
    return row ? numbered(row) : null;
  }

  /** ORD-17: the shop's order with this tracking ID, if it has one. */
  async findByTrackingId(
    tx: Transaction,
    tenantId: string,
    trackingId: string,
  ): Promise<OrderRow | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.trackingId, trackingId)));
    return row ? numbered(row) : null;
  }

  /** ORD-04: gives a new order its number, once; the database keeps it from then on. */
  async numberOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    orderNumber: string,
  ): Promise<OrderRow> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(orders)
      .set({ orderNumber })
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
      .returning();
    if (!row) throw new Error('the order to number is gone');
    return numbered(row);
  }

  /** Changes the order and marks it updated, even when only its items changed (an empty patch). */
  async updateOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: OrderPatch,
  ): Promise<OrderRow> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(orders)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
      .returning();
    if (!row) throw new Error('the order to update is gone');
    return numbered(row);
  }

  /** ORD-12: the order with its items, history and calls. The database refuses one that shipped or was paid. */
  async deleteOrder(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)));
  }

  async insertLines(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    rows: NewOrderLine[],
  ): Promise<SelectOrderLine[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return [];
    return tx
      .insert(orderLines)
      .values(rows.map((row) => ({ ...row, tenantId, orderId })))
      .returning();
  }

  async updateLine(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: OrderLinePatch,
  ): Promise<void> {
    if (isEmptyPatch(patch)) return;
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(orderLines)
      .set(patch)
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, id)));
  }

  async deleteLines(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return;
    await tx
      .delete(orderLines)
      .where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.id, ids)));
  }

  /** These orders' items, each order's in the order they were entered. */
  async listLines(
    tx: Transaction,
    tenantId: string,
    orderIds: string[],
  ): Promise<SelectOrderLine[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (orderIds.length === 0) return [];
    return tx
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.orderId, orderIds)))
      .orderBy(asc(orderLines.orderId), asc(orderLines.position));
  }

  async insertHistory(tx: Transaction, tenantId: string, rows: NewOrderHistory[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return;
    await tx.insert(orderStatusHistory).values(rows.map((row) => ({ ...row, tenantId })));
  }

  /** ORD-14: the order's history, oldest first. */
  async listHistory(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectOrderHistory[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(orderStatusHistory)
      .where(
        and(eq(orderStatusHistory.tenantId, tenantId), eq(orderStatusHistory.orderId, orderId)),
      )
      .orderBy(asc(orderStatusHistory.changedAt), asc(orderStatusHistory.id));
  }

  async insertCall(
    tx: Transaction,
    tenantId: string,
    values: NewOrderCall,
  ): Promise<SelectOrderCall> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(orderCalls)
      .values({ ...values, tenantId })
      .returning();
    if (!row) throw new Error('insert returned no call row');
    return row;
  }

  /** ORD-51: the calls made about the order, oldest first. */
  async listCalls(tx: Transaction, tenantId: string, orderId: string): Promise<SelectOrderCall[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(orderCalls)
      .where(and(eq(orderCalls.tenantId, tenantId), eq(orderCalls.orderId, orderId)))
      .orderBy(asc(orderCalls.calledAt), asc(orderCalls.id));
  }

  /** ORD-13: a page of the shop's orders, newest first, with how many match in all. */
  async listOrders(
    tx: Transaction,
    tenantId: string,
    filter: OrderListFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: OrderSummaryRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions: (SQL | undefined)[] = [eq(orders.tenantId, tenantId)];
    if (filter.status !== null) conditions.push(sql`${visibleStatusSql()} = ${filter.status}`);
    if (filter.paymentStatus !== null)
      conditions.push(eq(orders.paymentStatus, filter.paymentStatus));
    if (filter.fulfillmentStatus !== null)
      conditions.push(eq(orders.fulfillmentStatus, filter.fulfillmentStatus));
    if (filter.source !== null) conditions.push(eq(orders.source, filter.source));
    if (filter.cancelReason !== null) conditions.push(eq(orders.cancelReason, filter.cancelReason));
    if (filter.from !== null) conditions.push(gte(orders.createdAt, filter.from));
    if (filter.before !== null) conditions.push(lt(orders.createdAt, filter.before));
    if (filter.search !== null) {
      const pattern = `%${escapeLike(filter.search)}%`;
      conditions.push(
        or(
          ilike(orders.customerName, pattern),
          ilike(orders.customerPhone, pattern),
          ilike(orders.orderNumber, pattern),
        ),
      );
    }
    const where = and(...conditions);
    const items = tx
      .select({ orderId: orderLines.orderId, items: sql<number>`count(*)::int`.as('items') })
      .from(orderLines)
      .where(eq(orderLines.tenantId, tenantId))
      .groupBy(orderLines.orderId)
      .as('items');
    const rows = await tx
      .select({ order: orders, items: sql<number>`coalesce(${items.items}, 0)` })
      .from(orders)
      .leftJoin(items, eq(items.orderId, orders.id))
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .offset(page.offset)
      .limit(page.limit);
    const counted = await tx.select({ total: count() }).from(orders).where(where);
    return {
      rows: rows.map((row) => ({ ...numbered(row.order), items: row.items })),
      total: counted[0]?.total ?? 0,
    };
  }

  /** LIF-16: the shop's orders, oldest first, a batch at a time after the order `afterId` names (null: the first). */
  async listForExport(
    tx: Transaction,
    tenantId: string,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<OrderRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions: (SQL | undefined)[] = [eq(orders.tenantId, tenantId)];
    if (after !== null) {
      conditions.push(
        or(
          gt(orders.createdAt, after.createdAt),
          and(eq(orders.createdAt, after.createdAt), gt(orders.id, after.id)),
        ),
      );
    }
    return tx
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(asc(orders.createdAt), asc(orders.id))
      .limit(limit)
      .then((rows) => rows.map(numbered));
  }

  /**
   * QTA-01, QTA-05: the shop's handling is counted one order at a time, so two orders handled at once cannot both pass
   * the last place under a limit. Held until the transaction ends.
   */
  async lockHandling(tx: Transaction, tenantId: string): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order_handling:${tenantId}`}, 0))`,
    );
  }

  /** QTA-01, QTA-04, QTA-05: the shop's orders handled at or after `since`, or ever when it is null. */
  async countHandled(tx: Transaction, tenantId: string, since: Date | null): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ handled: count() })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          since === null ? isNotNull(orders.handledAt) : gte(orders.handledAt, since),
        ),
      );
    return row?.handled ?? 0;
  }

  /** ORD-15, ORD-22: money recorded for an order. */
  async insertPayment(
    tx: Transaction,
    tenantId: string,
    values: NewOrderPayment,
  ): Promise<SelectOrderPayment> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(orderPayments)
      .values({ ...values, tenantId })
      .returning();
    if (!row) throw new Error('insert returned no payment');
    return row;
  }

  /** ORD-14: an order's payments, oldest first. */
  async listPayments(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectOrderPayment[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(orderPayments)
      .where(and(eq(orderPayments.tenantId, tenantId), eq(orderPayments.orderId, orderId)))
      .orderBy(asc(orderPayments.verifiedAt), asc(orderPayments.id));
  }

  /**
   * LIF-19: the shop's orders with their items, history and calls, and its counters. The database lets this through
   * only for a shop that is archived or deleted; the stock held for them and the serials sold to them go first.
   */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(orders).where(eq(orders.tenantId, tenantId));
    await tx.delete(orderCounters).where(eq(orderCounters.tenantId, tenantId));
  }
}
