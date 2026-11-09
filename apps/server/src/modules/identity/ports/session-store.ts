import type { NewSession, SessionRow, Transaction } from '@lytronix/db';

/** One session row, as the server reads it. */
export type SessionRecord = SessionRow;

/** Session rows (D1). Reads use the pool; sign-in and password changes write inside their unit of work. */
export interface SessionStore {
  insert(tx: Transaction, values: NewSession): Promise<SessionRecord>;
  findActive(tokenHash: string, now: Date): Promise<SessionRecord | null>;
  attachTenant(tx: Transaction, sessionId: string, tenantId: string): Promise<void>;
  clearMustSetPassword(tx: Transaction, sessionId: string): Promise<void>;
  revokeOthers(
    tx: Transaction,
    subscriberId: string,
    keepSessionId: string,
    at: Date,
  ): Promise<number>;
  revoke(sessionId: string, at: Date): Promise<void>;
  /** ADM-03, D8-27: when each account last opened a session in the shop. */
  lastSignInsOf(tenantId: string): Promise<{ subscriberId: string; at: Date }[]>;
}
