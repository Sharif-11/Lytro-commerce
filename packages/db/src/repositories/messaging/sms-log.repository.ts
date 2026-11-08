import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { SmsLogStatus, type SmsBlockedReason, type SmsLogEntryKind } from '@lytronix/validators';
import { orders, smsLog, type SelectSmsLog } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export interface NewSmsLogEntry {
  tenantId: string;
  kind: SmsLogEntryKind;
  toPhone: string;
  units: number;
  cost: string;
  isEssential: boolean;
  status: SmsLogStatus;
  blockedReason?: SmsBlockedReason | null;
  providerMessageId?: string | null;
  /** Slice 7.2: an SMS event's order and words; a code has neither. */
  orderId?: string | null;
  body?: string | null;
}

/** SMS-14: one day's SMS of one kind, as the report counts them. */
export interface SmsReportRow {
  /** The day in Dhaka, YYYY-MM-DD. */
  day: string;
  kind: SmsLogEntryKind;
  sent: number;
  failed: number;
  blocked: number;
  /** The units of those sent. */
  units: number;
  /** What those sent cost the balance, in taka. */
  cost: string;
}

export interface SmsLogPage {
  limit: number;
  /** The rows before this ID, newest first. */
  before?: number;
  orderId?: string;
  /** ADM-03 (Slice 8.2): only these outcomes, the shop page's SMS that didn't go. */
  statuses?: readonly SmsLogStatus[];
}

// SMS-07, SMS-14, SMS-17: a shop's own SMS log, written once each SMS's fate is known.
export class SmsLogRepository {
  constructor(private readonly transactions: Pick<TransactionRunner, 'setTenantContext'>) {}

  async insert(db: Transaction, values: NewSmsLogEntry): Promise<void> {
    await this.transactions.setTenantContext(db, values.tenantId);
    await db.insert(smsLog).values({
      ...values,
      blockedReason: values.blockedReason ?? null,
      providerMessageId: values.providerMessageId ?? null,
      orderId: values.orderId ?? null,
      body: values.body ?? null,
    });
  }

  /** SMS-13: what the kinds sent since then cost the balance, in taka. */
  async spentSince(
    db: Transaction,
    tenantId: string,
    kinds: readonly SmsLogEntryKind[],
    since: Date,
  ): Promise<string> {
    await this.transactions.setTenantContext(db, tenantId);
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${smsLog.cost}), 0)::text` })
      .from(smsLog)
      .where(
        and(
          eq(smsLog.tenantId, tenantId),
          inArray(smsLog.kind, [...kinds]),
          eq(smsLog.status, SmsLogStatus.Sent),
          gte(smsLog.createdAt, since),
        ),
      );
    return row?.total ?? '0';
  }

  /** ADM-03 (Slice 8.2): how many of the shop's SMS failed or were blocked since `since`. */
  async notSentSince(
    db: Transaction,
    tenantId: string,
    since: Date,
  ): Promise<{ failed: number; blocked: number }> {
    await this.transactions.setTenantContext(db, tenantId);
    const [row] = await db
      .select({
        failed: sql<number>`(count(*) filter (where ${smsLog.status} = 'failed'))::int`,
        blocked: sql<number>`(count(*) filter (where ${smsLog.status} = 'blocked'))::int`,
      })
      .from(smsLog)
      .where(and(eq(smsLog.tenantId, tenantId), gte(smsLog.createdAt, since)));
    return { failed: row?.failed ?? 0, blocked: row?.blocked ?? 0 };
  }

  /** LIF-19: a deleted shop's SMS log; the trigger lets this through only for an archived or deleted shop. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(smsLog).where(eq(smsLog.tenantId, tenantId));
  }

  /** SMS-14: each day's SMS by kind, between the two times, in Dhaka's days. */
  async report(db: Transaction, tenantId: string, from: Date, to: Date): Promise<SmsReportRow[]> {
    await this.transactions.setTenantContext(db, tenantId);
    const day = sql<string>`to_char((${smsLog.createdAt} AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD')`;
    const rows = await db
      .select({
        day,
        kind: smsLog.kind,
        sent: sql<string>`count(*) filter (where ${smsLog.status} = 'sent')`,
        failed: sql<string>`count(*) filter (where ${smsLog.status} = 'failed')`,
        blocked: sql<string>`count(*) filter (where ${smsLog.status} = 'blocked')`,
        units: sql<string>`coalesce(sum(${smsLog.units}) filter (where ${smsLog.status} = 'sent'), 0)`,
        cost: sql<string>`coalesce(sum(${smsLog.cost}) filter (where ${smsLog.status} = 'sent'), 0)::text`,
      })
      .from(smsLog)
      .where(
        and(eq(smsLog.tenantId, tenantId), gte(smsLog.createdAt, from), lt(smsLog.createdAt, to)),
      )
      .groupBy(day, smsLog.kind)
      .orderBy(day, smsLog.kind);
    return rows.map((row) => ({
      day: row.day,
      kind: row.kind,
      sent: Number(row.sent),
      failed: Number(row.failed),
      blocked: Number(row.blocked),
      units: Number(row.units),
      cost: row.cost,
    }));
  }

  /**
   * SMS-17: the shop's SMS, newest first, a page at a time; one order's alone when asked. Each with its order's number
   * (Slice 7.7), null for a code or an order since deleted.
   */
  async list(
    db: Transaction,
    tenantId: string,
    page: SmsLogPage,
  ): Promise<(SelectSmsLog & { orderNumber: string | null })[]> {
    await this.transactions.setTenantContext(db, tenantId);
    const conditions = [eq(smsLog.tenantId, tenantId)];
    if (page.before !== undefined) conditions.push(lt(smsLog.id, page.before));
    if (page.orderId !== undefined) conditions.push(eq(smsLog.orderId, page.orderId));
    if (page.statuses !== undefined) conditions.push(inArray(smsLog.status, [...page.statuses]));
    const rows = await db
      .select({ row: smsLog, orderNumber: orders.orderNumber })
      .from(smsLog)
      .leftJoin(orders, and(eq(orders.tenantId, smsLog.tenantId), eq(orders.id, smsLog.orderId)))
      .where(and(...conditions))
      .orderBy(desc(smsLog.id))
      .limit(page.limit);
    return rows.map(({ row, orderNumber }) => ({ ...row, orderNumber }));
  }
}
