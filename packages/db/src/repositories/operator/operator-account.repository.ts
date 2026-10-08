import { eq } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { operatorAccounts } from '../../schema';

// ADM-01, ADM-18: operator accounts. Mandatory TOTP by construction — there is no "enabled" flag to read here,
// only whether enrollment has been confirmed.

export type OperatorAccountRow = typeof operatorAccounts.$inferSelect;

export interface NewOperatorAccount {
  email: string;
  passwordHash: string;
}

export class OperatorAccountRepository {
  /** Used by the privileged create-operator script, never by the live app (D8). */
  async insert(db: Executor, values: NewOperatorAccount): Promise<OperatorAccountRow> {
    const [row] = await db.insert(operatorAccounts).values(values).returning();
    if (!row) throw new Error('insert returned no operator account row');
    return row;
  }

  async findByEmail(db: Executor, email: string): Promise<OperatorAccountRow | null> {
    const rows = await db
      .select()
      .from(operatorAccounts)
      .where(eq(operatorAccounts.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async findById(db: Executor, id: string): Promise<OperatorAccountRow | null> {
    const rows = await db
      .select()
      .from(operatorAccounts)
      .where(eq(operatorAccounts.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Stores the freshly generated secret, shown once, before it has been confirmed (ADM-01). */
  async setTwoFactorSecret(db: Executor, id: string, secret: string): Promise<void> {
    await db
      .update(operatorAccounts)
      .set({ twoFactorSecret: secret, twoFactorConfirmedAt: null })
      .where(eq(operatorAccounts.id, id));
  }

  /** One valid code confirms enrollment; the account is unusable until this is set (ADM-01). */
  async confirmTwoFactor(db: Executor, id: string, at: Date): Promise<void> {
    await db
      .update(operatorAccounts)
      .set({ twoFactorConfirmedAt: at })
      .where(eq(operatorAccounts.id, id));
  }

  /** Break-glass recovery (ADM-18): clears enrollment so it must be redone from a fresh secret. */
  async resetTwoFactor(db: Executor, id: string): Promise<void> {
    await db
      .update(operatorAccounts)
      .set({ twoFactorSecret: null, twoFactorConfirmedAt: null })
      .where(eq(operatorAccounts.id, id));
  }
}
