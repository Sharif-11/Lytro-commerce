import { Inject, Injectable } from '@nestjs/common';
import { SessionRepository, type NewSession, type Transaction } from '@lytronix/db';
import type { SessionRecord, SessionStore } from '../../modules/identity/ports/session-store';
import { DatabaseService } from '../database.service';

/** Session rows (D1), through the session repository. */
@Injectable()
export class DrizzleSessionStore implements SessionStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
  ) {}

  insert(tx: Transaction, values: NewSession): Promise<SessionRecord> {
    return this.sessions.insert(tx, values);
  }

  findActive(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    return this.sessions.findActiveByTokenHash(this.database.handle.db, tokenHash, now);
  }

  attachTenant(tx: Transaction, sessionId: string, tenantId: string): Promise<void> {
    return this.sessions.attachTenant(tx, sessionId, tenantId);
  }

  clearMustSetPassword(tx: Transaction, sessionId: string): Promise<void> {
    return this.sessions.clearMustSetPassword(tx, sessionId);
  }

  async revokeOthers(
    tx: Transaction,
    subscriberId: string,
    keepSessionId: string,
    at: Date,
  ): Promise<number> {
    return this.sessions.revokeAllForSubscriberExcept(tx, subscriberId, keepSessionId, at);
  }

  revoke(sessionId: string, at: Date): Promise<void> {
    return this.sessions.revoke(this.database.handle.db, sessionId, at);
  }
}
