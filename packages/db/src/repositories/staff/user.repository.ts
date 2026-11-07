import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Language } from '@lytronix/validators';
import { tenants, users, type SelectUser } from '../../schema';
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

  // STF-13, AUTH-31: the active staff who have not yet chosen their own password since the owner set one.
  async countMustSetPassword(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ total: count() })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.active, true),
          eq(users.isOwner, false),
          eq(users.mustSetPassword, true),
        ),
      );
    return rows[0]?.total ?? 0;
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

  /** The named users of a shop, by id, in one query (no N+1). */
  async findByIds(tx: Transaction, tenantId: string, userIds: string[]): Promise<SelectUser[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (userIds.length === 0) return [];
    return tx
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)));
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

  /**
   * TEN-31, AUTH-31: the shop a person is staff in, and their staff row there -- at most one, since a subscriber is
   * staff in at most one shop (STF-06). Read across shops through the `own_staff_row` policy, so it needs no shop to
   * start from. The caller decides what an inactive row means (STF-05).
   */
  async findStaffShop(
    tx: Transaction,
    subscriberId: string,
  ): Promise<{ tenantId: string; userId: string; active: boolean } | null> {
    await this.transactions.setSubscriberContext(tx, subscriberId);
    const rows = await tx
      .select({ tenantId: users.tenantId, userId: users.id, active: users.active })
      .from(users)
      .where(and(eq(users.subscriberId, subscriberId), eq(users.isOwner, false)))
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

  /** The owner row of the shop, if any (every shop has exactly one once created). */
  async findOwner(tx: Transaction, tenantId: string): Promise<SelectUser | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isOwner, true)))
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
        // AUTH-31: the owner chose this first password, so the first sign-in asks the member for their own.
        mustSetPassword: true,
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

  /** STF-03: renames a staff member; null clears the name. */
  async setName(
    tx: Transaction,
    tenantId: string,
    userId: string,
    name: string | null,
  ): Promise<SelectUser | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(users)
      .set({ name })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
      .returning();
    return rows[0] ?? null;
  }

  /** LIF-19: deletes every staff row of the shop (business-data deletion). */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(users).where(eq(users.tenantId, tenantId));
  }

  /**
   * LIF-18/24, PYG-21: the owner's own contact, for a platform-sent notice (never a staff member's). With the language
   * they chose, which the notice is written in (Slice 7.3's read); null until they choose.
   */
  async findOwnerContact(
    tx: Transaction,
    tenantId: string,
  ): Promise<{
    phone: string | null;
    email: string | null;
    name: string | null;
    language: Language | null;
  } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({
        phone: users.phone,
        email: users.email,
        name: users.name,
        language: users.language,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isOwner, true)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * I18N-01 (Slice 7.3's read): the language a person chose, kept on their row in this shop -- the owner's row when
   * `userId` is null, as an owner's session carries none. Whether a row took it.
   */
  async setLanguage(
    tx: Transaction,
    tenantId: string,
    userId: string | null,
    language: Language,
  ): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(users)
      .set({ language })
      .where(
        and(
          eq(users.tenantId, tenantId),
          userId === null ? eq(users.isOwner, true) : eq(users.id, userId),
        ),
      )
      .returning({ id: users.id });
    return rows.length > 0;
  }

  /** The language a person chose in this shop, the owner's when `userId` is null; null until they choose. */
  async languageOf(
    tx: Transaction,
    tenantId: string,
    userId: string | null,
  ): Promise<Language | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ language: users.language })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          userId === null ? eq(users.isOwner, true) : eq(users.id, userId),
        ),
      )
      .limit(1);
    return rows[0]?.language ?? null;
  }

  /**
   * NTF-06 (Slice 7.3): a person's own email changed, so every live shop they own writes its notices to the new one
   * (null when they no longer have one). A shop whose staff already use that address keeps the old one, since an
   * address is one person's in a shop (STF-04). How many shops changed.
   */
  async setOwnerEmailOfSubscriber(
    tx: Transaction,
    subscriberId: string,
    email: string | null,
  ): Promise<number> {
    const shops = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.subscriberId, subscriberId), isNull(tenants.deletedAt)));
    let changed = 0;
    for (const shop of shops) {
      await this.transactions.setTenantContext(tx, shop.id);
      const rows = await tx
        .update(users)
        .set({ email })
        .where(
          and(
            eq(users.tenantId, shop.id),
            eq(users.isOwner, true),
            email === null
              ? sql`true`
              : sql`NOT EXISTS (SELECT 1 FROM tenant.users other WHERE other.tenant_id = ${shop.id} AND other.email = ${email} AND NOT other.is_owner)`,
          ),
        )
        .returning({ id: users.id });
      changed += rows.length;
    }
    return changed;
  }
}
