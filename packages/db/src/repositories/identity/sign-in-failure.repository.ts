import { and, count, eq, gt } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { signInFailures } from '../../schema';

// AUTH-14: failed sign-ins, counted per account and per client IP over a sliding window.
export type FailureScope = { subscriberId: string } | { ip: string };

export class SignInFailureRepository {
  async insert(
    db: Executor,
    values: { subscriberId: string | null; ip: string | null },
  ): Promise<void> {
    await db.insert(signInFailures).values(values);
  }

  async countSince(db: Executor, scope: FailureScope, since: Date): Promise<number> {
    const match =
      'subscriberId' in scope
        ? eq(signInFailures.subscriberId, scope.subscriberId)
        : eq(signInFailures.ip, scope.ip);
    const rows = await db
      .select({ total: count() })
      .from(signInFailures)
      .where(and(match, gt(signInFailures.createdAt, since)));
    return rows[0]?.total ?? 0;
  }
}
