import { Inject, Injectable } from '@nestjs/common';
import type { StorefrontDesignStore } from '../ports/storefront-design-store';
import { STOREFRONT_DESIGN_STORE } from '../tokens';

/** LIF-19: the day-60 deletion job's storefront step -- the shop's saved design, every copy. Safe to run again. */
@Injectable()
export class StorefrontDesignEraser {
  constructor(@Inject(STOREFRONT_DESIGN_STORE) private readonly store: StorefrontDesignStore) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run((tx) => this.store.deleteForTenant(tx, tenantId));
  }
}
