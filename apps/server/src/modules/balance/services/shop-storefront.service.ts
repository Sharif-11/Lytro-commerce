import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { ShopSettingsStore } from '../ports/shop-settings-store';
import { SHOP_SETTINGS_STORE } from '../tokens';

/**
 * SFT-16: whether a shop's shared storefront is on. A shop with its own website switches it off; its storefront's pages
 * then answer not-found, while its landing pages, the dashboard and the API keep working. On until switched off.
 */
@Injectable()
export class ShopStorefrontService {
  constructor(@Inject(SHOP_SETTINGS_STORE) private readonly store: ShopSettingsStore) {}

  isOn(tenantId: string): Promise<boolean> {
    return this.store.run(tenantId, (tx) => this.within(tx, tenantId));
  }

  async within(tx: Transaction, tenantId: string): Promise<boolean> {
    return (await this.store.get(tx, tenantId))?.storefrontEnabled ?? true;
  }

  async set(tenantId: string, on: boolean): Promise<boolean> {
    await this.store.run(tenantId, (tx) => this.store.setStorefrontEnabled(tx, tenantId, on));
    return on;
  }
}
