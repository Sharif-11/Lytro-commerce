import { eq, inArray, sql } from 'drizzle-orm';
import type { MailSuppressionReason } from '@lytronix/validators';
import type { Executor } from '../../transactions';
import { mailSuppressions } from '../../schema';

export interface NewMailSuppression {
  email: string;
  reason: MailSuppressionReason;
  detail: string | null;
}

/**
 * NTF-06 (Phase 7 Slice 7.3, read agreed 2026-11-07): the addresses Lytro no longer emails. Every address is kept
 * lowercased, as identities and staff rows keep theirs, so a check never misses one written differently.
 */
export class MailSuppressionRepository {
  /** Stops an address. A second report of the same address keeps the first one's time, and takes its reason. */
  async suppress(db: Executor, row: NewMailSuppression): Promise<void> {
    await db
      .insert(mailSuppressions)
      .values({ ...row, email: row.email.trim().toLowerCase() })
      .onConflictDoUpdate({
        target: mailSuppressions.email,
        set: { reason: sql`excluded.reason`, detail: sql`excluded.detail` },
      });
  }

  async isSuppressed(db: Executor, email: string): Promise<boolean> {
    const rows = await db
      .select({ email: mailSuppressions.email })
      .from(mailSuppressions)
      .where(eq(mailSuppressions.email, email.trim().toLowerCase()))
      .limit(1);
    return rows.length > 0;
  }

  /** Which of these addresses are stopped, lowercased. */
  async suppressedAmong(db: Executor, emails: readonly string[]): Promise<Set<string>> {
    const wanted = [...new Set(emails.map((email) => email.trim().toLowerCase()))];
    if (wanted.length === 0) return new Set();
    const rows = await db
      .select({ email: mailSuppressions.email })
      .from(mailSuppressions)
      .where(inArray(mailSuppressions.email, wanted));
    return new Set(rows.map((row) => row.email));
  }

  /** The address received a code its owner asked for, so it works again. Whether it had been stopped. */
  async lift(db: Executor, email: string): Promise<boolean> {
    const rows = await db
      .delete(mailSuppressions)
      .where(eq(mailSuppressions.email, email.trim().toLowerCase()))
      .returning({ email: mailSuppressions.email });
    return rows.length > 0;
  }
}
