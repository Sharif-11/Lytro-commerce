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
  /** DWN-11: the "what will be trimmed" count for the retention-shrink notice. */
  countInRange(
    tx: Transaction,
    tenantId: string,
    range: { after: Date; before: Date; excludeActions: string[] },
  ): Promise<number>;
}
