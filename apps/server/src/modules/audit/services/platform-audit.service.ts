import { Inject, Injectable } from '@nestjs/common';
import type { NewPlatformAuditEntry } from '@lytronix/db';
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
}
