import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  InvoiceKind,
  LedgerEntryType,
  PlanPaymentKind,
  PlanPaymentStatus,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { addMonths, daysBetween, daysUntil, HOUR_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import { BillingTermsService } from './billing-terms.service';
import { DowngradeService } from './downgrade.service';
import { PlansService } from './plans.service';

// UPG-07: a quote's price is held for 15 minutes (shorter than a purchase's 30, S-priority but the same
// hold-then-expire shape as BIL-09 -- past the window the tenant re-quotes rather than silently re-pricing).
const QUOTE_HOLD_MS = HOUR_MS / 4;

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
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DowngradeService) private readonly downgrade: DowngradeService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /** UPG-01 to UPG-05: eligibility, rank, the prorated credit/amount-due math, and the one-pending check. */
  async quote(tenantId: string, planId: string, billingTermId: string): Promise<PlanPaymentRecord> {
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

    const existing = await this.payments.findActiveForTenant(tenantId, PlanPaymentKind.Upgrade);
    if (existing) throw new ApiError('conflict', 'UpgradePending', {});

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

    const latestInvoice = (await this.invoices.listForTenant(tenantId))[0];
    const pricePaid = latestInvoice?.amount ?? '0';

    const totalDays = daysBetween(info.periodStart, info.periodEnd);
    const remainingDays = daysUntil(now, info.periodEnd);
    const credit = Math.round((Number(pricePaid) * remainingDays) / totalDays);
    const amountDue = Number(newPrice) - credit;
    if (amountDue <= 0) {
      throw new ApiError('validation_error', 'UpgradeNotWorthwhile', {});
    }

    return this.payments.quoteStandalone({
      tenantId,
      kind: PlanPaymentKind.Upgrade,
      planId,
      billingTermId,
      amount: amountDue.toFixed(2),
      creditAmount: credit.toFixed(2),
    });
  }

  /** UPG-16's wallet path: the tenant's "I have paid" submission -- enters the queue, nothing activates yet. */
  submitWalletPayment(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
  ): Promise<PlanPaymentRecord> {
    return this.payments.submitWalletPayment(paymentId, tenantId, input, PlanPaymentKind.Upgrade);
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

      await this.balance.charge(tx, {
        tenantId,
        type: LedgerEntryType.PlanPayment,
        amount: payment.amount,
        reference: { planPaymentId: payment.id },
      });
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
    const oldPlanId = info?.planId ?? null;
    const plan = await this.plans.findById(payment.planId);
    const term = await this.terms.findById(payment.billingTermId);

    const periodStart = now;
    const periodEnd = addMonths(periodStart, term.months);

    await this.tenants.applyPlanAssignment(tx, payment.tenantId, {
      planId: plan.id,
      planSnapshot: plan.limits,
      periodStart,
      periodEnd,
      state: TenantState.Active,
      billingTermId: term.id, // BIL-17: the term auto-renewal will reuse at the next period end.
    });
    await this.downgrade.cancelIfScheduled(tx, payment.tenantId);

    // UPG-13: an upgrade also supersedes a pending non-renewal intent -- paying to upgrade is inconsistent
    // with "don't renew", and a stale cancelledAt would otherwise block BIL-17's own auto-renewal at the
    // new period's end even with the toggle on.
    if (info?.cancelledAt) {
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

    const invoice = await this.invoices.issue(tx, {
      tenantId: payment.tenantId,
      kind: InvoiceKind.Upgrade,
      planSnapshot: plan.limits,
      amount: payment.amount,
      creditAmount: payment.creditAmount,
      billingTermLabel: term.labelEn,
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
