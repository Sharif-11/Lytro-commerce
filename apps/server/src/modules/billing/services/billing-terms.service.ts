import { Inject, Injectable } from '@nestjs/common';
import { AuditResult, PlatformActorType, PlatformAuditAction } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
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
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /** TRM-16: every term change is audited -- old value is null, nothing existed before this. */
  async create(
    values: NewBillingTermValues,
    operatorId: string,
    ip?: string | null,
  ): Promise<BillingTermRecord> {
    const created = await this.store.run((tx) => this.store.create(tx, values));
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.BillingTermCreated,
      targetType: 'billing_term',
      targetId: created.id,
      result: AuditResult.Success,
      ip: ip ?? null,
      summary: { oldValue: null, newValue: values },
    });
    return created;
  }

  /** TRM-14: platform-wide visible terms, plus a tenant's own scoped term when one applies. */
  listVisibleFor(tenantId: string | null): Promise<BillingTermRecord[]> {
    return this.store.run((tx) => this.store.listVisibleFor(tx, tenantId));
  }

  listAll(): Promise<BillingTermRecord[]> {
    return this.store.run((tx) => this.store.listAll(tx));
  }

  async findById(id: string): Promise<BillingTermRecord> {
    const term = await this.store.run((tx) => this.store.findById(tx, id));
    if (!term) throw new ApiError('not_found', 'BillingTermNotFound', {});
    return term;
  }

  /** BIL-01: the price for one plan+term pair, or null if the operator never set one. */
  async findPrice(planId: string, billingTermId: string): Promise<string | null> {
    const prices = await this.listPricesForPlan(planId);
    return prices.find((p) => p.billingTermId === billingTermId)?.price ?? null;
  }

  /**
   * TRM-11: affects future purchases only; an existing snapshot keeps the term as bought (unaffected here).
   * TRM-16: audited with the old and new value of every edited field.
   */
  async update(
    id: string,
    edit: BillingTermEditValues,
    operatorId: string,
    ip?: string | null,
  ): Promise<BillingTermRecord> {
    const { before, updated } = await this.store.run(async (tx) => {
      const before = await this.store.findById(tx, id);
      if (!before) throw new ApiError('not_found', 'BillingTermNotFound', {});
      const updated = await this.store.update(tx, id, edit);
      if (!updated) throw new ApiError('not_found', 'BillingTermNotFound', {});
      return { before, updated };
    });
    // Zod fills every optional field in as an explicit `undefined`, so `Object.keys(edit)` alone would
    // claim every field changed; only the ones the caller actually set belong in the audit.
    const changedKeys = (Object.keys(edit) as (keyof BillingTermEditValues)[]).filter(
      (key) => edit[key] !== undefined,
    );
    const oldValue: Partial<Record<keyof BillingTermEditValues, unknown>> = {};
    const newValue: Partial<Record<keyof BillingTermEditValues, unknown>> = {};
    for (const key of changedKeys) {
      oldValue[key] = before[key];
      newValue[key] = edit[key];
    }
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.BillingTermUpdated,
      targetType: 'billing_term',
      targetId: id,
      result: AuditResult.Success,
      ip: ip ?? null,
      summary: { oldValue, newValue },
    });
    return updated;
  }

  /**
   * TRM-04: stops future purchases and renewals (enforced by `PurchaseService`/`UpgradeService.quote`
   * refusing a retired term, and by this term dropping out of `listVisibleFor`); changes nothing for
   * subscriptions already on it -- their plan/dates/price are snapshotted at purchase time, never re-read
   * from this row. TRM-16: audited with the old and new `retiredAt`.
   */
  async retire(id: string, operatorId: string, ip?: string | null): Promise<BillingTermRecord> {
    const now = this.clock();
    const { before, updated } = await this.store.run(async (tx) => {
      const before = await this.store.findById(tx, id);
      if (!before) throw new ApiError('not_found', 'BillingTermNotFound', {});
      const updated = await this.store.retire(tx, id, now);
      if (!updated) throw new ApiError('not_found', 'BillingTermNotFound', {});
      return { before, updated };
    });
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.BillingTermRetired,
      targetType: 'billing_term',
      targetId: id,
      result: AuditResult.Success,
      ip: ip ?? null,
      summary: { oldValue: { retiredAt: before.retiredAt }, newValue: { retiredAt: now } },
    });
    return updated;
  }

  /** TRM-05: a term priced for any plan isn't deletable, only retirable. */
  async delete(id: string): Promise<void> {
    await this.store.run(async (tx) => {
      const term = await this.store.findById(tx, id);
      if (!term) throw new ApiError('not_found', 'BillingTermNotFound', {});
      if (await this.store.isUsed(tx, id)) {
        throw new ApiError('conflict', 'BillingTermInUse', {});
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
