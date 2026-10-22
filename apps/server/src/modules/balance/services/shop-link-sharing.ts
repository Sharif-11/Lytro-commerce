import { Inject, Injectable } from '@nestjs/common';
import type { ShopSettingsStore } from '../ports/shop-settings-store';
import { SHOP_SETTINGS_STORE } from '../tokens';

/**
 * SUP-01: the set-up checklist's "share the shop link", done once a shop or product link is copied or shared from the
 * dashboard. Kept on the shop's settings row rather than on one device, so every device sees it ticked.
 */
@Injectable()
export class ShopLinkSharing {
  constructor(@Inject(SHOP_SETTINGS_STORE) private readonly store: ShopSettingsStore) {}

  /** Whether a link of the shop's was ever shared. */
  async shared(tenantId: string): Promise<boolean> {
    const row = await this.store.run(tenantId, (tx) => this.store.get(tx, tenantId));
    return (row?.linkSharedAt ?? null) !== null;
  }

  /** Records a share; the first one's time is kept. */
  record(tenantId: string, at: Date): Promise<void> {
    return this.store.run(tenantId, (tx) => this.store.markLinkShared(tx, tenantId, at));
  }
}
