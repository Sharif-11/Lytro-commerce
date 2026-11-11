import type {
  InsertManualPaymentEntry,
  ManualEntryFilters,
  ManualEntryRow,
  SelectManualPaymentEntry,
  Transaction,
} from '@lytronix/db';

/** control.manual_payment_entries (ADM-14, ADM-15), append-only. */
export interface ManualEntriesStore {
  insert(tx: Transaction, values: InsertManualPaymentEntry): Promise<SelectManualPaymentEntry>;
  findById(tx: Transaction, id: string): Promise<SelectManualPaymentEntry | null>;
  /** ADM-15: how many entries anyone made since then, under a lock to the end of the transaction; a reversal is not one. */
  countEntriesSince(tx: Transaction, since: Date): Promise<number>;
  /** D8-56: whether an entry that used this ID has been reversed. */
  hasReversedUse(tx: Transaction, transactionId: string): Promise<boolean>;
  walletExists(id: string): Promise<boolean>;
  /** D8-75: one of Lytro's bank accounts. */
  bankAccountExists(id: string): Promise<boolean>;
  list(filters: ManualEntryFilters): Promise<{ entries: ManualEntryRow[]; total: number }>;
  /** One entry as the list reads it, in the caller's transaction. */
  view(tx: Transaction, id: string): Promise<ManualEntryRow | null>;
}
