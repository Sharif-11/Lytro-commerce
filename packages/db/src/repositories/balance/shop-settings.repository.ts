import { eq } from 'drizzle-orm';
import { shopSettings, type SelectShopSettings } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// RAT-14, PRD-08: a tenant's own extra-delivery-charge-per-kg rate and default payment policy. One row per tenant
// that has ever set either.
export class ShopSettingsRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async get(tx: Transaction, tenantId: string): Promise<SelectShopSettings | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(shopSettings)
      .where(eq(shopSettings.tenantId, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  async set(tx: Transaction, tenantId: string, extraDeliveryChargePerKg: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .insert(shopSettings)
      .values({ tenantId, extraDeliveryChargePerKg })
      .onConflictDoUpdate({
        target: shopSettings.tenantId,
        set: { extraDeliveryChargePerKg },
      });
  }

  /** LIF-19: removes the shop's settings row (its delivery rate and default payment policy) at day 60. */
  async deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(shopSettings).where(eq(shopSettings.tenantId, tenantId));
  }

  /** PRD-08: the shop-wide default payment policy, with the advance a partial-advance default asks. */
  async setPaymentPolicy(
    tx: Transaction,
    tenantId: string,
    policy: Pick<SelectShopSettings, 'defaultPaymentPolicy' | 'defaultAdvanceAmount'>,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .insert(shopSettings)
      .values({ tenantId, ...policy })
      .onConflictDoUpdate({ target: shopSettings.tenantId, set: policy });
  }
}
