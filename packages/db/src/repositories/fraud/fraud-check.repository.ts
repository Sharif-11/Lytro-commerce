import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  CUSTOMER_FAULT_CANCEL_REASONS,
  FraudSourceState,
  FulfillmentStatus,
  type FulfilmentType,
  StatusOverride,
} from '@lytronix/validators';
import {
  fraudCheckSkips,
  fraudChecks,
  fraudRules,
  orders,
  type InsertFraudCheck,
} from '../../schema';
import type { SelectFraudCheck, SelectFraudCheckSkip, SelectFraudRule } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export type NewFraudCheck = Omit<InsertFraudCheck, 'id' | 'createdAt'>;

/** D7-49: the shop's own finished orders with one phone. */
export interface OwnOrderCounts {
  delivered: number;
  returned: number;
  cancelled: number;
}

/** FRD-05 (Slice 7.7): what an order's automatic check reads of the order itself. */
export interface FraudOrderFacts {
  fulfilmentType: FulfilmentType;
  customerPhone: string | null;
  codAmount: string;
  createdAt: Date;
}

// FRD-01 to FRD-05 (Phase 7 Slice 7.5): a shop's fraud checks, its own orders with a phone, and its automatic rule.
export class FraudCheckRepository {
  constructor(private readonly transactions: Pick<TransactionRunner, 'setTenantContext'>) {}

  async insert(db: Transaction, values: NewFraudCheck): Promise<SelectFraudCheck> {
    await this.transactions.setTenantContext(db, values.tenantId);
    const [row] = await db.insert(fraudChecks).values(values).returning();
    if (!row) throw new Error('the fraud check was not saved');
    return row;
  }

  /**
   * FRD-04: Steadfast's own answer for this phone given since `since`, the newest first, to reuse. Only a check that
   * asked counts, never one that reused an answer, so an answer is reused for three days from when it was given, not
   * for three days from its last reuse.
   */
  async steadfastAnswerSince(
    db: Transaction,
    tenantId: string,
    phone: string,
    since: Date,
  ): Promise<SelectFraudCheck | null> {
    await this.transactions.setTenantContext(db, tenantId);
    const [row] = await db
      .select()
      .from(fraudChecks)
      .where(
        and(
          eq(fraudChecks.tenantId, tenantId),
          eq(fraudChecks.phone, phone),
          eq(fraudChecks.steadfastState, FraudSourceState.Answered),
          isNull(fraudChecks.steadfastFrom),
          gte(fraudChecks.createdAt, since),
        ),
      )
      .orderBy(desc(fraudChecks.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** FRD-01: the latest check of this phone, of any age. */
  async latest(db: Transaction, tenantId: string, phone: string): Promise<SelectFraudCheck | null> {
    await this.transactions.setTenantContext(db, tenantId);
    const [row] = await db
      .select()
      .from(fraudChecks)
      .where(and(eq(fraudChecks.tenantId, tenantId), eq(fraudChecks.phone, phone)))
      .orderBy(desc(fraudChecks.createdAt))
      .limit(1);
    return row ?? null;
  }

  /**
   * D7-49 (Slice 7.5's read, 2026-11-07): the shop's own orders with this phone that tell something of the customer:
   * delivered, wholly or in part, for them; returned against them; and cancelled against them only for the customer's
   * own reasons. An order still open says nothing yet, so it isn't counted.
   */
  async ownOrders(db: Transaction, tenantId: string, phone: string): Promise<OwnOrderCounts> {
    await this.transactions.setTenantContext(db, tenantId);
    const live = or(
      isNull(orders.statusOverride),
      ne(orders.statusOverride, StatusOverride.Cancelled),
    );
    const rows = await db
      .select({
        delivered: sql<number>`count(*) FILTER (WHERE ${and(
          live,
          inArray(orders.fulfillmentStatus, [
            FulfillmentStatus.Delivered,
            FulfillmentStatus.PartiallyDelivered,
          ]),
        )})::int`,
        returned: sql<number>`count(*) FILTER (WHERE ${and(
          live,
          eq(orders.fulfillmentStatus, FulfillmentStatus.Returned),
        )})::int`,
        cancelled: sql<number>`count(*) FILTER (WHERE ${and(
          eq(orders.statusOverride, StatusOverride.Cancelled),
          inArray(orders.cancelReason, [...CUSTOMER_FAULT_CANCEL_REASONS]),
        )})::int`,
      })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.customerPhone, phone)));
    const [counts] = rows;
    return {
      delivered: counts?.delivered ?? 0,
      returned: counts?.returned ?? 0,
      cancelled: counts?.cancelled ?? 0,
    };
  }

  async rule(db: Transaction, tenantId: string): Promise<SelectFraudRule | null> {
    await this.transactions.setTenantContext(db, tenantId);
    const [row] = await db.select().from(fraudRules).where(eq(fraudRules.tenantId, tenantId));
    return row ?? null;
  }

  async saveRule(
    db: Transaction,
    tenantId: string,
    rule: { codOrders: boolean; minAmount: string | null },
  ): Promise<SelectFraudRule> {
    await this.transactions.setTenantContext(db, tenantId);
    const [row] = await db
      .insert(fraudRules)
      .values({ tenantId, ...rule, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: fraudRules.tenantId,
        set: { codOrders: rule.codOrders, minAmount: rule.minAmount, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new Error('the fraud rule was not saved');
    return row;
  }

  /** FRD-05 (Slice 7.7): why a new order's automatic check didn't run. Written once; a second write changes nothing. */
  async recordSkip(
    db: Transaction,
    values: Omit<typeof fraudCheckSkips.$inferInsert, 'createdAt'>,
  ): Promise<void> {
    await this.transactions.setTenantContext(db, values.tenantId);
    await db.insert(fraudCheckSkips).values(values).onConflictDoNothing();
  }

  /** FRD-05 (Slice 7.7): an order of the shop's as its automatic check reads it, its check, and why one didn't run. */
  async orderCheck(
    db: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<{
    order: FraudOrderFacts | null;
    check: SelectFraudCheck | null;
    skip: SelectFraudCheckSkip | null;
  }> {
    await this.transactions.setTenantContext(db, tenantId);
    const [order] = await db
      .select({
        fulfilmentType: orders.fulfilmentType,
        customerPhone: orders.customerPhone,
        codAmount: orders.codAmount,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
      .limit(1);
    if (!order) return { order: null, check: null, skip: null };
    const [check] = await db
      .select()
      .from(fraudChecks)
      .where(and(eq(fraudChecks.tenantId, tenantId), eq(fraudChecks.orderId, orderId)))
      .orderBy(desc(fraudChecks.createdAt))
      .limit(1);
    const [skip] = await db
      .select()
      .from(fraudCheckSkips)
      .where(and(eq(fraudCheckSkips.tenantId, tenantId), eq(fraudCheckSkips.orderId, orderId)))
      .limit(1);
    return { order, check: check ?? null, skip: skip ?? null };
  }
}
