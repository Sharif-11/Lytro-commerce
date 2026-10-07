import { and, asc, count, eq, sql } from 'drizzle-orm';
import { users, type SelectUser } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// AUTH-10: the owner user row. Row-level security applies to it, so it must run inside a transaction that has set
// the tenant context. The transaction type makes that requirement part of the signature.
export class UserRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    await tx.insert(users).values({
      tenantId: values.tenantId,
      phone: values.phone,
      email: values.email,
      name: values.name,
      isOwner: true,
    });
  }

  // STF-01 to STF-05: staff rows of one shop, owner first, oldest first.
  async listUsers(tx: Transaction, tenantId: string): Promise<SelectUser[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx.select().from(users).orderBy(asc(users.createdAt));
  }

  // Serialises seat changes within one shop, so two concurrent creations cannot both pass the seat check (STF-02).
  // The lock ends with the transaction.
  async lockSeats(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`);
  }

  // STF-02: the seats in use are the active users of the shop, the owner included.
  async countActive(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.active, true)));
    return rows[0]?.total ?? 0;
  }

  async findUser(tx: Transaction, tenantId: string, userId: string): Promise<SelectUser | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Finds a shop's staff member by the phone they sign in with (STF-01). */
  async findUserByPhone(
    tx: Transaction,
    tenantId: string,
    phone: string,
  ): Promise<SelectUser | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.phone, phone)))
      .limit(1);
    return rows[0] ?? null;
  }

  async insertStaff(
    tx: Transaction,
    values: {
      tenantId: string;
      subscriberId: string;
      phone: string;
      name: string | null;
      passwordHash: string;
    },
  ): Promise<SelectUser> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx
      .insert(users)
      .values({
        tenantId: values.tenantId,
        subscriberId: values.subscriberId,
        phone: values.phone,
        name: values.name,
        passwordHash: values.passwordHash,
        isOwner: false,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no staff row');
    return row;
  }

  /** Sets a staff member's password hash, and whether they must choose a new one at the next sign-in (STF-13). */
  async setPassword(
    tx: Transaction,
    tenantId: string,
    userId: string,
    passwordHash: string,
    mustSetPassword: boolean,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(users)
      .set({ passwordHash, mustSetPassword })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  }

  async setActive(
    tx: Transaction,
    tenantId: string,
    userId: string,
    active: boolean,
  ): Promise<SelectUser | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(users)
      .set({ active })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
      .returning();
    return rows[0] ?? null;
  }
}
