import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { PaymentPolicy } from '@lytronix/validators';
import type { ShopPolicyStore } from '../ports/catalogue-stores';
import { SHOP_POLICY_STORE } from '../tokens';
import type { ShopPaymentPolicy } from '../types/catalogue';
import { settlePaymentPolicy } from './payment-policy';

// A shop that has never set a default asks for nothing up front.
const NO_DEFAULT: ShopPaymentPolicy = {
  defaultPaymentPolicy: PaymentPolicy.None,
  defaultAdvanceAmount: null,
};

/**
 * PRD-08: the shop-wide default payment policy, which every product with no policy of its own follows (none until
 * the shop sets one). Order creation (Phase 4) reads it to compute the advance.
 */
@Injectable()
export class ShopPaymentPolicyService {
  constructor(@Inject(SHOP_POLICY_STORE) private readonly store: ShopPolicyStore) {}

  async get(tenantId: string): Promise<ShopPaymentPolicy> {
    return (await this.store.get(tenantId)) ?? NO_DEFAULT;
  }

  /** The default, inside the caller's transaction. */
  async within(tx: Transaction, tenantId: string): Promise<ShopPaymentPolicy> {
    return (await this.store.find(tx, tenantId)) ?? NO_DEFAULT;
  }

  /** Sets the default; a partial advance needs its amount, and no other policy takes one. */
  async set(
    tenantId: string,
    input: { defaultPaymentPolicy?: PaymentPolicy; defaultAdvanceAmount?: number | null },
  ): Promise<ShopPaymentPolicy> {
    const current = await this.get(tenantId);
    const settled = settlePaymentPolicy(
      { policy: current.defaultPaymentPolicy, advance: current.defaultAdvanceAmount },
      { policy: input.defaultPaymentPolicy, advance: input.defaultAdvanceAmount },
      'defaultAdvanceAmount',
    );
    const next = { defaultPaymentPolicy: settled.policy, defaultAdvanceAmount: settled.advance };
    await this.store.set(tenantId, next);
    return next;
  }
}
