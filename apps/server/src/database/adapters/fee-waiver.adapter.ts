import { Inject, Injectable } from '@nestjs/common';
import { AddonPurchaseRepository, TenantRepository, type Transaction } from '@lytronix/db';
import { featureOn, VERIFICATION_FEES_WAIVED_FEATURE } from '@lytronix/validators';
import type { FeeWaiverStore } from '../../modules/balance/ports/fee-waiver-store';

/** WAL-20, WAL-21 (amended 2026-11-23): a shop's payment-check fee waiver, read as every plan feature is (featureOn). */
@Injectable()
export class DrizzleFeeWaiverStore implements FeeWaiverStore {
  constructor(
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(AddonPurchaseRepository) private readonly addonPurchases: AddonPurchaseRepository,
  ) {}

  async waived(tx: Transaction, tenantId: string): Promise<boolean> {
    const info = await this.tenants.findBillingInfo(tx, tenantId);
    const active = await this.addonPurchases.listActive(tx, tenantId);
    return featureOn(VERIFICATION_FEES_WAIVED_FEATURE, {
      features: info?.featureSnapshot ?? null,
      active,
    });
  }
}
