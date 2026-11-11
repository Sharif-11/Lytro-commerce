import { and, desc, eq, gte, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../transactions';
import {
  manualPaymentEntries,
  operatorAccounts,
  planPayments,
  plans,
  tenants,
  type InsertManualPaymentEntry,
  type SelectManualPaymentEntry,
} from '../../schema';

/** D8-55: what the operator's list of manual entries filters on. */
export interface ManualEntryFilters {
  id?: string | undefined;
  tenantId?: string | undefined;
  operatorId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page: number;
  limit: number;
}

/** An entry or a reversal as the list reads it: its shop, plan and operator, and the reversal it has had. */
export interface ManualEntryRow {
  id: string;
  tenantId: string;
  shopName: string;
  shopSlug: string;
  planPaymentId: string;
  kind: SelectManualPaymentEntry['kind'];
  planName: string | null;
  amount: string;
  walletId: string | null;
  /** D8-75: Lytro's bank account a transfer reached; its reference is the transaction ID. */
  bankAccountId: string | null;
  transactionId: string | null;
  senderNumber: string | null;
  paidAt: Date | null;
  evidenceId: string | null;
  evidenceLine: string | null;
  reason: string;
  enteredBy: string;
  enteredByEmail: string | null;
  reversesEntryId: string | null;
  reversedBy: { id: string; reason: string; at: Date } | null;
  createdAt: Date;
}

const reversal = alias(manualPaymentEntries, 'reversal');

/** ADM-14, ADM-15: control.manual_payment_entries, append-only. */
export class ManualEntryRepository {
  async insert(db: Executor, values: InsertManualPaymentEntry): Promise<SelectManualPaymentEntry> {
    const [row] = await db.insert(manualPaymentEntries).values(values).returning();
    if (!row) throw new Error('insert returned no manual entry');
    return row;
  }

  async findById(db: Executor, id: string): Promise<SelectManualPaymentEntry | null> {
    const rows = await db
      .select()
      .from(manualPaymentEntries)
      .where(eq(manualPaymentEntries.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * ADM-15: how many entries were made since then, by anyone; a reversal is not an entry. Counted under a lock held to
   * the end of the caller's transaction, so two entries saved at once are counted one after the other.
   */
  async countEntriesSince(db: Executor, since: Date): Promise<number> {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('control.manual_payment_entries'))`);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(manualPaymentEntries)
      .where(
        and(
          gte(manualPaymentEntries.createdAt, since),
          isNull(manualPaymentEntries.reversesEntryId),
        ),
      );
    return row?.count ?? 0;
  }

  /** D8-56: whether an entry that used this transaction ID has been reversed, which frees it for another entry. */
  async hasReversedUse(db: Executor, transactionId: string): Promise<boolean> {
    const rows = await db
      .select({ id: manualPaymentEntries.id })
      .from(manualPaymentEntries)
      .innerJoin(reversal, eq(reversal.reversesEntryId, manualPaymentEntries.id))
      .where(eq(manualPaymentEntries.transactionId, transactionId))
      .limit(1);
    return rows.length > 0;
  }

  /** D8-55: the entries and reversals asked for, newest first; `total` counts the whole filter. */
  async list(
    db: Executor,
    filters: ManualEntryFilters,
  ): Promise<{ entries: ManualEntryRow[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters.id) conditions.push(eq(manualPaymentEntries.id, filters.id));
    if (filters.tenantId) conditions.push(eq(manualPaymentEntries.tenantId, filters.tenantId));
    if (filters.operatorId) conditions.push(eq(manualPaymentEntries.enteredBy, filters.operatorId));
    if (filters.from) conditions.push(gte(manualPaymentEntries.createdAt, filters.from));
    if (filters.to) conditions.push(lt(manualPaymentEntries.createdAt, filters.to));
    const where = and(...conditions);
    const [rows, counted] = await Promise.all([
      db
        .select({
          id: manualPaymentEntries.id,
          tenantId: manualPaymentEntries.tenantId,
          shopName: tenants.shopName,
          shopSlug: tenants.slug,
          planPaymentId: manualPaymentEntries.planPaymentId,
          kind: manualPaymentEntries.kind,
          planName: plans.name,
          amount: manualPaymentEntries.amount,
          walletId: manualPaymentEntries.walletId,
          bankAccountId: manualPaymentEntries.bankAccountId,
          transactionId: manualPaymentEntries.transactionId,
          senderNumber: manualPaymentEntries.senderNumber,
          paidAt: manualPaymentEntries.paidAt,
          evidenceId: manualPaymentEntries.evidenceId,
          evidenceLine: manualPaymentEntries.evidenceLine,
          reason: manualPaymentEntries.reason,
          enteredBy: manualPaymentEntries.enteredBy,
          enteredByEmail: operatorAccounts.email,
          reversesEntryId: manualPaymentEntries.reversesEntryId,
          createdAt: manualPaymentEntries.createdAt,
          reversalId: reversal.id,
          reversalReason: reversal.reason,
          reversalAt: reversal.createdAt,
        })
        .from(manualPaymentEntries)
        .innerJoin(tenants, eq(tenants.id, manualPaymentEntries.tenantId))
        .innerJoin(planPayments, eq(planPayments.id, manualPaymentEntries.planPaymentId))
        .leftJoin(plans, eq(plans.id, planPayments.planId))
        .leftJoin(operatorAccounts, eq(operatorAccounts.id, manualPaymentEntries.enteredBy))
        .leftJoin(reversal, eq(reversal.reversesEntryId, manualPaymentEntries.id))
        .where(where)
        .orderBy(desc(manualPaymentEntries.createdAt), desc(manualPaymentEntries.id))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(manualPaymentEntries)
        .where(where),
    ]);
    return {
      entries: rows.map(({ reversalId, reversalReason, reversalAt, ...entry }) => ({
        ...entry,
        reversedBy:
          reversalId !== null && reversalReason !== null && reversalAt !== null
            ? { id: reversalId, reason: reversalReason, at: reversalAt }
            : null,
      })),
      total: counted[0]?.total ?? 0,
    };
  }
}
