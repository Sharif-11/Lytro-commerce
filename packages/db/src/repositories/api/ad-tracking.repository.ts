import { eq } from 'drizzle-orm';
import { adTrackingSettings, type SelectAdTrackingSettings } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// LND-15 to LND-17: a shop's ad tracking, one row. Every method sets the shop's tenant context itself, so row-level
// security applies.
export class AdTrackingRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async find(tx: Transaction, tenantId: string): Promise<SelectAdTrackingSettings | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(adTrackingSettings)
      .where(eq(adTrackingSettings.tenantId, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Locks the shop's row for the rest of the transaction, so two changes are logged one after the other. */
  async lock(tx: Transaction, tenantId: string): Promise<SelectAdTrackingSettings | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(adTrackingSettings)
      .where(eq(adTrackingSettings.tenantId, tenantId))
      .for('update');
    return rows[0] ?? null;
  }

  async save(
    tx: Transaction,
    values: { tenantId: string; metaPixelId: string | null; metaCapiTokenEnc: Buffer | null },
  ): Promise<SelectAdTrackingSettings> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx
      .insert(adTrackingSettings)
      .values({ ...values, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: adTrackingSettings.tenantId,
        set: {
          metaPixelId: values.metaPixelId,
          metaCapiTokenEnc: values.metaCapiTokenEnc,
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('upsert returned no ad tracking row');
    return row;
  }

  /** LND-17 removal, and LIF-19's day-60 deletion. */
  async delete(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(adTrackingSettings).where(eq(adTrackingSettings.tenantId, tenantId));
  }
}
