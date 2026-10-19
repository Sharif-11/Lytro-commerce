import type { NewPlatformAuditEntry, Transaction } from '@lytronix/db';

/** control.platform_audit_log. Platform-wide, no tenant context — implemented in database/adapters. */
export interface PlatformAuditStore {
  insert(entry: NewPlatformAuditEntry): Promise<void>;
  /** The same write inside the caller's transaction, so it commits or rolls back with the action it records. */
  insertWithin(tx: Transaction, entry: NewPlatformAuditEntry): Promise<void>;
}
