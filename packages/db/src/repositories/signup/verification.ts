import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import type { Database } from '../../client';
import { smsOutbox, verificationChallenges } from '../../schema';

// AUTH-05 to AUTH-07: the queries behind one-time codes. Limits are enforced by the service; this file only
// reads and writes rows, so each rule can be tested with the database alone.

export type ChallengeRow = typeof verificationChallenges.$inferSelect;

export async function insertChallenge(
  db: Database,
  values: { phone: string; codeHash: string; expiresAt: Date },
): Promise<ChallengeRow> {
  const rows = await db.insert(verificationChallenges).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error('insert returned no challenge row');
  return row;
}

/** The most recent sign-up challenge for a number, used by the cooldown and by verification. */
export async function latestChallenge(db: Database, phone: string): Promise<ChallengeRow | null> {
  const rows = await db
    .select()
    .from(verificationChallenges)
    .where(
      and(eq(verificationChallenges.phone, phone), eq(verificationChallenges.purpose, 'signup')),
    )
    .orderBy(desc(verificationChallenges.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Codes issued for a number since a moment, for the hourly cap (AUTH-07). */
export async function countChallengesSince(
  db: Database,
  phone: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(verificationChallenges)
    .where(
      and(
        eq(verificationChallenges.phone, phone),
        eq(verificationChallenges.purpose, 'signup'),
        gt(verificationChallenges.createdAt, since),
      ),
    );
  return rows[0]?.total ?? 0;
}

/**
 * Counts one wrong attempt atomically and returns the new total, so two parallel wrong guesses
 * cannot both read the same count and miss the lock.
 */
export async function recordWrongAttempt(db: Database, challengeId: string): Promise<number> {
  const rows = await db
    .update(verificationChallenges)
    .set({ attempts: sql`${verificationChallenges.attempts} + 1` })
    .where(eq(verificationChallenges.id, challengeId))
    .returning({ attempts: verificationChallenges.attempts });
  return rows[0]?.attempts ?? 0;
}

export async function lockChallenge(db: Database, challengeId: string, until: Date): Promise<void> {
  await db
    .update(verificationChallenges)
    .set({ lockedUntil: until })
    .where(eq(verificationChallenges.id, challengeId));
}

export async function insertSmsMessage(
  db: Database,
  message: { toPhone: string; kind: string; body: string },
): Promise<void> {
  await db.insert(smsOutbox).values(message);
}
