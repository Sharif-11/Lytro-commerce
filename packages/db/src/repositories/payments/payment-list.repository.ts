import { sql, type SQL } from 'drizzle-orm';
import {
  PaymentListStatus,
  type PaymentMethod,
  type PaymentRejectReason,
  type PaymentSessionSource,
  type VerificationLevel,
} from '@lytronix/validators';
import type { Transaction, TransactionRunner } from '../../transactions';
import { escapeLike } from '../like';

/** PAY-19: one payment in the shop's list -- a transaction ID a shopper typed, or money recorded on an order. */
export interface PaymentListRow {
  id: string;
  /** `session`: typed on the payment page and not yet verified, or rejected; `payment`: money in on an order. */
  kind: 'session' | 'payment';
  status: PaymentListStatus;
  orderId: string;
  orderNumber: string;
  method: PaymentMethod;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
  /** When it was typed, or when the money was verified. */
  at: Date;
  source: PaymentSessionSource | null;
  sessionId: string | null;
  verificationLevel: VerificationLevel | null;
  /** Who verified, rejected, voided or refunded it, and when; null while it waits. */
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectReason: PaymentRejectReason | null;
  /** A rejection's, void's or refund's note. */
  note: string | null;
}

/** PAY-19: what the list may be narrowed to. */
export interface PaymentListFilter {
  status?: PaymentListStatus;
  method?: PaymentMethod;
  from: Date | null;
  before: Date | null;
  /** A sender number (local form) or the start of a transaction ID or order number. */
  search: string | null;
}

interface RawRow extends Record<string, unknown> {
  id: string;
  kind: 'session' | 'payment';
  status: PaymentListStatus;
  order_id: string;
  order_number: string;
  method: PaymentMethod;
  amount: string;
  sender_number: string | null;
  transaction_id: string | null;
  at: Date | string;
  source: PaymentSessionSource | null;
  session_id: string | null;
  verification_level: VerificationLevel | null;
  decided_by: string | null;
  decided_at: Date | string | null;
  reject_reason: PaymentRejectReason | null;
  note: string | null;
}

function dateOf(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

// PAY-19 (Phase 5 Slice 5.3, agreed 2026-10-31: one list of every payment): a shop's transaction IDs typed on the page
// that wait to be verified or were rejected, and its money in -- verified from the page, recorded by staff, or the cash
// on delivery collected -- each with its order. A session once verified shows as the payment it became.
export class PaymentListRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async list(
    tx: Transaction,
    tenantId: string,
    filter: PaymentListFilter,
    page: { offset: number; limit: number } | null,
  ): Promise<{ rows: PaymentListRow[]; total: number; amount: string }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = this.whereOf(filter);
    const all = this.union(tenantId);
    const paged = page === null ? sql`` : sql` LIMIT ${page.limit} OFFSET ${page.offset}`;
    const rows = await tx.execute<RawRow>(
      sql`SELECT * FROM (${all}) AS p WHERE ${where} ORDER BY p.at DESC, p.id DESC${paged}`,
    );
    const [totals] = (
      await tx.execute<{ total: number; amount: string }>(
        sql`SELECT count(*)::int AS total, coalesce(sum(p.amount::numeric), 0)::numeric(14, 2)::text AS amount
            FROM (${all}) AS p WHERE ${where}`,
      )
    ).rows;
    return {
      rows: rows.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        orderId: row.order_id,
        orderNumber: row.order_number,
        method: row.method,
        amount: row.amount,
        senderNumber: row.sender_number,
        transactionId: row.transaction_id,
        at: dateOf(row.at),
        source: row.source,
        sessionId: row.session_id,
        verificationLevel: row.verification_level,
        decidedBy: row.decided_by,
        decidedAt: row.decided_at === null ? null : dateOf(row.decided_at),
        rejectReason: row.reject_reason,
        note: row.note,
      })),
      total: totals?.total ?? 0,
      amount: totals?.amount ?? '0.00',
    };
  }

  /** The shop's typed transaction IDs not yet money in, and its money in, in one shape. */
  private union(tenantId: string): SQL {
    return sql`
      SELECT s.id, 'session' AS kind,
             CASE WHEN s.state = 'failed' THEN ${PaymentListStatus.Rejected} ELSE ${PaymentListStatus.ToVerify} END
               AS status,
             s.order_id, o.order_number, s.method, s.amount::text AS amount, s.sender_number, s.transaction_id,
             s.submitted_at AS at, s.source, s.id AS session_id, NULL::tenant.verification_level AS verification_level,
             s.decided_by, s.decided_at, s.reject_reason, s.reject_note AS note
        FROM tenant.payment_sessions s
        JOIN tenant.orders o ON o.tenant_id = s.tenant_id AND o.id = s.order_id
       WHERE s.tenant_id = ${tenantId} AND s.transaction_id IS NOT NULL
         AND s.state IN ('checking', 'needs_review', 'failed')
      UNION ALL
      SELECT p.id, 'payment' AS kind,
             CASE WHEN p.voided_at IS NOT NULL THEN ${PaymentListStatus.Voided}
                  WHEN p.refunded_at IS NOT NULL THEN ${PaymentListStatus.Refunded}
                  ELSE ${PaymentListStatus.Verified} END AS status,
             p.order_id, o.order_number, p.method, p.amount::text AS amount, p.sender_number, p.transaction_id,
             p.verified_at AS at, s.source, p.session_id, p.verification_level,
             coalesce(p.voided_by, p.refunded_by, p.verified_by) AS decided_by,
             coalesce(p.voided_at, p.refunded_at, p.verified_at) AS decided_at,
             NULL::tenant.payment_reject_reason AS reject_reason, coalesce(p.void_reason, p.refund_note) AS note
        FROM tenant.payments p
        JOIN tenant.orders o ON o.tenant_id = p.tenant_id AND o.id = p.order_id
        LEFT JOIN tenant.payment_sessions s ON s.tenant_id = p.tenant_id AND s.id = p.session_id
       WHERE p.tenant_id = ${tenantId}`;
  }

  private whereOf(filter: PaymentListFilter): SQL {
    const conditions: SQL[] = [sql`TRUE`];
    if (filter.status !== undefined) conditions.push(sql`p.status = ${filter.status}`);
    if (filter.method !== undefined) conditions.push(sql`p.method = ${filter.method}`);
    if (filter.from !== null) conditions.push(sql`p.at >= ${filter.from.toISOString()}`);
    if (filter.before !== null) conditions.push(sql`p.at < ${filter.before.toISOString()}`);
    if (filter.search !== null) {
      const start = `${escapeLike(filter.search)}%`;
      conditions.push(
        sql`(p.sender_number = ${filter.search} OR p.transaction_id ILIKE ${start}
             OR p.order_number ILIKE ${start})`,
      );
    }
    return sql.join(conditions, sql` AND `);
  }
}
