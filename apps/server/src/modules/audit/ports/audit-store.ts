import type { Transaction } from '@lytronix/db';
import type {
  ActivityCursor,
  ActivityFilters,
  ActivityRecord,
  AuditEntry,
} from '../types/activity';

/** One shop's activity log. Every method runs inside a transaction that carries the tenant context. */
export interface AuditStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  insert(tx: Transaction, entry: AuditEntry): Promise<void>;
  list(
    tx: Transaction,
    tenantId: string,
    filters: ActivityFilters,
    cursor: ActivityCursor | null,
    limit: number,
  ): Promise<ActivityRecord[]>;
  /** Deletes entries older than the cutoff. Returns how many were removed (AUD-06). */
  purgeOlderThan(tx: Transaction, tenantId: string, cutoff: Date): Promise<number>;
}
