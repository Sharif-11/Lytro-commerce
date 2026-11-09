import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { ChallengeChannel, ChallengeKind } from '@lytronix/validators';
import type { Executor } from '../../transactions';
import { verificationChallenges } from '../../schema';

// AUTH-05 to AUTH-07: rows behind one-time codes. Rules (limits, lock, expiry) live in the service; this class only
// reads and writes rows. Each method takes an executor, so it runs on the pool or inside a transaction.

export type ChallengeRow = typeof verificationChallenges.$inferSelect;

export class ChallengeRepository {
  async insert(
    db: Executor,
    values: {
      destination: string;
      channel: ChallengeChannel;
      kind: ChallengeKind;
      codeHash: string;
      expiresAt: Date;
      requestedIp?: string | null;
    },
  ): Promise<ChallengeRow> {
    const rows = await db.insert(verificationChallenges).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no challenge row');
    return row;
  }

  /**
   * SMS-11: holds, until the transaction ends, the right to ask for a code for this destination (and, when one is named,
   * from this address), so requests at once count each other against the cooldown and the caps.
   */
  async holdRequests(
    db: Executor,
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
    ip: string | null,
  ): Promise<void> {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`challenge:${channel}:${kind}:${destination}`}, 0))`,
    );
    if (ip !== null) {
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`challenge_ip:${channel}:${ip}`}, 0))`,
      );
    }
  }

  /** The most recent challenge of a kind for a destination on a channel. */
  async latest(
    db: Executor,
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
  ): Promise<ChallengeRow | null> {
    const rows = await db
      .select()
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.destination, destination),
          eq(verificationChallenges.channel, channel),
          eq(verificationChallenges.kind, kind),
        ),
      )
      .orderBy(desc(verificationChallenges.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async countSince(
    db: Executor,
    destination: string,
    channel: ChallengeChannel,
    kind: ChallengeKind,
    since: Date,
  ): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.destination, destination),
          eq(verificationChallenges.channel, channel),
          eq(verificationChallenges.kind, kind),
          gt(verificationChallenges.createdAt, since),
        ),
      );
    return rows[0]?.total ?? 0;
  }

  /** SMS-11: the codes one client address asked for on a channel since a moment, whatever their phone or kind. */
  async countFromIpSince(
    db: Executor,
    ip: string,
    channel: ChallengeChannel,
    since: Date,
  ): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.requestedIp, ip),
          eq(verificationChallenges.channel, channel),
          gt(verificationChallenges.createdAt, since),
        ),
      );
    return rows[0]?.total ?? 0;
  }

  /** Counts one wrong attempt atomically and returns the new total, so parallel guesses cannot miss the lock. */
  async recordWrongAttempt(db: Executor, challengeId: string): Promise<number> {
    const rows = await db
      .update(verificationChallenges)
      .set({ attempts: sql`${verificationChallenges.attempts} + 1` })
      .where(eq(verificationChallenges.id, challengeId))
      .returning({ attempts: verificationChallenges.attempts });
    return rows[0]?.attempts ?? 0;
  }

  async lock(db: Executor, challengeId: string, until: Date): Promise<void> {
    await db
      .update(verificationChallenges)
      .set({ lockedUntil: until })
      .where(eq(verificationChallenges.id, challengeId));
  }

  /** Marks a challenge used only if it was not used before. False when another request got there first. */
  async consume(db: Executor, challengeId: string, at: Date): Promise<boolean> {
    const rows = await db
      .update(verificationChallenges)
      .set({ consumedAt: at })
      .where(
        and(eq(verificationChallenges.id, challengeId), isNull(verificationChallenges.consumedAt)),
      )
      .returning({ id: verificationChallenges.id });
    return rows.length === 1;
  }
}
