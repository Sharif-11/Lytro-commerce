import type { Transaction } from '@lytronix/db';

/** What sending a usage notice needs besides the shop: a transaction to queue it in, and where the operators read. */
export interface UsageNoticeStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** RTE-12: every operator account that finished enrolling (ADM-01). */
  operatorEmails(): Promise<string[]>;
}
