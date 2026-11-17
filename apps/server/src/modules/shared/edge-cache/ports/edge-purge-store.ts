import type { Transaction } from '@lytronix/db';

/** D9-32: what queuing a purge reads -- the shop's slug, which names its pages' tags -- and its own transaction. */
export interface EdgePurgeStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  slugOf(tx: Transaction, tenantId: string): Promise<string | null>;
}
