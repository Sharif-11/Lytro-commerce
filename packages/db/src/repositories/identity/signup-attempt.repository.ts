import { and, count, eq, gt } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { signupAttempts } from '../../schema';

// SUP-08: sign-up code requests, counted per client IP over a sliding window.
export class SignupAttemptRepository {
  async insert(db: Executor, ip: string): Promise<void> {
    await db.insert(signupAttempts).values({ ip });
  }

  async countSince(db: Executor, ip: string, since: Date): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(signupAttempts)
      .where(and(eq(signupAttempts.ip, ip), gt(signupAttempts.createdAt, since)));
    return rows[0]?.total ?? 0;
  }
}
