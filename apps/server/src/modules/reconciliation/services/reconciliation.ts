import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  InsertReconciliationDifference,
  PaymentFigure,
  ReconciliationWindow,
  Transaction,
} from '@lytronix/db';
import { RECONCILIATION_UNMATCHED_HOURS, ReconciliationDifferenceKind } from '@lytronix/validators';
import { DAY_MS, HOUR_MS, dhakaDate, dhakaDayStart } from '../../../common/time';
import { orderFeePaisa } from '../../balance/services/payg-billing.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { OperatorAlerts } from '../../shared/mail/services/operator-alerts';
import type { ReconciliationStore } from '../ports/reconciliation-store';
import { RECONCILIATION_CLOCK, RECONCILIATION_STORE } from '../tokens';

/** What one run did: the day it compared, how many differences it found, how many were new, and the checks that failed. */
export interface ReconciliationRunResult {
  day: string;
  found: number;
  added: number;
  failed: number;
}

type Difference = Omit<InsertReconciliationDifference, 'day'>;

/** The Asia/Dhaka day `day` as a window of time. */
function dayWindow(day: string): ReconciliationWindow {
  const from = dhakaDayStart(day);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

/**
 * DAT-52, D9-16, OD-44 (Phase 9 Slice 9.5, the user 2026-11-13): each morning at 06:00 in Asia/Dhaka, yesterday's money
 * compared and every difference listed for the operator -- an amount off by even one paisa, or something still unmatched
 * 24 hours on. What must match at once (a verification and its proof, a payment and its ledger entries and invoice, a fee
 * and its own figures, a day's SMS and their charges, an unreadable courier message) is looked at for yesterday. What may
 * take a while to match (money arriving at Lytro's wallets) is looked at for the day before, so it has had its 24 hours.
 * Lytro's own money is checked whole; a shop's own order payments only for being marked paid with nothing behind it. One
 * check's failure, or one shop's, never stops the rest. Each difference is kept once (a re-run adds nothing), and the
 * operators are emailed when a run finds new ones -- counts and kinds only.
 */
@Injectable()
export class Reconciliation {
  private readonly logger = new Logger('Reconciliation');

  constructor(
    @Inject(RECONCILIATION_STORE) private readonly store: ReconciliationStore,
    @Inject(OperatorAlerts) private readonly operators: OperatorAlerts,
    @Inject(RECONCILIATION_CLOCK) private readonly clock: () => Date,
  ) {}

  async run(now = this.clock()): Promise<ReconciliationRunResult> {
    const day = dhakaDate(new Date(dhakaDayStart(dhakaDate(now)).getTime() - DAY_MS));
    const yesterday = dayWindow(day);
    // What has had its 24 hours by this run: the day before yesterday, ending 24 hours before yesterday ends.
    const settled: ReconciliationWindow = {
      from: new Date(yesterday.from.getTime() - RECONCILIATION_UNMATCHED_HOURS * HOUR_MS),
      to: new Date(yesterday.to.getTime() - RECONCILIATION_UNMATCHED_HOURS * HOUR_MS),
    };
    const found: Difference[] = [];
    let failed = 0;
    const check = async (name: string, work: () => Promise<Difference[]>): Promise<void> => {
      try {
        found.push(...(await work()));
      } catch (error) {
        failed += 1;
        this.logger.error(`the reconciliation's ${name} check failed for ${day}`, error as Error);
      }
    };

    await check('payments without proof', () => this.paymentsWithoutProof(yesterday));
    await check('unclaimed wallet money', () => this.walletMoneyUnclaimed(settled));
    await check('proof without payment', () => this.proofWithoutPayment(settled));
    await check('payments against ledgers', () => this.paymentsAgainstLedgers(yesterday));
    await check('invoices', () => this.invoices(yesterday));
    for (const shopId of await this.store.shops()) {
      await check(`shop ${shopId}`, () =>
        this.store.inShop((tx) => this.shopDay(tx, shopId, yesterday)),
      );
    }

    const rows = found.map((difference) => ({ ...difference, day }));
    const added = await this.store.record(rows);
    const counts: Partial<Record<ReconciliationDifferenceKind, number>> = {};
    for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
    await this.store.recordRun(day, rows.length, counts, now);
    if (added.length > 0)
      await this.tell(
        day,
        added.length,
        added.map((row) => row.kind),
        failed,
      );
    else if (failed > 0) await this.tell(day, 0, [], failed);
    return { day, found: rows.length, added: added.length, failed };
  }

  /** Lytro verified it by itself, by a wallet or the bank, with no matched SMS and no completed gateway answer. */
  private async paymentsWithoutProof(window: ReconciliationWindow): Promise<Difference[]> {
    return (await this.store.paymentsWithoutProof(window)).map((payment) => ({
      kind: ReconciliationDifferenceKind.PaymentWithoutProof,
      subject: payment.id,
      tenantId: payment.tenantId,
      found: payment.amount,
    }));
  }

  /** Money a Lytro wallet's SMS says arrived, unclaimed 24 hours on. */
  private async walletMoneyUnclaimed(window: ReconciliationWindow): Promise<Difference[]> {
    return (await this.store.walletMoneyUnclaimed(window)).map((message) => ({
      kind: ReconciliationDifferenceKind.WalletMoneyUnclaimed,
      subject: message.id,
      found: message.amount,
    }));
  }

  /** A matched SMS or a completed answer whose payment is still not verified 24 hours on. */
  private async proofWithoutPayment(window: ReconciliationWindow): Promise<Difference[]> {
    return (await this.store.proofWithoutPayment(window)).map((proof) => ({
      kind: ReconciliationDifferenceKind.ProofWithoutPayment,
      subject: proof.subject,
      tenantId: proof.tenantId,
      found: proof.amount,
      details: { paymentId: proof.paymentId, source: proof.source },
    }));
  }

  /**
   * A verified top-up has exactly one balance credit, of what arrived; a plan or add-on paid from the balance has charges
   * that come to its price. Each shop's ledger is read in its own context.
   */
  private async paymentsAgainstLedgers(window: ReconciliationWindow): Promise<Difference[]> {
    const topUps = await this.store.verifiedTopUps(window);
    const fromBalance = await this.store.balancePaid(window);
    const byShop = new Map<string, { topUps: PaymentFigure[]; fromBalance: PaymentFigure[] }>();
    const of = (tenantId: string) => {
      const held = byShop.get(tenantId) ?? { topUps: [], fromBalance: [] };
      byShop.set(tenantId, held);
      return held;
    };
    for (const payment of topUps) of(payment.tenantId).topUps.push(payment);
    for (const payment of fromBalance) of(payment.tenantId).fromBalance.push(payment);

    const differences: Difference[] = [];
    for (const [tenantId, payments] of byShop) {
      const ids = [...payments.topUps, ...payments.fromBalance].map((payment) => payment.id);
      const ledger = new Map(
        (await this.store.inShop((tx) => this.store.ledgerAgainst(tx, tenantId, ids))).map(
          (row) => [row.paymentId, row],
        ),
      );
      for (const payment of payments.topUps) {
        const held = ledger.get(payment.id);
        const credited = held?.credited ?? '0';
        if (held?.credits !== 1 || toPaisa(credited) !== toPaisa(payment.amount)) {
          differences.push({
            kind: ReconciliationDifferenceKind.TopUpCreditMismatch,
            subject: payment.id,
            tenantId,
            expected: payment.amount,
            found: credited,
            details: { credits: held?.credits ?? 0 },
          });
        }
      }
      for (const payment of payments.fromBalance) {
        const charged = fromPaisa(-toPaisa(ledger.get(payment.id)?.charged ?? '0'));
        if (toPaisa(charged) !== toPaisa(payment.amount)) {
          differences.push({
            kind: ReconciliationDifferenceKind.BalancePaymentMismatch,
            subject: payment.id,
            tenantId,
            expected: payment.amount,
            found: charged,
          });
        }
      }
    }
    return differences;
  }

  /** BIL-12: one invoice for each plan or add-on paid. */
  private async invoices(window: ReconciliationWindow): Promise<Difference[]> {
    return (await this.store.invoiceCountsOff(window)).map((payment) => ({
      kind: ReconciliationDifferenceKind.InvoiceMismatch,
      subject: payment.id,
      tenantId: payment.tenantId,
      details: { invoices: payment.invoices },
    }));
  }

  /** One shop's day, all in its own context: its balance, SMS, order fees, courier messages and order payments. */
  private async shopDay(
    tx: Transaction,
    tenantId: string,
    window: ReconciliationWindow,
  ): Promise<Difference[]> {
    const differences: Difference[] = [];

    const { balance, ledger } = await this.store.balanceAgainstLedger(tx, tenantId);
    if (toPaisa(balance) !== toPaisa(ledger)) {
      differences.push({
        kind: ReconciliationDifferenceKind.BalanceDrift,
        subject: tenantId,
        tenantId,
        expected: ledger,
        found: balance,
      });
    }

    const sms = await this.store.smsDay(tx, tenantId, window);
    const tookForSms = fromPaisa(toPaisa(sms.charged) - toPaisa(sms.givenBack));
    if (toPaisa(sms.logged) !== toPaisa(tookForSms)) {
      differences.push({
        kind: ReconciliationDifferenceKind.SmsChargeMismatch,
        subject: tenantId,
        tenantId,
        expected: sms.logged,
        found: tookForSms,
      });
    }

    const fees = await this.store.orderFees(tx, tenantId, window);
    for (const fee of fees) {
      const expected =
        fee.orderTotal === null || fee.minimum === null || fee.percent === null
          ? null
          : orderFeePaisa(fee.orderTotal, fee.minimum, fee.percent);
      const charged = -toPaisa(fee.amount);
      if (expected === null || charged !== expected) {
        differences.push({
          kind: ReconciliationDifferenceKind.OrderFeeMismatch,
          subject: fee.entryId,
          tenantId,
          expected: expected === null ? null : fromPaisa(expected),
          found: fromPaisa(charged),
          details: { orderId: fee.orderId },
        });
      }
    }
    const orderIds = [
      ...new Set(fees.flatMap((fee) => (fee.orderId === null ? [] : [fee.orderId]))),
    ];
    for (const [orderId, entries] of await this.store.orderFeeCounts(tx, tenantId, orderIds)) {
      if (entries > 1) {
        differences.push({
          kind: ReconciliationDifferenceKind.OrderFeeMismatch,
          subject: `order:${orderId}`,
          tenantId,
          details: { orderId, entries },
        });
      }
    }

    for (const message of await this.store.unreadCourier(tx, tenantId, window)) {
      differences.push({
        kind: ReconciliationDifferenceKind.CourierMessageUnread,
        subject: message.id,
        tenantId,
        details: { courier: message.courierKey, outcome: message.outcome },
      });
    }

    for (const payment of await this.store.shopPaymentsWithoutProof(tx, tenantId, window)) {
      differences.push({
        kind: ReconciliationDifferenceKind.ShopPaymentWithoutProof,
        subject: payment.id,
        tenantId,
        found: payment.amount,
      });
    }
    return differences;
  }

  /** DAT-52: the operators are told -- counts and kinds only, never an amount's owner or a secret. */
  private async tell(day: string, added: number, kinds: string[], failed: number): Promise<void> {
    const counts = new Map<string, number>();
    for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const lines = [...counts].map(([kind, count]) => `${kind}: ${String(count)}`);
    const body =
      (added > 0
        ? `The daily reconciliation of ${day} found ${String(added)} new difference(s):\n${lines.join('\n')}\n`
        : `The daily reconciliation of ${day} found no new differences.\n`) +
      (failed > 0
        ? `${String(failed)} check(s) could not be made; the server's log says which.\n`
        : '') +
      'Look at them in the console (DAT-52).';
    try {
      await this.operators.alert(
        `Reconciliation of ${day}: ${String(added)} new difference(s)`,
        body,
      );
    } catch (error) {
      this.logger.error(
        `the operators couldn't be told of the reconciliation of ${day}`,
        error as Error,
      );
    }
  }
}
