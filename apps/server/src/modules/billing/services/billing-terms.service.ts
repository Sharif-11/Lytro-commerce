import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { AuditResult, PlatformActorType, PlatformAuditAction } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
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

  /**
   * TRM-16: every term change is audited -- old value is null, nothing existed before this. ADM-08: each change and
   * its platform audit entry commit together or not at all.
   */
  create(
    values: NewBillingTermValues,
    operatorId: string,
    ip?: string | null,
  ): Promise<BillingTermRecord> {
    return this.store.run(async (tx) => {
      const created = await this.store.create(tx, values);
      await this.platformAudit.recordWithin(tx, {
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
    });
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

  /**
   * TRM-12, BIL-12: what a plan's price for one term saves against the plan's shortest visible priced term at
   * that term's monthly rate -- the saving the purchase screen shows, in taka (Starter for 12 months at 4,741
   * against 449 a month saves 647.00, 12%). Zero for the shortest term itself, or with no shorter priced term.
   */
  async savingFor(
    tenantId: string,
    planId: string,
    term: BillingTermRecord,
    price: string,
  ): Promise<string> {
    const [terms, prices] = await Promise.all([
      this.listVisibleFor(tenantId),
      this.listPricesForPlan(planId),
    ]);
    const priceOf = (termId: string): string | undefined =>
      prices.find((p) => p.billingTermId === termId)?.price;
    const shortest = terms
      .filter((candidate) => candidate.retiredAt === null && priceOf(candidate.id) !== undefined)
      .reduce<BillingTermRecord | null>(
        (best, candidate) => (best === null || candidate.months < best.months ? candidate : best),
        null,
      );
    const shortestPrice = shortest ? priceOf(shortest.id) : undefined;
    if (!shortest || shortestPrice === undefined || shortest.months >= term.months) {
      return fromPaisa(0n);
    }
    // The shorter term's rate over this term's months, rounded half up to the paisa.
    const months = BigInt(shortest.months);
    const scaled = toPaisa(shortestPrice) * BigInt(term.months);
    const fullPaisa = (scaled * 2n + months) / (2n * months);
    const saving = fullPaisa - toPaisa(price);
    return fromPaisa(saving > 0n ? saving : 0n);
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
  update(
    id: string,
    edit: BillingTermEditValues,
    operatorId: string,
    ip?: string | null,
  ): Promise<BillingTermRecord> {
    return this.store.run(async (tx) => {
      const before = await this.store.findById(tx, id);
      if (!before) throw new ApiError('not_found', 'BillingTermNotFound', {});
      const updated = await this.store.update(tx, id, edit);
      if (!updated) throw new ApiError('not_found', 'BillingTermNotFound', {});
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
      await this.platformAudit.recordWithin(tx, {
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
    });
  }

  /**
   * TRM-04: stops future purchases and renewals (enforced by `PurchaseService`/`UpgradeService.quote`
   * refusing a retired term, and by this term dropping out of `listVisibleFor`); changes nothing for
   * subscriptions already on it -- their plan/dates/price are snapshotted at purchase time, never re-read
   * from this row. TRM-16: audited with the old and new `retiredAt`.
   */
  retire(id: string, operatorId: string, ip?: string | null): Promise<BillingTermRecord> {
    const now = this.clock();
    return this.store.run(async (tx) => {
      const before = await this.store.findById(tx, id);
      if (!before) throw new ApiError('not_found', 'BillingTermNotFound', {});
      const updated = await this.store.retire(tx, id, now);
      if (!updated) throw new ApiError('not_found', 'BillingTermNotFound', {});
      await this.platformAudit.recordWithin(tx, {
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
    });
  }

  /** TRM-05: a term priced for any plan isn't deletable, only retirable. TRM-16: audited, with what it was. */
  async delete(id: string, operatorId: string, ip?: string | null): Promise<void> {
    await this.store.run(async (tx) => {
      const term = await this.store.findById(tx, id);
      if (!term) throw new ApiError('not_found', 'BillingTermNotFound', {});
      if (await this.store.isUsed(tx, id)) {
        throw new ApiError('conflict', 'BillingTermInUse', {});
      }
      await this.store.delete(tx, id);
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.BillingTermDeleted,
        targetType: 'billing_term',
        targetId: id,
        result: AuditResult.Success,
        ip: ip ?? null,
        summary: { oldValue: { labelEn: term.labelEn, months: term.months } },
      });
    });
  }

  /** TRM-03: a plan's price for a term, audited with the price it replaces. */
  setPrice(
    planId: string,
    billingTermId: string,
    price: string,
    operatorId: string,
    ip?: string | null,
  ): Promise<void> {
    return this.store.run(async (tx) => {
      const before = await this.priceWithin(tx, planId, billingTermId);
      await this.store.setPrice(tx, planId, billingTermId, price);
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlanPriceSet,
        targetType: 'plan',
        targetId: planId,
        result: AuditResult.Success,
        ip: ip ?? null,
        summary: { billingTermId, oldValue: before, newValue: price },
      });
    });
  }

  listPricesForPlan(planId: string): Promise<PlanPriceRecord[]> {
    return this.store.run((tx) => this.store.listPricesForPlan(tx, planId));
  }

  /** TRM-03: a plan's price for a term removed, audited with the price it was. */
  removePrice(
    planId: string,
    billingTermId: string,
    operatorId: string,
    ip?: string | null,
  ): Promise<void> {
    return this.store.run(async (tx) => {
      const before = await this.priceWithin(tx, planId, billingTermId);
      await this.store.removePrice(tx, planId, billingTermId);
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlanPriceRemoved,
        targetType: 'plan',
        targetId: planId,
        result: AuditResult.Success,
        ip: ip ?? null,
        summary: { billingTermId, oldValue: before },
      });
    });
  }

  private async priceWithin(
    tx: Transaction,
    planId: string,
    billingTermId: string,
  ): Promise<string | null> {
    const prices = await this.store.listPricesForPlan(tx, planId);
    return prices.find((row) => row.billingTermId === billingTermId)?.price ?? null;
  }
}
