import type { NewPlatformAuditEntry } from '@lytronix/db';

/** control.platform_audit_log. Platform-wide, no tenant context — implemented in database/adapters. */
export interface PlatformAuditStore {
  insert(entry: NewPlatformAuditEntry): Promise<void>;
}
