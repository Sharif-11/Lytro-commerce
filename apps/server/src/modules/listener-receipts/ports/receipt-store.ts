import type {
  ListenerMessageCounts,
  ListenerMessageFilter,
  ListenerMessageOutcome,
  ListenerMessageRow,
  NewListenerMessage,
  SelectListenerMessage,
  SelectListenerUnreadShape,
  Transaction,
} from '@lytronix/db';

/** VER-02 to VER-06, LSN-13 to LSN-17 (Slice 5.4b): what phones forwarded, and what uploading notes on the phone. */
export interface ReceiptStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  listShopIds(): Promise<string[]>;
  holdTransactionId(tx: Transaction, tenantId: string, transactionId: string): Promise<void>;
  holderOf(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<SelectListenerMessage | null>;
  ofPhone(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    transactionId: string,
  ): Promise<SelectListenerMessage | null>;
  insert(
    tx: Transaction,
    tenantId: string,
    values: NewListenerMessage,
  ): Promise<SelectListenerMessage>;
  settle(
    tx: Transaction,
    tenantId: string,
    id: string,
    outcome: ListenerMessageOutcome,
  ): Promise<SelectListenerMessage>;
  paymentCarrying(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<{ id: string; sessionId: string | null } | null>;
  recent(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    limit: number,
  ): Promise<ListenerMessageRow[]>;
  counts(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    since: Date,
  ): Promise<ListenerMessageCounts>;
  list(
    tx: Transaction,
    tenantId: string,
    filter: ListenerMessageFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: ListenerMessageRow[]; total: number }>;
  redact(
    tx: Transaction,
    tenantId: string,
    before: Date,
  ): Promise<{ redacted: number; removed: number }>;
  noteUploads(
    tx: Transaction,
    deviceId: string,
    values: { at: Date; appVersion: string; day: string; count: number },
  ): Promise<void>;
  flagVolume(tx: Transaction, deviceId: string, at: Date, since: Date): Promise<boolean>;
  addUnread(
    tx: Transaction,
    values: { day: string; shapeHash: string; shape: string },
  ): Promise<number>;
  listUnread(day: string): Promise<SelectListenerUnreadShape[]>;
  purgeUnread(tx: Transaction, day: string): Promise<number>;
}
