import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { SmsLogStatus, type SmsBlockedReason, type SmsLogEntryKind } from '@lytronix/validators';
import { smsLog, type SelectSmsLog } from '../../schema';
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

  /** SMS-17: the shop's SMS, newest first, a page at a time; one order's alone when asked. */
  async list(db: Transaction, tenantId: string, page: SmsLogPage): Promise<SelectSmsLog[]> {
    await this.transactions.setTenantContext(db, tenantId);
    const conditions = [eq(smsLog.tenantId, tenantId)];
    if (page.before !== undefined) conditions.push(lt(smsLog.id, page.before));
    if (page.orderId !== undefined) conditions.push(eq(smsLog.orderId, page.orderId));
    return db
      .select()
      .from(smsLog)
      .where(and(...conditions))
      .orderBy(desc(smsLog.id))
      .limit(page.limit);
  }
}
