import type {
  NewPaymentSession,
  PaymentSubmission,
  SelectPaymentSession,
  Transaction,
} from '@lytronix/db';
import type { PaymentSessionState } from '@lytronix/validators';

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
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
