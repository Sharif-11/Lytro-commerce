import { eq, sql } from 'drizzle-orm';
import { brandIdentities, type InsertBrandIdentity, type SelectBrandIdentity } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** BRN-02: what a save writes -- the whole identity, and the switch where the save sets it. */
export type BrandIdentityValues = Omit<InsertBrandIdentity, 'tenantId' | 'updatedAt'>;

// BRN-02, BRN-07: a shop's own brand identity, one row per shop that has saved one.
export class BrandIdentityRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async get(tx: Transaction, tenantId: string): Promise<SelectBrandIdentity | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(brandIdentities)
      .where(eq(brandIdentities.tenantId, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Saves the identity whole; a switch left out keeps the stored one (off for a first save). */
  async save(
    tx: Transaction,
    tenantId: string,
    values: BrandIdentityValues,
  ): Promise<SelectBrandIdentity> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .insert(brandIdentities)
      .values({ tenantId, ...values })
      .onConflictDoUpdate({
        target: brandIdentities.tenantId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('the brand identity was not saved');
    return row;
  }

  /** LIF-19: removes the shop's brand identity at day 60. */
  async deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(brandIdentities).where(eq(brandIdentities.tenantId, tenantId));
  }
}
