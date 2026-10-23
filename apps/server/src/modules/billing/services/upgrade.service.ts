import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  InvoiceKind,
  PlanPaymentKind,
  PlanPaymentStatus,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { addMonths, HOUR_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import type { AddonCarry } from '../types/addon';
import { AddonRenewalService, addonsTotal } from './addon-renewal.service';
import { assertAmountSeen } from './amount-seen';
import { BillingTermsService } from './billing-terms.service';
import { DowngradeService } from './downgrade.service';
import { PlanInvoicingService } from './plan-invoicing.service';
import { PlansService } from './plans.service';
import { unusedPlanValue } from './plan-credit';

// UPG-07: a quote's price is held for 15 minutes (shorter than a purchase's 30, S-priority but the same
// hold-then-expire shape as BIL-09 -- past the window the tenant re-quotes rather than silently re-pricing).
const QUOTE_HOLD_MS = HOUR_MS / 4;

/** UPG-06: an upgrade's quote, with the period it would run were it confirmed now. */
export interface UpgradeQuote extends PlanPaymentRecord {
  periodStart: Date;
  periodEnd: Date;
}

/**
 * UPG-03 to UPG-06, UPG-14: what upgrading to this plan and term would be for this shop now -- the new price less the
 * credit for the plan time not used, with the add-ons it extends -- worked out once for the prices read and the request.
 */
export interface UpgradeOffer {
  /** The new plan's price for the term. */
  price: string;
  credit: string;
  extensions: AddonCarry[];
  /** What is due: the price less the credit, and the add-ons it extends. */
  amount: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * UPG-09: the period an upgrade runs -- it starts when it is confirmed and lasts the new term's months. The quote shows
 * it as of now, and the confirmation sets it as of then.
 */
function upgradePeriod(confirmedAt: Date, months: number): { start: Date; end: Date } {
  return { start: confirmedAt, end: addMonths(confirmedAt, months) };
}

export interface ConfirmUpgradeResult {
  payment: PlanPaymentRecord;
  invoice: InvoiceRecord | null;
}

/**
 * UPG-01 to UPG-17: a mid-period upgrade to a higher-ranked plan, with a prorated credit for the unused days
 * of the plan being left. Shaped directly on `PurchaseService` -- both payment methods (balance, wallet)
 * work exactly the same way an ordinary purchase's do (UPG-01/16, corrected in docs/SRS-detailed.md to match
 * PLN-4's general payment-method rule, not a wallet-only exception).
 */
@Injectable()
export class UpgradeService {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(PlanInvoicingService) private readonly invoicing: PlanInvoicingService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DowngradeService) private readonly downgrade: DowngradeService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * UPG-01 to UPG-05: the request, made when the seller commits, from `offer`'s eligibility, rank and prorated credit.
   * UPG-08: an upgrade the shop submitted and the operator has not decided refuses a new one; an unsubmitted one is
   * closed by it (BIL-19). UPG-14: the add-ons set to renew are extended to the new period's end in the same payment,
   * each a pending purchase on it.
   */
  async quote(
    tenantId: string,
    planId: string,
    billingTermId: string,
    seen?: number,
  ): Promise<UpgradeQuote> {
    const now = this.clock();
    const offer = await this.offer(tenantId, planId, billingTermId);
    assertAmountSeen(seen, offer.amount);
    return this.tenants.runStandalone(async (tx) => {
      if (await this.payments.findSubmittedOpen(tx, tenantId, PlanPaymentKind.Upgrade)) {
        throw new ApiError('conflict', 'UpgradePending', {});
      }
      const payment = await this.payments.quote(
        tx,
        {
          tenantId,
          kind: PlanPaymentKind.Upgrade,
          planId,
          billingTermId,
          amount: offer.amount,
          creditAmount: offer.credit,
        },
        now,
      );
      await this.renewals.attach(tx, payment, offer.extensions, {
        expiresAt: offer.periodEnd,
        extending: true,
      });
      return { ...payment, periodStart: offer.periodStart, periodEnd: offer.periodEnd };
    });
  }

  /**
   * What upgrading to this plan and term would be now, without making a payment: the prices read shows it and `quote`
   * makes the request from it -- one calculation for both. Refuses as the request would: only an active shop, only to
   * a higher plan for sale, only when something is due.
   */
  async offer(tenantId: string, planId: string, billingTermId: string): Promise<UpgradeOffer> {
    const now = this.clock();
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (
      !info ||
      info.state !== TenantState.Active ||
      !info.periodStart ||
      !info.periodEnd ||
      info.periodEnd.getTime() <= now.getTime()
    ) {
      throw new ApiError('plan_feature_unavailable', 'UpgradeNotAvailable', {});
    }
    if (!info.planId) throw new ApiError('plan_feature_unavailable', 'UpgradeNotAvailable', {});

    const currentPlan = await this.plans.findById(info.planId);
    const targetPlan = await this.plans.findById(planId);
    if (!targetPlan.forSale || targetPlan.rank <= currentPlan.rank) {
      throw new ApiError('validation_error', 'UpgradeMustBeHigherRank', {});
    }
    const term = await this.terms.findById(billingTermId);
    // TRM-04: a retired term is no longer offered, including for an upgrade's own term choice.
    if (term.retiredAt) throw new ApiError('not_found', 'BillingTermNotFound', {});
    const newPrice = await this.terms.findPrice(planId, billingTermId);
    if (newPrice === null) throw new ApiError('not_found', 'PriceNotFound', {});

    // UPG-03 (KNOWN-GAPS §84): the plan time paid for and not used, never an add-on's invoice.
    const credit = unusedPlanValue(await this.invoices.listForTenant(tenantId), now);
    const amountDue = Number(newPrice) - credit;
    if (amountDue <= 0) {
      throw new ApiError('validation_error', 'UpgradeNotWorthwhile', {});
    }

    // UPG-06: the period it would run, were it confirmed now.
    const period = upgradePeriod(now, term.months);
    const extensions = await this.renewals.extensions(
      tenantId,
      info.periodEnd,
      { start: now, end: period.end, months: term.months },
      await this.renewals.planFor(tenantId, targetPlan),
    );
    return {
      price: newPrice,
      credit: credit.toFixed(2),
      extensions,
      amount: fromPaisa(toPaisa(amountDue.toFixed(2)) + addonsTotal(extensions)),
      periodStart: period.start,
      periodEnd: period.end,
    };
  }

  /** UPG-16's wallet path: the tenant's "I have paid" submission -- enters the queue, nothing activates yet. */
  submitWalletPayment(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
  ): Promise<PlanPaymentRecord> {
    return this.payments.submitWalletPayment(paymentId, tenantId, input, [PlanPaymentKind.Upgrade]);
  }

  /** UPG-16's balance path: atomic, instant, no operator -- the same shape as a purchase's. */
  async confirmFromBalance(
    paymentId: string,
    tenantId: string,
    ip?: string | null,
  ): Promise<ConfirmUpgradeResult> {
    const now = this.clock();
    return this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.findForUpdate(tx, paymentId);
      if (!payment || payment.tenantId !== tenantId || payment.kind !== PlanPaymentKind.Upgrade) {
        throw new ApiError('not_found', 'PlanPaymentNotFound', {});
      }
      if (payment.status !== PlanPaymentStatus.Pending) {
        throw new ApiError('conflict', 'PlanPaymentNotPending', {});
      }
      if (now.getTime() - payment.quotedAt.getTime() > QUOTE_HOLD_MS) {
        throw new ApiError('conflict', 'QuoteExpired', {});
      }

      await this.renewals.charge(tx, payment);
      await this.payments.markVerifiedDirect(tx, payment.id, now);
      const invoice = await this.activate(tx, payment, now, ip);
      return {
        payment: { ...payment, status: PlanPaymentStatus.Verified, verifiedAt: now },
        invoice,
      };
    });
  }

  /**
   * UPG-09/12/15: called from `confirmFromBalance` and from the operator payment-queue (after
   * `PlanPaymentsService.approve` marks a wallet payment verified). The cycle restarts at confirmation time
   * -- unlike a renewal's extend, an upgrade never continues the old plan's period.
   *
   * UPG-13: an upgrade supersedes any pending downgrade/pay-as-you-go-switch, cancelled in this same
   * transaction (both control-schema, no RLS concern).
   */
  async activate(
    tx: Transaction,
    payment: PlanPaymentRecord,
    now: Date,
    ip?: string | null,
  ): Promise<InvoiceRecord> {
    if (!payment.planId || !payment.billingTermId) {
      throw new Error('an upgrade payment is missing its plan or billing term');
    }

    const info = await this.tenants.findBillingInfo(tx, payment.tenantId);
    if (!info) throw new Error('activate() called for a tenant with no billing info');
    const oldPlanId = info.planId;
    const plan = await this.plans.findById(payment.planId);
    const term = await this.terms.findById(payment.billingTermId);

    const { start: periodStart, end: periodEnd } = upgradePeriod(now, term.months);

    await this.tenants.applyPlanAssignment(tx, payment.tenantId, {
      planId: plan.id,
      planSnapshot: plan.limits,
      planVersionSnapshot: plan.version,
      featureSnapshot: plan.features,
      periodStart,
      periodEnd,
      state: TenantState.Active,
      billingTermId: term.id, // BIL-17: the term auto-renewal will reuse at the next period end.
    });
    await this.downgrade.cancelIfScheduled(tx, payment.tenantId);
    // UPG-14: the add-ons it extended run on from their own ends to the new period's end.
    const addons = await this.renewals.activate(tx, payment, {
      start: periodStart,
      end: periodEnd,
    });

    // UPG-13: an upgrade also supersedes a pending non-renewal intent -- paying to upgrade is inconsistent
    // with "don't renew", and a stale cancelledAt would otherwise block BIL-17's own auto-renewal at the
    // new period's end even with the toggle on.
    if (info.cancelledAt) {
      await this.tenants.setCancellation(tx, payment.tenantId, null);
      await this.audit.record(tx, {
        tenantId: payment.tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.SubscriptionCancellationUndone,
        ip: ip ?? null,
        targetType: 'tenant',
        targetId: payment.tenantId,
        result: AuditResult.Success,
        summary: {},
      });
    }

    const invoice = await this.invoicing.issue(tx, {
      kind: InvoiceKind.Upgrade,
      payment,
      plan,
      term,
      // UPG-04: the amount due is the term's price less the credit, so the two together are the price quoted; the
      // extended add-ons are lines of their own.
      fullPrice: fromPaisa(
        toPaisa(payment.amount) - addonsTotal(addons) + toPaisa(payment.creditAmount),
      ),
      periodStart,
      periodEnd,
      shopName: info.shopName,
      addons,
    });

    await this.audit.record(tx, {
      tenantId: payment.tenantId,
      actorType: ActorType.User,
      actorId: null,
      action: AuditAction.PlanUpgraded,
      ip: ip ?? null,
      targetType: 'plan_payment',
      targetId: payment.id,
      result: AuditResult.Success,
      summary: {
        oldPlanId,
        newPlanId: plan.id,
        amount: payment.amount,
        creditAmount: payment.creditAmount,
        invoiceNumber: invoice.number,
      },
    });

    return invoice;
  }
}
