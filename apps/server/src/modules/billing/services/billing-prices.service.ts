import { Inject, Injectable } from '@nestjs/common';
import { PlanPaymentKind, TenantState } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { MessageKey } from '../../../common/i18n/message-key';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { AddonCarry } from '../types/addon';
import type { PlanRecord } from '../types/plan';
import { BillingTermsService } from './billing-terms.service';
import { PlansService } from './plans.service';
import { PurchaseService } from './purchase.service';
import { UpgradeService } from './upgrade.service';

/** What paying for a plan on a term would be for the shop now. */
export type PriceMove = 'renewal' | 'purchase' | 'upgrade' | 'downgrade';

/** PLN-14, UPG-14: an add-on the payment would carry or extend, and what that adds. */
export interface PricedAddon {
  addonId: string;
  key: string;
  labelEn: string;
  quantity: number;
  amount: string;
}

export interface PlanPriceOption {
  planId: string;
  planName: string;
  move: PriceMove;
  /** The plan's price for the term. */
  price: string;
  /**
   * What the payment would hold, exactly as the request would make it: the price and the add-ons a renewal carries, the
   * price less the unused-time credit and the add-ons an upgrade extends, or the price. Null for a move down, which
   * charges nothing now (DWN-01), and for an upgrade that cannot be made now.
   */
  amount: string | null;
  /** UPG-03: an upgrade's credit for the plan time not used. */
  credit: string | null;
  addons: PricedAddon[];
  /** Why it cannot be paid now (an upgrade already open, nothing due); null when it can. */
  blockedBy: MessageKey | null;
}

function pricedAddon({ from, price }: AddonCarry): PricedAddon {
  return {
    addonId: from.addonId,
    key: from.key,
    labelEn: from.labelEn,
    quantity: from.quantity,
    amount: price,
  };
}

// The refusals that mean the plan is not offered on this term at all, rather than offered but not payable now.
const NOT_OFFERED: ReadonlySet<MessageKey> = new Set([
  'PlanNotFound',
  'PriceNotFound',
  'BillingTermNotFound',
]);

/**
 * BIL-01, UPG-03 to UPG-06, PLN-14 (decided 2026-10-23): what each plan would cost the shop now on one term, read without
 * making a payment. The screens show these figures, and the payment is quoted only when the seller commits; each figure
 * comes from the same `offer` its request is made from, so what is shown is what the request holds.
 */
@Injectable()
export class BillingPricesService {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(UpgradeService) private readonly upgrade: UpgradeService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  async forTerm(tenantId: string, billingTermId: string): Promise<PlanPriceOption[]> {
    const term = await this.terms.findById(billingTermId);
    // TRM-04: a retired term is offered for nothing.
    if (term.retiredAt) throw new ApiError('not_found', 'BillingTermNotFound', {});
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    const current = info?.planId ? await this.plans.findById(info.planId) : null;
    const active = info?.state === TenantState.Active && current !== null;
    const upgradeOpen = active
      ? await this.payments.run((tx) =>
          this.payments.findSubmittedOpen(tx, tenantId, PlanPaymentKind.Upgrade),
        )
      : null;

    const options: PlanPriceOption[] = [];
    const forSale = [...(await this.plans.listForSale())].sort((a, b) => a.rank - b.rank);
    for (const plan of forSale) {
      const option =
        active && plan.rank > current.rank
          ? await this.upgradeOption(tenantId, plan, billingTermId, upgradeOpen !== null)
          : await this.purchaseOption(
              tenantId,
              plan,
              billingTermId,
              active && plan.rank < current.rank,
            );
      if (option) options.push(option);
    }
    return options;
  }

  /** BIL-10, DWN-05: the shop's own plan renews; a lower one, while active, is a move down at the period's end. */
  private async purchaseOption(
    tenantId: string,
    plan: PlanRecord,
    billingTermId: string,
    lower: boolean,
  ): Promise<PlanPriceOption | null> {
    try {
      const offer = await this.purchase.offer(tenantId, plan.id, billingTermId);
      const renewal = offer.kind === PlanPaymentKind.Renewal;
      const move: PriceMove = renewal ? 'renewal' : lower ? 'downgrade' : 'purchase';
      return {
        planId: plan.id,
        planName: plan.name,
        move,
        price: offer.price,
        amount: move === 'downgrade' ? null : offer.amount,
        credit: null,
        addons: offer.carries.map(pricedAddon),
        blockedBy: null,
      };
    } catch (error) {
      if (error instanceof ApiError && NOT_OFFERED.has(error.messageKey)) return null;
      throw error;
    }
  }

  /** UPG-03 to UPG-08: a higher plan, priced as the upgrade request would be. */
  private async upgradeOption(
    tenantId: string,
    plan: PlanRecord,
    billingTermId: string,
    upgradeOpen: boolean,
  ): Promise<PlanPriceOption | null> {
    const price = await this.terms.findPrice(plan.id, billingTermId);
    if (price === null) return null;
    const option = {
      planId: plan.id,
      planName: plan.name,
      move: 'upgrade' as const,
      price,
    };
    try {
      const offer = await this.upgrade.offer(tenantId, plan.id, billingTermId);
      return {
        ...option,
        amount: offer.amount,
        credit: offer.credit,
        addons: offer.extensions.map(pricedAddon),
        blockedBy: upgradeOpen ? 'UpgradePending' : null,
      };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (NOT_OFFERED.has(error.messageKey)) return null;
      return { ...option, amount: null, credit: null, addons: [], blockedBy: error.messageKey };
    }
  }
}
