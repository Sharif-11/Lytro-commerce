import type {
  NewPaymentSession,
  PaymentDecision,
  PaidToSnapshot,
  PaymentPageReportRow,
  PaymentSubmission,
  SelectPaymentPageReport,
  SelectPaymentSession,
  Transaction,
} from '@lytronix/db';
import type {
  GatewayResult,
  PaymentMethod,
  PaymentPageReportReason,
  PaymentPageReportStatus,
  PaymentReviewReason,
  PaymentSessionState,
  TenantState,
} from '@lytronix/validators';

/** PAY-01 to PAY-08 (Slice 5.2): tenant.payment_sessions, the references that find a session's shop, and the ID registry. */
export interface PaymentSessionStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** TEN-29: a reference's shop, before the shop is known; null for none. */
  tenantOfRef(ref: string): Promise<string | null>;
  listShopIds(): Promise<string[]>;
  insert(
    tx: Transaction,
    tenantId: string,
    values: NewPaymentSession,
  ): Promise<SelectPaymentSession>;
  findByRef(
    tx: Transaction,
    tenantId: string,
    ref: string,
    lock?: boolean,
  ): Promise<SelectPaymentSession | null>;
  orderNumberOf(tx: Transaction, tenantId: string, orderId: string): Promise<string>;
  /** VER-01 (Slice 5.3): a session by its id, held for a decision when `lock`. */
  findById(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<SelectPaymentSession | null>;
  decide(tx: Transaction, tenantId: string, id: string, decision: PaymentDecision): Promise<void>;
  /** TVR-04: the shop's online payments verified since `since`, and every open session, in TK. */
  capTotal(tx: Transaction, tenantId: string, since: Date): Promise<string>;
  newShopOf(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ state: TenantState; createdAt: Date; newShopCap: boolean | null } | null>;
  setNewShopCap(tx: Transaction, tenantId: string, capped: boolean | null): Promise<void>;
  /** PAY-24: the order's session still open, if it has one. */
  openForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectPaymentSession | null>;
  openForTracking(
    tx: Transaction,
    tenantId: string,
    trackingId: string,
  ): Promise<SelectPaymentSession | null>;
  submit(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: PaymentSubmission,
  ): Promise<SelectPaymentSession>;
  /** PAY-07 (Slice 5.4b): the ID corrected; the session waits again. */
  changeTyped(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { transactionId: string; senderNumber: string | null },
  ): Promise<SelectPaymentSession>;
  /** VER-02, VER-04 (Slice 5.4b): the session a receipt with this ID settles, held. */
  lockTyped(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<SelectPaymentSession | null>;
  toReview(
    tx: Transaction,
    tenantId: string,
    id: string,
    reason: PaymentReviewReason,
  ): Promise<SelectPaymentSession>;
  markTold(tx: Transaction, tenantId: string, id: string, at: Date): Promise<void>;
  lockUntold(tx: Transaction, tenantId: string, before: Date): Promise<SelectPaymentSession[]>;
  /** VER-07 (Slice 5.4b): whether any of the shop's phones reported since `since`. */
  phoneSeenSince(tx: Transaction, tenantId: string, since: Date): Promise<boolean>;
  /** PAY-14, PAY-07 (Slice 5.4b): a receipt that claimed this session is unclaimed again. */
  releaseReceipt(tx: Transaction, tenantId: string, sessionId: string): Promise<void>;
  lockExpired(tx: Transaction, tenantId: string, now: Date): Promise<SelectPaymentSession[]>;
  /** PAY-06, VER-09, WAL-21 (Slice 5.7): a try at the wallet's own checkout, and how it ends. */
  beginGateway(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { method: PaymentMethod; accountId: string; feeHeld: string; test: boolean },
  ): Promise<void>;
  gatewayStarted(
    tx: Transaction,
    tenantId: string,
    id: string,
    checkout: { paymentId: string; redirectUrl: string },
  ): Promise<void>;
  endGateway(tx: Transaction, tenantId: string, id: string, result: GatewayResult): Promise<void>;
  gatewayPaid(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: {
      transactionId: string;
      senderNumber: string | null;
      paidTo: PaidToSnapshot | null;
      at: Date;
    },
  ): Promise<SelectPaymentSession>;
  gatewayDue(tx: Transaction, tenantId: string, now: Date): Promise<SelectPaymentSession[]>;
  setState(
    tx: Transaction,
    tenantId: string,
    id: string,
    state: PaymentSessionState,
  ): Promise<void>;
  /** PAY-16: whether a payment platform-wide already holds this transaction ID. */
  transactionIdUsed(tx: Transaction, transactionId: string): Promise<boolean>;
  /** TVR-03 (Slice 5.2b): the shop's payment page -- suspended since when, or null; null for no such shop. */
  paymentPageOf(tx: Transaction, tenantId: string): Promise<{ suspendedAt: Date | null } | null>;
  setPaymentPageSuspension(
    tx: Transaction,
    tenantId: string,
    suspension: { reason: string; at: Date } | null,
  ): Promise<void>;
  /** TVR-02, ADM-12: shoppers' reports of payment pages, in control. */
  insertReport(
    tx: Transaction,
    values: {
      tenantId: string;
      ref: string;
      reason: PaymentPageReportReason;
      note: string | null;
      ip: string | null;
    },
  ): Promise<void>;
  reportsFromIpSince(tx: Transaction, ip: string, since: Date): Promise<number>;
  listReports(status: PaymentPageReportStatus, limit: number): Promise<PaymentPageReportRow[]>;
  dismissReport(
    tx: Transaction,
    id: string,
    operatorId: string,
    at: Date,
  ): Promise<SelectPaymentPageReport | null>;
  actionReports(tx: Transaction, tenantId: string, operatorId: string, at: Date): Promise<number>;
  /** LIF-19: the shop's sessions, their references and its page reports. */
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
