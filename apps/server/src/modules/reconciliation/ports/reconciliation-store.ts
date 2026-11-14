import type {
  ChargedOrderFee,
  DifferenceFilter,
  InsertReconciliationDifference,
  LedgerAgainst,
  ListedReconciliationDifference,
  PaymentFigure,
  ReconciliationWindow,
  SelectCourierRawMessage,
  SelectReconciliationDifference,
  Transaction,
} from '@lytronix/db';
import type { ReconciliationDifferenceKind } from '@lytronix/validators';

/**
 * DAT-51, DAT-52, D9-16 (Phase 9 Slice 9.5): what the daily reconciliation reads and writes. Lytro's own figures come from
 * control; a shop's only inside a transaction in its own context (`inShop`).
 */
export interface ReconciliationStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  inShop<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;

  // Lytro's own money
  paymentsWithoutProof(window: ReconciliationWindow): Promise<PaymentFigure[]>;
  walletMoneyUnclaimed(
    window: ReconciliationWindow,
  ): Promise<{ id: string; amount: string | null }[]>;
  proofWithoutPayment(window: ReconciliationWindow): Promise<
    {
      subject: string;
      paymentId: string;
      tenantId: string | null;
      amount: string | null;
      source: string;
    }[]
  >;
  verifiedTopUps(window: ReconciliationWindow): Promise<PaymentFigure[]>;
  balancePaid(window: ReconciliationWindow): Promise<PaymentFigure[]>;
  invoiceCountsOff(
    window: ReconciliationWindow,
  ): Promise<{ id: string; tenantId: string; amount: string; invoices: number }[]>;
  shops(): Promise<string[]>;

  // One shop's own records, in its context
  balanceAgainstLedger(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ balance: string; ledger: string }>;
  ledgerAgainst(
    tx: Transaction,
    tenantId: string,
    paymentIds: readonly string[],
  ): Promise<LedgerAgainst[]>;
  smsDay(
    tx: Transaction,
    tenantId: string,
    window: ReconciliationWindow,
  ): Promise<{ logged: string; charged: string; givenBack: string }>;
  orderFees(
    tx: Transaction,
    tenantId: string,
    window: ReconciliationWindow,
  ): Promise<ChargedOrderFee[]>;
  orderFeeCounts(
    tx: Transaction,
    tenantId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, number>>;
  unreadCourier(
    tx: Transaction,
    tenantId: string,
    window: ReconciliationWindow,
  ): Promise<SelectCourierRawMessage[]>;
  shopPaymentsWithoutProof(
    tx: Transaction,
    tenantId: string,
    window: ReconciliationWindow,
  ): Promise<{ id: string; amount: string }[]>;

  // What it found
  record(
    rows: readonly InsertReconciliationDifference[],
  ): Promise<SelectReconciliationDifference[]>;
  recordRun(
    day: string,
    found: number,
    counts: Partial<Record<ReconciliationDifferenceKind, number>>,
    at: Date,
  ): Promise<boolean>;
  list(
    filter: DifferenceFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: ListedReconciliationDifference[]; total: number }>;
  /** Slice 9.9: the newest run, null before the first. */
  lastRun(): Promise<{ day: string; ranAt: Date } | null>;
  findDifference(tx: Transaction, id: string): Promise<SelectReconciliationDifference | null>;
  resolve(
    tx: Transaction,
    id: string,
    values: { note: string; resolvedBy: string; resolvedAt: Date },
  ): Promise<SelectReconciliationDifference | null>;

  // DAT-51: past their days
  purgeGatewayAnswers(before: Date): Promise<number>;
  purgeCourier(tx: Transaction, tenantId: string, before: Date): Promise<number>;
}
