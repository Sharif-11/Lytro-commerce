import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { SignInMethod } from '@lytronix/validators';
import { sessions } from '../../schema';

// D1, SEC-07: server-side session rows. Only hashes are stored. Each method takes an executor, so it runs on the
// pool or inside a transaction.

export type SessionRow = typeof sessions.$inferSelect;

export interface NewSession {
  tokenHash: string;
  csrfHash: string;
  subscriberId: string;
  tenantId: string | null;
  mustSetPassword: boolean;
  signInMethod: SignInMethod;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export class SessionRepository {
  async insert(db: Executor, values: NewSession): Promise<SessionRow> {
    const [row] = await db.insert(sessions).values(values).returning();
    if (!row) throw new Error('insert returned no session row');
    return row;
  }

  /** A session that is neither revoked nor expired. The caller checks the tenant and host rules. */
  async findActiveByTokenHash(
    db: Executor,
    tokenHash: string,
    now: Date,
  ): Promise<SessionRow | null> {
    const rows = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async attachTenant(db: Executor, sessionId: string, tenantId: string): Promise<void> {
    await db.update(sessions).set({ tenantId }).where(eq(sessions.id, sessionId));
  }

  async clearMustSetPassword(db: Executor, sessionId: string): Promise<void> {
    await db.update(sessions).set({ mustSetPassword: false }).where(eq(sessions.id, sessionId));
  }

  async revoke(db: Executor, sessionId: string, at: Date): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  /** Ends every other live session of a subscriber (password change, forgot-password). */
  /** Ends every live session of a subscriber except the one kept (password change, AUTH-20). */
  async revokeAllForSubscriberExcept(
    db: Executor,
    subscriberId: string,
    keepSessionId: string,
    at: Date,
  ): Promise<number> {
    const rows = await db
      .update(sessions)
      .set({ revokedAt: at })
      .where(
        and(
          eq(sessions.subscriberId, subscriberId),
          isNull(sessions.revokedAt),
          ne(sessions.id, keepSessionId),
        ),
      )
      .returning({ id: sessions.id });
    return rows.length;
  }
}
