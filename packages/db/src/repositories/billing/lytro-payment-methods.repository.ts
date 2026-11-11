import { and, asc, count, eq, gte, sql } from 'drizzle-orm';
import { CredentialUseAction, type PaymentMethod, type PaymentWay } from '@lytronix/validators';
import {
  manualPaymentEntries,
  platformBankAccounts,
  platformGatewayAccounts,
  platformGatewayUses,
  platformPaymentMethods,
  type InsertPlatformBankAccount,
  type SelectPlatformBankAccount,
  type SelectPlatformGatewayAccount,
  type SelectPlatformPaymentMethod,
} from '../../schema';
import type { Executor } from '../../transactions';

export type NewPlatformBankAccount = Omit<InsertPlatformBankAccount, 'id' | 'createdAt'>;

/** What shops may pay Lytro by: the operator's choices, Lytro's bank accounts and its own checkout keys. */
export class LytroPaymentMethodsRepository {
  listChoices(db: Executor): Promise<SelectPlatformPaymentMethod[]> {
    return db.select().from(platformPaymentMethods);
  }

  async saveChoice(
    db: Executor,
    method: PaymentMethod,
    values: { enabled: boolean; way: PaymentWay },
  ): Promise<void> {
    await db
      .insert(platformPaymentMethods)
      .values({ method, ...values })
      .onConflictDoUpdate({
        target: platformPaymentMethods.method,
        set: { ...values, updatedAt: sql`now()` },
      });
  }

  listBankAccounts(db: Executor, enabledOnly: boolean): Promise<SelectPlatformBankAccount[]> {
    const query = db.select().from(platformBankAccounts).$dynamic();
    return (enabledOnly ? query.where(eq(platformBankAccounts.enabled, true)) : query).orderBy(
      asc(platformBankAccounts.displayOrder),
      asc(platformBankAccounts.createdAt),
    );
  }

  async insertBankAccount(
    db: Executor,
    values: NewPlatformBankAccount,
  ): Promise<SelectPlatformBankAccount> {
    const [row] = await db.insert(platformBankAccounts).values(values).returning();
    if (!row) throw new Error('the insert returned no bank account');
    return row;
  }

  async updateBankAccount(
    db: Executor,
    id: string,
    values: Partial<NewPlatformBankAccount>,
  ): Promise<SelectPlatformBankAccount | null> {
    const [row] = await db
      .update(platformBankAccounts)
      .set(values)
      .where(eq(platformBankAccounts.id, id))
      .returning();
    return row ?? null;
  }

  /** ADM-14, D8-75: whether this is one of Lytro's bank accounts, on or off; money may have reached one since turned off. */
  async bankAccountExists(db: Executor, id: string): Promise<boolean> {
    const rows = await db
      .select({ id: platformBankAccounts.id })
      .from(platformBankAccounts)
      .where(eq(platformBankAccounts.id, id))
      .limit(1);
    return rows.length > 0;
  }

  /** D8-75: whether a manual entry names this account, which keeps it from being removed. */
  async bankAccountUsed(db: Executor, id: string): Promise<boolean> {
    const rows = await db
      .select({ id: manualPaymentEntries.id })
      .from(manualPaymentEntries)
      .where(eq(manualPaymentEntries.bankAccountId, id))
      .limit(1);
    return rows.length > 0;
  }

  async removeBankAccount(db: Executor, id: string): Promise<boolean> {
    const rows = await db
      .delete(platformBankAccounts)
      .where(eq(platformBankAccounts.id, id))
      .returning({ id: platformBankAccounts.id });
    return rows.length > 0;
  }

  async gatewayAccount(
    db: Executor,
    method: PaymentMethod,
  ): Promise<SelectPlatformGatewayAccount | null> {
    const [row] = await db
      .select()
      .from(platformGatewayAccounts)
      .where(eq(platformGatewayAccounts.method, method));
    return row ?? null;
  }

  async saveGatewayAccount(
    db: Executor,
    values: { method: PaymentMethod; number: string; credentials: Buffer; sandbox: boolean },
  ): Promise<void> {
    const { number, credentials, sandbox } = values;
    await db
      .insert(platformGatewayAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: platformGatewayAccounts.method,
        set: { number, credentials, sandbox, updatedAt: sql`now()` },
      });
  }

  async removeGatewayAccount(db: Executor, method: PaymentMethod): Promise<boolean> {
    const rows = await db
      .delete(platformGatewayAccounts)
      .where(eq(platformGatewayAccounts.method, method))
      .returning({ method: platformGatewayAccounts.method });
    return rows.length > 0;
  }

  async recordGatewayUse(
    db: Executor,
    values: {
      method: PaymentMethod;
      action: CredentialUseAction;
      paymentId: string | null;
      succeeded: boolean;
      at: Date;
    },
  ): Promise<void> {
    await db.insert(platformGatewayUses).values(values);
  }

  /** How many times Lytro's account asked for a token since then, worked or not. */
  async tokenCallsSince(db: Executor, method: PaymentMethod, since: Date): Promise<number> {
    const [row] = await db
      .select({ calls: count() })
      .from(platformGatewayUses)
      .where(
        and(
          eq(platformGatewayUses.method, method),
          eq(platformGatewayUses.action, CredentialUseAction.Token),
          gte(platformGatewayUses.at, since),
        ),
      );
    return row?.calls ?? 0;
  }
}
