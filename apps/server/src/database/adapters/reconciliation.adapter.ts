import { Inject, Injectable } from '@nestjs/common';
import {
  RawMessageRepository,
  ReconciliationRepository,
  TransactionRunner,
  type ChargedOrderFee,
  type DifferenceFilter,
  type InsertReconciliationDifference,
  type LedgerAgainst,
  type PaymentFigure,
  type ReconciliationWindow,
  type ListedReconciliationDifference,
  type SelectCourierRawMessage,
  type SelectReconciliationDifference,
  type Transaction,
} from '@lytronix/db';
import { RawMessageOutcome, type ReconciliationDifferenceKind } from '@lytronix/validators';
import type { ReconciliationStore } from '../../modules/reconciliation/ports/reconciliation-store';
import { DatabaseService } from '../database.service';

/** DAT-51, DAT-52 (Phase 9 Slice 9.5): the reconciliation's reads, findings and clean-up, on the write pool. */
@Injectable()
export class DrizzleReconciliationStore implements ReconciliationStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ReconciliationRepository) private readonly figures: ReconciliationRepository,
    @Inject(RawMessageRepository) private readonly raw: RawMessageRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, work);
  }

  /** A shop's records are read in a transaction of their own; each read sets the shop's context first. */
  inShop<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, work);
  }

  paymentsWithoutProof(window: ReconciliationWindow): Promise<PaymentFigure[]> {
    return this.figures.paymentsWithoutProof(this.db, window);
  }

  walletMoneyUnclaimed(
    window: ReconciliationWindow,
  ): Promise<{ id: string; amount: string | null }[]> {
    return this.figures.walletMoneyUnclaimed(this.db, window);
  }

  proofWithoutPayment(window: ReconciliationWindow) {
    return this.figures.proofWithoutPayment(this.db, window);
  }

  verifiedTopUps(window: ReconciliationWindow): Promise<PaymentFigure[]> {
    return this.figures.verifiedTopUps(this.db, window);
  }

  balancePaid(window: ReconciliationWindow): Promise<PaymentFigure[]> {
    return this.figures.balancePaid(this.db, window);
  }

  invoiceCountsOff(window: ReconciliationWindow) {
    return this.figures.invoiceCountsOff(this.db, window);
  }

  shops(): Promise<string[]> {
    return this.figures.shops(this.db);
  }

  balanceAgainstLedger(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ balance: string; ledger: string }> {
    return this.figures.balanceAgainstLedger(tx, tenantId);
  }

  ledgerAgainst(
    tx: Transaction,
    tenantId: string,
    paymentIds: readonly string[],
  ): Promise<LedgerAgainst[]> {
    return this.figures.ledgerAgainst(tx, tenantId, paymentIds);
  }

  smsDay(tx: Transaction, tenantId: string, window: ReconciliationWindow) {
    return this.figures.smsDay(tx, tenantId, window);
  }

  orderFees(
    tx: Transaction,
    tenantId: string,
    window: ReconciliationWindow,
  ): Promise<ChargedOrderFee[]> {
    return this.figures.orderFees(tx, tenantId, window);
  }

  orderFeeCounts(
    tx: Transaction,
    tenantId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, number>> {
    return this.figures.orderFeeCounts(tx, tenantId, orderIds);
  }

  unreadCourier(
    tx: Transaction,
    tenantId: string,
    window: ReconciliationWindow,
  ): Promise<SelectCourierRawMessage[]> {
    return this.raw.unreadCourier(tx, tenantId, window.from, window.to, RawMessageOutcome.Read);
  }

  shopPaymentsWithoutProof(tx: Transaction, tenantId: string, window: ReconciliationWindow) {
    return this.figures.shopPaymentsWithoutProof(tx, tenantId, window);
  }

  record(
    rows: readonly InsertReconciliationDifference[],
  ): Promise<SelectReconciliationDifference[]> {
    return this.figures.record(this.db, rows);
  }

  recordRun(
    day: string,
    found: number,
    counts: Partial<Record<ReconciliationDifferenceKind, number>>,
    at: Date,
  ): Promise<boolean> {
    return this.figures.recordRun(this.db, day, found, counts, at);
  }

  list(
    filter: DifferenceFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: ListedReconciliationDifference[]; total: number }> {
    return this.figures.list(this.db, filter, page);
  }

  lastRun(): Promise<{ day: string; ranAt: Date } | null> {
    return this.figures.lastRun(this.db);
  }

  findDifference(tx: Transaction, id: string): Promise<SelectReconciliationDifference | null> {
    return this.figures.findDifference(tx, id);
  }

  resolve(
    tx: Transaction,
    id: string,
    values: { note: string; resolvedBy: string; resolvedAt: Date },
  ): Promise<SelectReconciliationDifference | null> {
    return this.figures.resolve(tx, id, values);
  }

  purgeGatewayAnswers(before: Date): Promise<number> {
    return this.raw.purgeGatewayAnswers(this.db, before);
  }

  purgeCourier(tx: Transaction, tenantId: string, before: Date): Promise<number> {
    return this.raw.purgeCourier(tx, tenantId, before);
  }
}
