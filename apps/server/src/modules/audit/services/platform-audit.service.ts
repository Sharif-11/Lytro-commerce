import { Inject, Injectable } from '@nestjs/common';
import type { NewPlatformAuditEntry, RecentAuditEntryRow, Transaction } from '@lytronix/db';
import type { PlatformAuditAction } from '@lytronix/validators';
import type { PlatformAuditStore } from '../ports/platform-audit-store';
import { PLATFORM_AUDIT_STORE } from '../tokens';

/**
 * Writes control.platform_audit_log (ADM-08) — every operator-caused or system-caused platform action, as
 * opposed to AuditService's tenant.activity_log (D2-5). A leaf: depends on nothing else in the server.
 */
@Injectable()
export class PlatformAuditService {
  constructor(@Inject(PLATFORM_AUDIT_STORE) private readonly store: PlatformAuditStore) {}

  record(entry: NewPlatformAuditEntry): Promise<void> {
    return this.store.insert(entry);
  }

  /**
   * For an action made in a transaction: the entry joins it, so a committed action always has its entry and a
   * rolled-back one never does (ADM-08).
   */
  recordWithin(tx: Transaction, entry: NewPlatformAuditEntry): Promise<void> {
    return this.store.insertWithin(tx, entry);
  }

  /** Who did this to this target last. */
  latest(
    action: PlatformAuditAction,
    targetId: string,
  ): Promise<{ actorId: string | null } | null> {
    return this.store.latest(action, targetId);
  }

  /** The newest entries of these actions. */
  recent(actions: readonly PlatformAuditAction[], limit: number): Promise<RecentAuditEntryRow[]> {
    return this.store.recent(actions, limit);
  }
}
