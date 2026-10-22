import { Inject, Injectable } from '@nestjs/common';
import type { BrandStore } from '../ports/brand-store';
import { BRAND_STORE } from '../tokens';

/** LIF-19: the day-60 deletion job's brand step -- the shop's saved identity. Safe to run again. */
@Injectable()
export class BrandEraser {
  constructor(@Inject(BRAND_STORE) private readonly store: BrandStore) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run((tx) => this.store.deleteForTenant(tx, tenantId));
  }
}
