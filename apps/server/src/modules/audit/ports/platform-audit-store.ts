import type { NewPlatformAuditEntry, RecentAuditEntryRow, Transaction } from '@lytronix/db';
import type { PlatformAuditAction } from '@lytronix/validators';

/** control.platform_audit_log. Platform-wide, no tenant context — implemented in database/adapters. */
export interface PlatformAuditStore {
  insert(entry: NewPlatformAuditEntry): Promise<void>;
  /** The same write inside the caller's transaction, so it commits or rolls back with the action it records. */
  insertWithin(tx: Transaction, entry: NewPlatformAuditEntry): Promise<void>;
  latest(action: PlatformAuditAction, targetId: string): Promise<{ actorId: string | null } | null>;
  recent(actions: readonly PlatformAuditAction[], limit: number): Promise<RecentAuditEntryRow[]>;
}
