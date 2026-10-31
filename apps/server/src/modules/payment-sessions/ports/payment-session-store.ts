import type {
  NewPaymentSession,
  PaymentDecision,
  PaymentPageReportRow,
  PaymentSubmission,
  SelectPaymentPageReport,
  SelectPaymentSession,
  Transaction,
} from '@lytronix/db';
import type {
  PaymentPageReportReason,
  PaymentPageReportStatus,
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
  lockExpired(tx: Transaction, tenantId: string, now: Date): Promise<SelectPaymentSession[]>;
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
