import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { mainOrigin } from '../../../common/shop-address';
import { ShopStorefrontService } from '../../balance/services/shop-storefront.service';
import { DomainService } from '../../domains/services/domain.service';
import { HostClassifier } from '../../tenancy/services/host-classifier';
import { TenantResolver } from '../../tenancy/services/tenant-resolver.service';
import { StorefrontKeyService } from './storefront-key.service';

/**
 * Slice 12: what the storefront's server needs to serve a host: whether a shop is there (TEN-08), whether it is open
 * (SFT-12, LIF-07: a closed shop shows a generic page, with none of its data), whether its storefront is switched on
 * (SFT-16: landing pages ignore the switch), the key and website address it calls the public API with, and (Slice 13)
 * the shop's main address: its own domain while that serves, which every other host of the shop leads to.
 */
export interface StorefrontContext {
  outcome: 'open' | 'closed' | 'not_found';
  /**
   * The open shop: its address, its storefront switch, its storefront key and the website it is registered for, its
   * own domain while that serves (null on its Lytro address), and the origin its links and previews use.
   */
  shop: {
    slug: string;
    storefrontEnabled: boolean;
    key: string;
    origin: string;
    mainHost: string | null;
    publicOrigin: string;
  } | null;
}

@Injectable()
export class StorefrontContextService {
  constructor(
    @Inject(TenantResolver) private readonly tenants: TenantResolver,
    @Inject(ShopStorefrontService) private readonly storefront: ShopStorefrontService,
    @Inject(StorefrontKeyService) private readonly keys: StorefrontKeyService,
    @Inject(DomainService) private readonly domains: DomainService,
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async forHost(host: string): Promise<StorefrontContext> {
    const resolved = await this.tenants.resolve(host);
    if (resolved.outcome !== 'tenant') return { outcome: resolved.outcome, shop: null };
    const { id, slug } = resolved.tenant;
    const mainHost = await this.domains.servingHost(id);
    // DWN-10, TEN-14: an own domain (or its twin) answers only while the shop's domain serves, checked here on every
    // ask as well as in the host lookup the server keeps a minute -- so a downgrade shows at once.
    if (mainHost === null && this.hosts.classify(host).kind === 'custom') {
      return { outcome: 'not_found', shop: null };
    }
    const key = await this.keys.keyFor(id, slug);
    return {
      outcome: 'open',
      shop: {
        slug,
        storefrontEnabled: await this.storefront.isOn(id),
        key: key.value,
        origin: key.origin,
        mainHost,
        publicOrigin: mainOrigin(this.env, slug, mainHost),
      },
    };
  }
}
