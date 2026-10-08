import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { operatorSessions } from '../../schema';

// SEC-14, D8: operator sessions, mirroring SessionRepository's shape but kept in a separate table (ADM-01) —
// an operator session can never be mistaken for a tenant one.

export type OperatorSessionRow = typeof operatorSessions.$inferSelect;

export interface NewOperatorSession {
  tokenHash: string;
  csrfHash: string;
  operatorId: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export class OperatorSessionRepository {
  async insert(db: Executor, values: NewOperatorSession): Promise<OperatorSessionRow> {
    const [row] = await db.insert(operatorSessions).values(values).returning();
    if (!row) throw new Error('insert returned no operator session row');
    return row;
  }

  /** A session that is neither revoked nor expired. */
  async findActiveByTokenHash(
    db: Executor,
    tokenHash: string,
    now: Date,
  ): Promise<OperatorSessionRow | null> {
    const rows = await db
      .select()
      .from(operatorSessions)
      .where(
        and(
          eq(operatorSessions.tokenHash, tokenHash),
          isNull(operatorSessions.revokedAt),
          gt(operatorSessions.expiresAt, now),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async revoke(db: Executor, sessionId: string, at: Date): Promise<void> {
    await db
      .update(operatorSessions)
      .set({ revokedAt: at })
      .where(and(eq(operatorSessions.id, sessionId), isNull(operatorSessions.revokedAt)));
  }
}
