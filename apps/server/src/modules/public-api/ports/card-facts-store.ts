import type { Transaction } from '@lytronix/db';

/** SB-10 (the owner, 2026-11-20): the shops' kept card facts, which the minute tick works out again when due. */
export interface CardFactsStore {
  /** A transaction on the write pool. */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Every shop not deleted. */
  listShopIds(): Promise<string[]>;
  /** Whether the shop's facts are due, held for this transaction when they are. */
  due(tx: Transaction, tenantId: string): Promise<boolean>;
  /** Works the shop's facts out again and keeps them; the products kept. */
  refresh(tx: Transaction, tenantId: string, since: Date, top: number): Promise<number>;
}
