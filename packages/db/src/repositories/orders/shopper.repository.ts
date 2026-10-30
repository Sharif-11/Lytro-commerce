import { and, asc, count, desc, eq, gt, gte, ne, sql, type SQL } from 'drizzle-orm';
import {
  shopperAddresses,
  shopperCodes,
  shoppers,
  shopperSessions,
  type SelectShopper,
  type SelectShopperAddress,
  type SelectShopperCode,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** What a shopper's row may change: the name, the password and the wrong-password count (CUS-03, CUS-14). */
export type ShopperPatch = Partial<
  Pick<SelectShopper, 'name' | 'passwordHash' | 'failedSignins' | 'failingSince'>
>;

/** A saved address as it is written (CUS-06). */
export type NewShopperAddress = Pick<
  SelectShopperAddress,
  'label' | 'locationId' | 'deliveryAddress' | 'isDefault'
>;

// CUS-03 to CUS-06, D4-14 (Slice 4.4b): a shop's shoppers, their sign-up codes, sign-ins and saved addresses. Every
// method sets the shop's tenant context, so a row of another shop is never seen.
export class ShopperRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  // --- Sign-up codes (CUS-04) ---

  /** The phone's latest code, held until the transaction ends so two checks of it never race. */
  async latestCode(
    tx: Transaction,
    tenantId: string,
    phone: string,
  ): Promise<SelectShopperCode | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(shopperCodes)
      .where(and(eq(shopperCodes.tenantId, tenantId), eq(shopperCodes.phone, phone)))
      .orderBy(desc(shopperCodes.createdAt), desc(shopperCodes.id))
      .limit(1)
      .for('update');
    return row ?? null;
  }

  /** SMS-11: codes sent since `since` -- to one phone, or across the whole shop when `phone` is null. */
  async countCodesSince(
    tx: Transaction,
    tenantId: string,
    phone: string | null,
    since: Date,
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions: (SQL | undefined)[] = [
      eq(shopperCodes.tenantId, tenantId),
      gte(shopperCodes.createdAt, since),
    ];
    if (phone !== null) conditions.push(eq(shopperCodes.phone, phone));
    const [row] = await tx
      .select({ total: count() })
      .from(shopperCodes)
      .where(and(...conditions));
    return row?.total ?? 0;
  }

  async insertCode(
    tx: Transaction,
    tenantId: string,
    values: { phone: string; codeHash: string; expiresAt: Date; createdAt: Date },
  ): Promise<SelectShopperCode> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(shopperCodes)
      .values({ tenantId, ...values })
      .returning();
    if (!row) throw new Error('insert returned no shopper code');
    return row;
  }

  async recordWrongCode(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(shopperCodes)
      .set({ wrongAttempts: sql`${shopperCodes.wrongAttempts} + 1` })
      .where(and(eq(shopperCodes.tenantId, tenantId), eq(shopperCodes.id, id)));
  }

  async useCode(tx: Transaction, tenantId: string, id: string, now: Date): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(shopperCodes)
      .set({ usedAt: now })
      .where(and(eq(shopperCodes.tenantId, tenantId), eq(shopperCodes.id, id)));
  }

  /** A code its SMS never carried: gone, so it neither works nor holds the phone's cooldown. */
  async deleteCode(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(shopperCodes)
      .where(and(eq(shopperCodes.tenantId, tenantId), eq(shopperCodes.id, id)));
  }

  // --- Shoppers (CUS-03, CUS-05, CUS-14) ---

  async findByPhone(
    tx: Transaction,
    tenantId: string,
    phone: string,
  ): Promise<SelectShopper | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(shoppers)
      .where(and(eq(shoppers.tenantId, tenantId), eq(shoppers.phone, phone)))
      .for('update');
    return row ?? null;
  }

  /** The shopper, held until the transaction ends -- one change to their account or addresses at a time. */
  async lock(tx: Transaction, tenantId: string, id: string): Promise<SelectShopper | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(shoppers)
      .where(and(eq(shoppers.tenantId, tenantId), eq(shoppers.id, id)))
      .for('update');
    return row ?? null;
  }

  /** CUS-03: the account, or null when the phone already has one (the shop's one account per phone). */
  async insertShopper(
    tx: Transaction,
    tenantId: string,
    values: { phone: string; name: string; passwordHash: string },
  ): Promise<SelectShopper | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(shoppers)
      .values({ tenantId, ...values })
      .onConflictDoNothing({ target: [shoppers.tenantId, shoppers.phone] })
      .returning();
    return row ?? null;
  }

  async updateShopper(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ShopperPatch,
  ): Promise<SelectShopper> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(shoppers)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(shoppers.tenantId, tenantId), eq(shoppers.id, id)))
      .returning();
    if (!row) throw new Error('update returned no shopper');
    return row;
  }

  // --- Sign-ins (CUS-03, CUS-05) ---

  async insertSession(
    tx: Transaction,
    tenantId: string,
    values: { shopperId: string; tokenHash: string; expiresAt: Date },
  ): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(shopperSessions)
      .values({ tenantId, ...values })
      .returning({ id: shopperSessions.id });
    if (!row) throw new Error('insert returned no shopper session');
    return row.id;
  }

  /** The shopper a live sign-in belongs to, with that sign-in's id; null when the token is unknown or expired. */
  async findSession(
    tx: Transaction,
    tenantId: string,
    tokenHash: string,
    now: Date,
  ): Promise<{ sessionId: string; shopper: SelectShopper } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ sessionId: shopperSessions.id, shopper: shoppers })
      .from(shopperSessions)
      .innerJoin(
        shoppers,
        and(
          eq(shoppers.tenantId, shopperSessions.tenantId),
          eq(shoppers.id, shopperSessions.shopperId),
        ),
      )
      .where(
        and(
          eq(shopperSessions.tenantId, tenantId),
          eq(shopperSessions.tokenHash, tokenHash),
          gt(shopperSessions.expiresAt, now),
        ),
      );
    return row ?? null;
  }

  async deleteSession(tx: Transaction, tenantId: string, sessionId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(shopperSessions)
      .where(and(eq(shopperSessions.tenantId, tenantId), eq(shopperSessions.id, sessionId)));
  }

  /** Ends the shopper's sign-ins, all but `keep` when it is given (the one that just changed the password). */
  async deleteSessions(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
    keep: string | null,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions: (SQL | undefined)[] = [
      eq(shopperSessions.tenantId, tenantId),
      eq(shopperSessions.shopperId, shopperId),
    ];
    if (keep !== null) conditions.push(ne(shopperSessions.id, keep));
    await tx.delete(shopperSessions).where(and(...conditions));
  }

  // --- Saved addresses (CUS-06) ---

  /** The shopper's addresses, the default first, then the oldest first. */
  async listAddresses(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
  ): Promise<SelectShopperAddress[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(shopperAddresses)
      .where(
        and(eq(shopperAddresses.tenantId, tenantId), eq(shopperAddresses.shopperId, shopperId)),
      )
      .orderBy(
        desc(shopperAddresses.isDefault),
        asc(shopperAddresses.createdAt),
        asc(shopperAddresses.id),
      );
  }

  async insertAddress(
    tx: Transaction,
    tenantId: string,
    shopperId: string,
    values: NewShopperAddress,
  ): Promise<SelectShopperAddress> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(shopperAddresses)
      .values({ tenantId, shopperId, ...values })
      .returning();
    if (!row) throw new Error('insert returned no shopper address');
    return row;
  }

  async updateAddress(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: Partial<NewShopperAddress>,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(shopperAddresses)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(shopperAddresses.tenantId, tenantId), eq(shopperAddresses.id, id)));
  }

  /** CUS-06: no address of the shopper is the default, so another may become it. */
  async clearDefault(tx: Transaction, tenantId: string, shopperId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(shopperAddresses)
      .set({ isDefault: false })
      .where(
        and(
          eq(shopperAddresses.tenantId, tenantId),
          eq(shopperAddresses.shopperId, shopperId),
          eq(shopperAddresses.isDefault, true),
        ),
      );
  }

  async deleteAddress(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(shopperAddresses)
      .where(and(eq(shopperAddresses.tenantId, tenantId), eq(shopperAddresses.id, id)));
  }

  // --- The shop's shoppers as a whole ---

  /** LIF-19: every shopper of the shop, their sign-ins, codes and addresses. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(shoppers).where(eq(shoppers.tenantId, tenantId));
    await tx.delete(shopperCodes).where(eq(shopperCodes.tenantId, tenantId));
  }
}
