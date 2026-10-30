import { Inject, Injectable } from '@nestjs/common';
import type { ShopperStore } from '../ports/shopper-store';
import { SHOPPER_STORE } from '../tokens';

/** LIF-19: the day-60 deletion job's shoppers step -- every account, sign-in, code and address; safe to run again. */
@Injectable()
export class ShoppersEraser {
  constructor(@Inject(SHOPPER_STORE) private readonly store: ShopperStore) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run(tenantId, (tx) => this.store.deleteAllForTenant(tx, tenantId));
  }
}
