import type { Executor } from '../../transactions';
import { platformAuditLog } from '../../schema';
import type { PlatformActorType, PlatformAuditAction, AuditResult } from '@lytronix/validators';

// ADM-08: insert-only (the app role has no UPDATE/DELETE grant on this table — see migration 0001). The first
// writer is the break-glass 2FA reset script (ADM-18); the full operator-action audit trail (ADM-04) is a
// later slice's work, not this one's.

export interface NewPlatformAuditEntry {
  actorType: PlatformActorType;
  actorId: string | null;
  action: PlatformAuditAction;
  targetType: string | null;
  targetId: string | null;
  result: AuditResult;
  ip: string | null;
  summary: unknown;
}

export class PlatformAuditLogRepository {
  async insert(db: Executor, entry: NewPlatformAuditEntry): Promise<void> {
    await db.insert(platformAuditLog).values(entry);
  }
}
