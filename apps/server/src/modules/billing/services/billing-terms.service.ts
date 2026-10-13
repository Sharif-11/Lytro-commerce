import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import type {
  BillingTermEditValues,
  BillingTermsStore,
  NewBillingTermValues,
} from '../ports/billing-terms-store';
import { BILLING_TERMS_STORE, CLOCK } from '../tokens';
import type { BillingTermRecord, PlanPriceRecord } from '../types/billing-term';

/** control.billing_terms and control.plan_prices (TRM-01 to TRM-16). */
@Injectable()
export class BillingTermsService {
  constructor(
    @Inject(BILLING_TERMS_STORE) private readonly store: BillingTermsStore,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  create(values: NewBillingTermValues): Promise<BillingTermRecord> {
    return this.store.run((tx) => this.store.create(tx, values));
  }

  /** TRM-14: platform-wide visible terms, plus a tenant's own scoped term when one applies. */
  listVisibleFor(tenantId: string | null): Promise<BillingTermRecord[]> {
    return this.store.run((tx) => this.store.listVisibleFor(tx, tenantId));
  }

  listAll(): Promise<BillingTermRecord[]> {
    return this.store.run((tx) => this.store.listAll(tx));
  }

  /** TRM-11: affects future purchases only; an existing snapshot keeps the term as bought (unaffected here). */
  async update(id: string, edit: BillingTermEditValues): Promise<BillingTermRecord> {
    const updated = await this.store.run((tx) => this.store.update(tx, id, edit));
    if (!updated) throw new ApiError('not_found', 'Billing term not found.', {});
    return updated;
  }

  /** TRM-04: stops future purchases and renewals; changes nothing for subscriptions already on it. */
  retire(id: string): Promise<void> {
    return this.store.run((tx) => this.store.retire(tx, id, this.clock()));
  }

  /** TRM-05: a term priced for any plan isn't deletable, only retirable. */
  async delete(id: string): Promise<void> {
    await this.store.run(async (tx) => {
      const term = await this.store.findById(tx, id);
      if (!term) throw new ApiError('not_found', 'Billing term not found.', {});
      if (await this.store.isUsed(tx, id)) {
        throw new ApiError('conflict', 'This term is priced for a plan. Retire it instead.', {});
      }
      await this.store.delete(tx, id);
    });
  }

  setPrice(planId: string, billingTermId: string, price: string): Promise<void> {
    return this.store.run((tx) => this.store.setPrice(tx, planId, billingTermId, price));
  }

  listPricesForPlan(planId: string): Promise<PlanPriceRecord[]> {
    return this.store.run((tx) => this.store.listPricesForPlan(tx, planId));
  }

  removePrice(planId: string, billingTermId: string): Promise<void> {
    return this.store.run((tx) => this.store.removePrice(tx, planId, billingTermId));
  }
}
