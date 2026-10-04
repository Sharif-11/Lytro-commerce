import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { verificationChallenges } from '../../schema';

// AUTH-05 to AUTH-07: rows behind one-time codes. Rules (limits, lock, expiry) live in the service; this file
// only reads and writes rows.

export type ChallengeRow = typeof verificationChallenges.$inferSelect;

export async function insertChallenge(
  db: Executor,
  values: { phone: string; codeHash: string; expiresAt: Date },
): Promise<ChallengeRow> {
  const rows = await db.insert(verificationChallenges).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error('insert returned no challenge row');
  return row;
}

/** The most recent sign-up challenge for a number. */
export async function latestChallenge(db: Executor, phone: string): Promise<ChallengeRow | null> {
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

export async function countChallengesSince(
  db: Executor,
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

/** Counts one wrong attempt atomically and returns the new total, so parallel guesses cannot miss the lock. */
export async function recordWrongAttempt(db: Executor, challengeId: string): Promise<number> {
  const rows = await db
    .update(verificationChallenges)
    .set({ attempts: sql`${verificationChallenges.attempts} + 1` })
    .where(eq(verificationChallenges.id, challengeId))
    .returning({ attempts: verificationChallenges.attempts });
  return rows[0]?.attempts ?? 0;
}

export async function lockChallenge(db: Executor, challengeId: string, until: Date): Promise<void> {
  await db
    .update(verificationChallenges)
    .set({ lockedUntil: until })
    .where(eq(verificationChallenges.id, challengeId));
}

/** Marks a challenge used only if it was not used before. Returns false when another request got there first. */
export async function consumeChallenge(
  db: Executor,
  challengeId: string,
  at: Date,
): Promise<boolean> {
  const rows = await db
    .update(verificationChallenges)
    .set({ consumedAt: at })
    .where(
      and(eq(verificationChallenges.id, challengeId), isNull(verificationChallenges.consumedAt)),
    )
    .returning({ id: verificationChallenges.id });
  return rows.length === 1;
}
