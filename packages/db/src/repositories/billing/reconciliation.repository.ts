import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  ReconciliationDifferenceState,
  type ReconciliationDifferenceKind,
} from '@lytronix/validators';
import {
  reconciliationDifferences,
  reconciliationRuns,
  type InsertReconciliationDifference,
  type SelectReconciliationDifference,
} from '../../schema';
import type { Executor, Transaction, TransactionRunner } from '../../transactions';

/** A window of time: [from, to). */
export interface Window {
  from: Date;
  to: Date;
}

/** A payment of Lytro's own the reconciliation looks at, and the amount it should come to. */
export interface PaymentFigure {
  id: string;
  tenantId: string;
  amount: string;
}

/** What a shop's ledger holds against one of Lytro's payments: its credits and its charges, each summed and counted. */
export interface LedgerAgainst {
  paymentId: string;
  credits: number;
  credited: string;
  charged: string;
}

/** An order fee as charged, with what its own reference says it was worked out on. */
export interface ChargedOrderFee {
  entryId: string;
  orderId: string | null;
  amount: string;
  orderTotal: string | null;
  minimum: string | null;
  percent: string | null;
}

/** A difference's listing, newest day first. */
export interface DifferenceFilter {
  state: ReconciliationDifferenceState;
  day?: string;
  kind?: ReconciliationDifferenceKind;
}

function at(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}

/** A Postgres array of uuids, passed as one parameter (drizzle spreads a plain array into a list). */
function uuids(ids: readonly string[]): SQL {
  return sql`${`{${ids.join(',')}}`}::uuid[]`;
}

/**
 * DAT-52, D9-16, OD-44 (Phase 9 Slice 9.5): the figures the daily reconciliation compares, and what it found. Lytro's own
 * money is read from control; a shop's ledger, SMS log, courier messages and payments only inside its own context.
 */
export class ReconciliationRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  // ---------------------------------------------------------------------------------------------------------------
  // Lytro's own money (control)
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Payments Lytro verified by itself (no operator, no manual entry) that came by a wallet or the bank, with no matched
   * wallet SMS and no completed gateway answer behind them. A payment from the balance has its own check.
   */
  async paymentsWithoutProof(db: Executor, window: Window): Promise<PaymentFigure[]> {
    const result = await db.execute<{ id: string; tenant_id: string; amount: string }>(sql`
      SELECT p.id, p.tenant_id, p.amount FROM control.plan_payments p
      WHERE p.status = 'verified' AND p.verified_at >= ${at(window.from)} AND p.verified_at < ${at(window.to)}
        AND p.verified_by IS NULL AND NOT p.recorded_by_platform AND NOT p.test AND p.transaction_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM control.lytro_listener_messages m WHERE m.plan_payment_id = p.id AND m.status = 'matched'
        )
        AND NOT EXISTS (
          SELECT 1 FROM control.gateway_answers a
          WHERE a.tenant_id IS NULL AND a.session_id = p.id AND a.transaction_status = 'Completed'
        )
      ORDER BY p.verified_at`);
    return result.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, amount: row.amount }));
  }

  /** Money a Lytro wallet's SMS says arrived that no payment claimed. */
  async walletMoneyUnclaimed(
    db: Executor,
    window: Window,
  ): Promise<{ id: string; amount: string | null }[]> {
    const result = await db.execute<{ id: string; amount: string | null }>(sql`
      SELECT m.id, m.amount FROM control.lytro_listener_messages m
      WHERE m.status = 'unmatched' AND m.received_at >= ${at(window.from)} AND m.received_at < ${at(window.to)}
      ORDER BY m.received_at`);
    return result.rows;
  }

  /**
   * A matched wallet SMS, or a completed answer from Lytro's own gateway account, whose payment is not verified: money
   * that arrived for a payment the shop still hasn't got. A payment reversed since (ADM-15) is the operator's own doing.
   */
  async proofWithoutPayment(
    db: Executor,
    window: Window,
  ): Promise<
    {
      subject: string;
      paymentId: string;
      tenantId: string | null;
      amount: string | null;
      source: string;
    }[]
  > {
    const result = await db.execute<{
      subject: string;
      payment_id: string;
      tenant_id: string | null;
      amount: string | null;
      source: string;
    }>(sql`
      SELECT m.id::text AS subject, m.plan_payment_id AS payment_id, p.tenant_id, m.amount, 'wallet_sms' AS source
      FROM control.lytro_listener_messages m
      LEFT JOIN control.plan_payments p ON p.id = m.plan_payment_id
      WHERE m.status = 'matched' AND m.plan_payment_id IS NOT NULL
        AND m.received_at >= ${at(window.from)} AND m.received_at < ${at(window.to)}
        AND (p.id IS NULL OR p.status NOT IN ('verified', 'reversed'))
      UNION ALL
      SELECT DISTINCT ON (a.session_id) a.id::text, a.session_id, p.tenant_id, NULL, 'gateway_answer'
      FROM control.gateway_answers a
      LEFT JOIN control.plan_payments p ON p.id = a.session_id
      WHERE a.tenant_id IS NULL AND a.session_id IS NOT NULL AND a.transaction_status = 'Completed'
        AND a.received_at >= ${at(window.from)} AND a.received_at < ${at(window.to)}
        AND (p.id IS NULL OR p.status NOT IN ('verified', 'reversed'))`);
    return result.rows.map((row) => ({
      subject: row.subject,
      paymentId: row.payment_id,
      tenantId: row.tenant_id,
      amount: row.amount,
      source: row.source,
    }));
  }

  /** Top-ups verified in the window, each with what its balance credit must be: what arrived, else what was quoted. */
  async verifiedTopUps(db: Executor, window: Window): Promise<PaymentFigure[]> {
    const result = await db.execute<{ id: string; tenant_id: string; amount: string }>(sql`
      SELECT p.id, p.tenant_id, COALESCE(p.amount_arrived, p.amount) AS amount FROM control.plan_payments p
      WHERE p.status = 'verified' AND p.kind = 'top_up' AND NOT p.test
        AND p.verified_at >= ${at(window.from)} AND p.verified_at < ${at(window.to)}`);
    return result.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, amount: row.amount }));
  }

  /** Plans and add-ons paid from the balance (no transaction ID or reference) in the window, each with its price. */
  async balancePaid(db: Executor, window: Window): Promise<PaymentFigure[]> {
    const result = await db.execute<{ id: string; tenant_id: string; amount: string }>(sql`
      SELECT p.id, p.tenant_id, p.amount FROM control.plan_payments p
      WHERE p.status = 'verified' AND p.kind <> 'top_up' AND p.transaction_id IS NULL AND NOT p.test
        AND p.verified_at >= ${at(window.from)} AND p.verified_at < ${at(window.to)}`);
    return result.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, amount: row.amount }));
  }

  /** BIL-12: plans and add-ons paid in the window that don't have exactly one invoice (a credit note is not one). */
  async invoiceCountsOff(
    db: Executor,
    window: Window,
  ): Promise<{ id: string; tenantId: string; amount: string; invoices: number }[]> {
    const result = await db.execute<{
      id: string;
      tenant_id: string;
      amount: string;
      invoices: number;
    }>(sql`
      SELECT p.id, p.tenant_id, p.amount,
        (SELECT count(*)::int FROM control.invoices i WHERE i.plan_payment_id = p.id AND i.kind <> 'credit_note') AS invoices
      FROM control.plan_payments p
      WHERE p.status = 'verified' AND p.kind IN ('purchase', 'renewal', 'upgrade', 'addon') AND NOT p.test
        AND p.verified_at >= ${at(window.from)} AND p.verified_at < ${at(window.to)}
        AND (SELECT count(*) FROM control.invoices i WHERE i.plan_payment_id = p.id AND i.kind <> 'credit_note') <> 1`);
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      amount: row.amount,
      invoices: row.invoices,
    }));
  }

  /** Every shop with data to compare: any not deleted. */
  async shops(db: Executor): Promise<string[]> {
    const result = await db.execute<{ id: string }>(sql`
      SELECT t.id FROM control.tenants t WHERE t.state <> 'deleted' ORDER BY t.id`);
    return result.rows.map((row) => row.id);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // One shop's own records (tenant), each read in the shop's context
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * BAL-02: the shop's balance as control holds it, and what its ledger sums to -- read in one statement, so one moment's
   * view of both, and a charge landing meanwhile can't look like a difference.
   */
  async balanceAgainstLedger(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ balance: string; ledger: string }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ balance: string; ledger: string }>(sql`
      SELECT t.balance_amount::text AS balance,
        (SELECT COALESCE(sum(l.amount), 0) FROM tenant.balance_ledger l WHERE l.tenant_id = ${tenantId})::text AS ledger
      FROM control.tenants t WHERE t.id = ${tenantId}`);
    const row = result.rows[0];
    return { balance: row?.balance ?? '0', ledger: row?.ledger ?? '0' };
  }

  /** What the shop's ledger holds against each of these payments: top-up credits, and plan and add-on charges. */
  async ledgerAgainst(
    tx: Transaction,
    tenantId: string,
    paymentIds: readonly string[],
  ): Promise<LedgerAgainst[]> {
    if (paymentIds.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      payment_id: string;
      credits: number;
      credited: string;
      charged: string;
    }>(sql`
      SELECT ids.id::text AS payment_id,
        count(l.id) FILTER (WHERE l.type = 'top_up')::int AS credits,
        COALESCE(sum(l.amount) FILTER (WHERE l.type = 'top_up'), 0)::text AS credited,
        COALESCE(sum(l.amount) FILTER (WHERE l.type IN ('plan_payment', 'addon')), 0)::text AS charged
      FROM unnest(${uuids(paymentIds)}) AS ids(id)
      LEFT JOIN tenant.balance_ledger l
        ON l.tenant_id = ${tenantId} AND l.reference->>'planPaymentId' = ids.id::text
      GROUP BY ids.id`);
    return result.rows.map((row) => ({
      paymentId: row.payment_id,
      credits: row.credits,
      credited: row.credited,
      charged: row.charged,
    }));
  }

  /**
   * SMS-07: a shop's day of SMS -- what its log says the balance paid, what its SMS charges took, and what was given back
   * for SMS that weren't sent.
   */
  async smsDay(
    tx: Transaction,
    tenantId: string,
    window: Window,
  ): Promise<{ logged: string; charged: string; givenBack: string }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const logged = await tx.execute<{ total: string }>(sql`
      SELECT COALESCE(sum(cost), 0)::text AS total FROM tenant.sms_log
      WHERE tenant_id = ${tenantId} AND created_at >= ${at(window.from)} AND created_at < ${at(window.to)}`);
    const ledger = await tx.execute<{ charged: string; given_back: string }>(sql`
      SELECT
        COALESCE(-sum(amount) FILTER (WHERE type = 'sms'), 0)::text AS charged,
        COALESCE(sum(amount) FILTER (WHERE type = 'reversal' AND reference->>'reason' = 'sms_not_sent'), 0)::text
          AS given_back
      FROM tenant.balance_ledger
      WHERE tenant_id = ${tenantId} AND created_at >= ${at(window.from)} AND created_at < ${at(window.to)}`);
    return {
      logged: logged.rows[0]?.total ?? '0',
      charged: ledger.rows[0]?.charged ?? '0',
      givenBack: ledger.rows[0]?.given_back ?? '0',
    };
  }

  /** PYG-02, PYG-14: the shop's order fees charged in the window, each with the figures its reference was worked out on. */
  async orderFees(tx: Transaction, tenantId: string, window: Window): Promise<ChargedOrderFee[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      id: string;
      order_id: string | null;
      amount: string;
      order_total: string | null;
      minimum: string | null;
      percent: string | null;
    }>(sql`
      SELECT id::text, reference->>'orderId' AS order_id, amount::text,
        reference->>'orderTotal' AS order_total, reference->>'minimum' AS minimum, reference->>'percent' AS percent
      FROM tenant.balance_ledger
      WHERE tenant_id = ${tenantId} AND type = 'order_fee'
        AND created_at >= ${at(window.from)} AND created_at < ${at(window.to)}
      ORDER BY id`);
    return result.rows.map((row) => ({
      entryId: row.id,
      orderId: row.order_id,
      amount: row.amount,
      orderTotal: row.order_total,
      minimum: row.minimum,
      percent: row.percent,
    }));
  }

  /** PYG-02: how many order-fee entries each of these orders has had, ever; more than one is a fee taken twice. */
  async orderFeeCounts(
    tx: Transaction,
    tenantId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (orderIds.length === 0) return new Map();
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ order_id: string; entries: number }>(sql`
      SELECT reference->>'orderId' AS order_id, count(*)::int AS entries FROM tenant.balance_ledger
      WHERE tenant_id = ${tenantId} AND type = 'order_fee' AND reference->>'orderId' = ANY(${`{${orderIds.join(',')}}`}::text[])
      GROUP BY reference->>'orderId'`);
    return new Map(result.rows.map((row) => [row.order_id, row.entries]));
  }

  /**
   * VER-01: the shop's payments Lytro marked verified by itself (no staff decision) in the window, with no matched SMS
   * and no completed gateway answer behind them.
   */
  async shopPaymentsWithoutProof(
    tx: Transaction,
    tenantId: string,
    window: Window,
  ): Promise<{ id: string; amount: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ id: string; amount: string }>(sql`
      SELECT s.id::text, s.amount::text FROM tenant.payment_sessions s
      WHERE s.tenant_id = ${tenantId} AND s.state = 'verified' AND s.decided_by IS NULL AND NOT s.test
        AND s.updated_at >= ${at(window.from)} AND s.updated_at < ${at(window.to)}
        AND NOT EXISTS (
          SELECT 1 FROM tenant.listener_messages m
          WHERE m.tenant_id = ${tenantId} AND m.session_id = s.id AND m.status = 'matched'
        )
        AND NOT EXISTS (
          SELECT 1 FROM control.gateway_answers a
          WHERE a.tenant_id = ${tenantId} AND a.session_id = s.id AND a.transaction_status = 'Completed'
        )`);
    return result.rows;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // What it found
  // ---------------------------------------------------------------------------------------------------------------

  /** Each difference once per day, kind and subject: a re-run adds nothing. The new ones, back. */
  async record(
    db: Executor,
    rows: readonly InsertReconciliationDifference[],
  ): Promise<SelectReconciliationDifference[]> {
    if (rows.length === 0) return [];
    return db
      .insert(reconciliationDifferences)
      .values([...rows])
      .onConflictDoNothing({
        target: [
          reconciliationDifferences.day,
          reconciliationDifferences.kind,
          reconciliationDifferences.subject,
        ],
      })
      .returning();
  }

  /** The day's run, kept once: a second run of the same day leaves the first's record. True when this was the first. */
  async recordRun(
    db: Executor,
    day: string,
    found: number,
    counts: Partial<Record<ReconciliationDifferenceKind, number>>,
    at: Date,
  ): Promise<boolean> {
    const rows = await db
      .insert(reconciliationRuns)
      .values({ day, found, counts, ranAt: at })
      .onConflictDoNothing({ target: reconciliationRuns.day })
      .returning({ day: reconciliationRuns.day });
    return rows.length > 0;
  }

  async list(
    db: Executor,
    filter: DifferenceFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectReconciliationDifference[]; total: number }> {
    const where = and(
      eq(reconciliationDifferences.state, filter.state),
      filter.day === undefined ? undefined : eq(reconciliationDifferences.day, filter.day),
      filter.kind === undefined ? undefined : eq(reconciliationDifferences.kind, filter.kind),
    );
    const rows = await db
      .select()
      .from(reconciliationDifferences)
      .where(where)
      .orderBy(desc(reconciliationDifferences.day), reconciliationDifferences.createdAt)
      .limit(page.limit)
      .offset(page.offset);
    const [totals] = await db
      .select({ total: count() })
      .from(reconciliationDifferences)
      .where(where);
    return { rows, total: totals?.total ?? 0 };
  }

  /** An open difference resolved with the operator's note; null when there is none open by that id. */
  async resolve(
    db: Executor,
    id: string,
    values: { note: string; resolvedBy: string; resolvedAt: Date },
  ): Promise<SelectReconciliationDifference | null> {
    const [row] = await db
      .update(reconciliationDifferences)
      .set({ ...values, state: ReconciliationDifferenceState.Resolved })
      .where(
        and(
          eq(reconciliationDifferences.id, id),
          eq(reconciliationDifferences.state, ReconciliationDifferenceState.Open),
        ),
      )
      .returning();
    return row ?? null;
  }

  async findDifference(db: Executor, id: string): Promise<SelectReconciliationDifference | null> {
    const [row] = await db
      .select()
      .from(reconciliationDifferences)
      .where(eq(reconciliationDifferences.id, id))
      .limit(1);
    return row ?? null;
  }
}
