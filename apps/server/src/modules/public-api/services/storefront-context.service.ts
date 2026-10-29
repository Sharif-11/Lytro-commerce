import { Inject, Injectable } from '@nestjs/common';
import { ShopStorefrontService } from '../../balance/services/shop-storefront.service';
import { TenantResolver } from '../../tenancy/services/tenant-resolver.service';
import { StorefrontKeyService } from './storefront-key.service';

/**
 * Slice 12: what the storefront's server needs to serve a host: whether a shop is there (TEN-08), whether it is open
 * (SFT-12, LIF-07: a closed shop shows a generic page, with none of its data), whether its storefront is switched on
 * (SFT-16: landing pages ignore the switch), and the key and website address it calls the public API with.
 */
export interface StorefrontContext {
  outcome: 'open' | 'closed' | 'not_found';
  /** The open shop: its address, its storefront switch, and its storefront key and the website it is registered for. */
  shop: { slug: string; storefrontEnabled: boolean; key: string; origin: string } | null;
}

@Injectable()
export class StorefrontContextService {
  constructor(
    @Inject(TenantResolver) private readonly tenants: TenantResolver,
    @Inject(ShopStorefrontService) private readonly storefront: ShopStorefrontService,
    @Inject(StorefrontKeyService) private readonly keys: StorefrontKeyService,
  ) {}

  async forHost(host: string): Promise<StorefrontContext> {
    const resolved = await this.tenants.resolve(host);
    if (resolved.outcome !== 'tenant') return { outcome: resolved.outcome, shop: null };
    const { id, slug } = resolved.tenant;
    const key = await this.keys.keyFor(id, slug);
    return {
      outcome: 'open',
      shop: {
        slug,
        storefrontEnabled: await this.storefront.isOn(id),
        key: key.value,
        origin: key.origin,
      },
    };
  }
}
