import { Inject, Injectable } from '@nestjs/common';
import type { ShopSettingsStore } from '../ports/shop-settings-store';
import { SHOP_SETTINGS_STORE } from '../tokens';

/**
 * RAT-14: a tenant's own extra-delivery-charge-per-kg rate -- the one rate among RAT-01 to RAT-14 that's
 * per-tenant rather than platform-wide, so it lives here instead of `RateService`/`control.rates`. A tenant
 * that has never set it reads back the documented default of 0.
 */
@Injectable()
export class ShopDeliveryRateService {
  constructor(@Inject(SHOP_SETTINGS_STORE) private readonly store: ShopSettingsStore) {}

  async get(tenantId: string): Promise<string> {
    const row = await this.store.run(tenantId, (tx) => this.store.get(tx, tenantId));
    return row?.extraDeliveryChargePerKg ?? '0.00';
  }

  async set(tenantId: string, value: number): Promise<string> {
    const formatted = value.toFixed(2);
    await this.store.run(tenantId, (tx) => this.store.set(tx, tenantId, formatted));
    return formatted;
  }
}
