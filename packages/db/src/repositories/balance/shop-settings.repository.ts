import { eq } from 'drizzle-orm';
import { shopSettings, type SelectShopSettings } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// RAT-14: a tenant's own extra-delivery-charge-per-kg rate. One row per tenant that has ever set it.
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
}
