import type { NewLytroMessage, SelectLytroListenerMessage, Transaction } from '@lytronix/db';
import type { ListenerMessageStatus, PaymentReviewReason } from '@lytronix/validators';

/** PAY-21 (Slice 5.6): what Lytro's own phones forwarded. */
export interface LytroReceiptStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  holdTransactionId(tx: Transaction, transactionId: string): Promise<void>;
  holderOf(tx: Transaction, transactionId: string): Promise<SelectLytroListenerMessage | null>;
  ofPhone(
    tx: Transaction,
    deviceId: string,
    transactionId: string,
  ): Promise<SelectLytroListenerMessage | null>;
  insert(tx: Transaction, values: NewLytroMessage): Promise<SelectLytroListenerMessage>;
  /** VER-06: one that verifies nothing needs no transaction of its own. */
  insertAlone(values: NewLytroMessage): Promise<SelectLytroListenerMessage>;
  settle(
    tx: Transaction,
    id: string,
    outcome: {
      status: ListenerMessageStatus;
      reviewReason: PaymentReviewReason | null;
      planPaymentId: string | null;
    },
  ): Promise<SelectLytroListenerMessage>;
  recent(deviceId: string, limit: number): Promise<SelectLytroListenerMessage[]>;
  counts(
    deviceId: string,
    since: Date,
  ): Promise<{ verified: number; waiting: number; toCheck: number }>;
  list(
    filter: { status?: ListenerMessageStatus; search: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectLytroListenerMessage[]; total: number }>;
  redact(before: Date): Promise<{ redacted: number; removed: number }>;
}
