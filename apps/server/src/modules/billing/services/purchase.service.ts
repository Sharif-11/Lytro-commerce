import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  InvoiceKind,
  PlanPaymentKind,
  PlanPaymentStatus,
  TenantState,
} from '@lytronix/validators';
import type { BillingInfoRow, Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { addMonths, HOUR_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import type { AddonCarry } from '../types/addon';
import type { BillingTermRecord } from '../types/billing-term';
import type { PlanRecord } from '../types/plan';
import { AddonRenewalService, addonsTotal } from './addon-renewal.service';
import { BillingTermsService } from './billing-terms.service';
import { DowngradeService } from './downgrade.service';
import { PlanInvoicingService } from './plan-invoicing.service';
import { PlansService } from './plans.service';

// BIL-09: a quote's price is held for 30 minutes.
const QUOTE_HOLD_MS = HOUR_MS / 2;

// The payments this service confirms: a plan bought or renewed -- never an upgrade, a top-up or an add-on, which each
// have their own.
const PURCHASE_KINDS: readonly PlanPaymentKind[] = [
  PlanPaymentKind.Purchase,
  PlanPaymentKind.Renewal,
];

export type ConfirmPurchaseInput =
  | { method: 'balance' }
  | { method: 'wallet'; transactionId: string; senderNumber: string; amountPaid: string };

export interface ConfirmPurchaseResult {
  payment: PlanPaymentRecord;
  invoice: InvoiceRecord | null;
}

/** BIL-17, PLN-14: what renewing onto a plan and term costs -- the plan's price, and the add-ons it carries. */
export interface RenewalOffer {
  price: string;
  carries: AddonCarry[];
}

/**
 * BIL-01 to BIL-11: quoting and confirming a plan purchase or renewal. Paying from balance (BIL-08) is
 * atomic and instant, with no operator step; paying by wallet is the tenant's "I have paid" submission,
 * which only enters the operator's payment-queue (D2-1) -- activation happens later, from there.
 */
@Injectable()
export class PurchaseService {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(PlanInvoicingService) private readonly invoicing: PlanInvoicingService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DowngradeService) private readonly downgrade: DowngradeService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * BIL-01: the price and saving shown to the tenant; held for 30 minutes (BIL-09). A renewal carries the add-ons of the
   * period it renews (PLN-14) in the same payment, each a pending purchase on it -- every one set to renew, or, from
   * auto-renew, the ones the balance reaches (`carries`).
   */
  async quote(
    tenantId: string,
    planId: string,
    billingTermId: string,
    carries?: readonly AddonCarry[],
  ): Promise<PlanPaymentRecord> {
    const now = this.clock();
    const { plan, term, price } = await this.priced(planId, billingTermId);
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    const isRenewal = await this.isRenewal(tenantId, planId, info);
    const carried = isRenewal
      ? (carries ?? (await this.carriesFor(tenantId, plan, term, info)))
      : [];
    // Where the period would end if paid now; written again from the period it lands in once it is paid.
    const periodEnd = info?.periodEnd;
    const endsAt = addMonths(periodEnd && periodEnd > now ? periodEnd : now, term.months);

    return this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.quote(tx, {
        tenantId,
        kind: isRenewal ? PlanPaymentKind.Renewal : PlanPaymentKind.Purchase,
        planId,
        billingTermId,
        amount: fromPaisa(toPaisa(price) + addonsTotal(carried)),
        creditAmount: '0',
      });
      await this.renewals.attach(tx, payment, carried, { expiresAt: endsAt, extending: false });
      return payment;
    });
  }

  /** BIL-17, PLN-14: the plan's price for this term, and the add-ons renewing onto it would carry. */
  async renewalOffer(
    tenantId: string,
    planId: string,
    billingTermId: string,
  ): Promise<RenewalOffer> {
    const { plan, term, price } = await this.priced(planId, billingTermId);
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    const isRenewal = await this.isRenewal(tenantId, planId, info);
    return { price, carries: isRenewal ? await this.carriesFor(tenantId, plan, term, info) : [] };
  }

  /** BIL-02/16: the tenant's "I have paid" wallet submission -- enters the queue, nothing activates yet. */
  submitWalletPayment(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
  ): Promise<PlanPaymentRecord> {
    return this.payments.submitWalletPayment(paymentId, tenantId, input, PURCHASE_KINDS);
  }

  /** BIL-08: pay from balance -- atomic, instant, no transaction ID, no operator. */
  async confirmFromBalance(
    paymentId: string,
    tenantId: string,
    ip?: string | null,
  ): Promise<ConfirmPurchaseResult> {
    const now = this.clock();
    return this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.findForUpdate(tx, paymentId);
      if (!payment || payment.tenantId !== tenantId || !PURCHASE_KINDS.includes(payment.kind)) {
        throw new ApiError('not_found', 'PlanPaymentNotFound', {});
      }
      if (payment.status !== PlanPaymentStatus.Pending) {
        throw new ApiError('conflict', 'PlanPaymentNotPending', {});
      }
      if (now.getTime() - payment.quotedAt.getTime() > QUOTE_HOLD_MS) {
        throw new ApiError('conflict', 'QuoteExpired', {});
      }

      // LIF-15: a lapsed tenant's balance is frozen, which would otherwise block the very charge that pays
      // to restore it -- unfreeze first, so a locked/archived tenant can still buy a plan from balance.
      await this.balance.unfreeze(tx, tenantId);
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
   * D2-1: called by the operator payment-queue after `PlanPaymentsService.approve` marks a wallet payment
   * verified -- this is the half that's specific to a purchase/renewal (as opposed to a top-up): activating
   * the plan and issuing the invoice, in the same transaction as the approval.
   */
  async activate(
    tx: Transaction,
    payment: PlanPaymentRecord,
    now: Date,
    ip?: string | null,
  ): Promise<InvoiceRecord> {
    if (!payment.planId || !payment.billingTermId) {
      throw new Error('a purchase/renewal payment is missing its plan or billing term');
    }

    const plan = await this.plans.findById(payment.planId);
    const term = await this.terms.findById(payment.billingTermId);
    const info = await this.tenants.findBillingInfo(tx, payment.tenantId);
    if (!info) throw new Error('activate() called for a tenant with no billing info');
    // DWN-05: same "this is really a renewal" widening as `quote()` -- paying for the already-scheduled
    // downgrade target extends the current period instead of restarting it from today.
    const scheduled = await this.downgrade.getScheduled(payment.tenantId);
    const isOwnPlan = info.planId === payment.planId || scheduled?.targetPlanId === payment.planId;

    const isRunning =
      isOwnPlan &&
      (info.state === TenantState.Active || info.state === TenantState.Grace) &&
      info.periodEnd !== null &&
      info.periodEnd.getTime() > now.getTime();
    const periodStart = isRunning ? (info.periodEnd ?? now) : now; // BIL-10 extends; BIL-11 restarts
    const periodEnd = addMonths(periodStart, term.months);

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
    // LIF-15: a purchase/renewal at any time before deletion restores the tenant exactly as it was. An
    // operator's own suspension (LIF-24) is deliberately not cleared here -- that is an operator-only
    // action (`restore`), not something a tenant can buy its way out of. Known simplification: `frozen` is
    // one flag shared by both reasons (lifecycle lapse and operator suspension), so a purchase unfreezes it
    // even if an operator-imposed suspension is still logically in force; the dashboard itself stays blocked
    // regardless (DashboardGuard/TenantResolver check `suspendedAt` directly, not the frozen flag).
    await this.balance.unfreeze(tx, payment.tenantId);
    await this.downgrade.cancelIfScheduled(tx, payment.tenantId);
    // PLN-14: the add-ons the renewal carried run with the period it starts.
    const addons = await this.renewals.activate(tx, payment, {
      start: periodStart,
      end: periodEnd,
    });

    const invoice = await this.invoicing.issue(tx, {
      kind: payment.kind === PlanPaymentKind.Renewal ? InvoiceKind.Renewal : InvoiceKind.Purchase,
      payment,
      plan,
      term,
      fullPrice: fromPaisa(toPaisa(payment.amount) - addonsTotal(addons)),
      periodStart,
      periodEnd,
      shopName: info.shopName,
      addons,
    });

    await this.audit.record(tx, {
      tenantId: payment.tenantId,
      actorType: ActorType.User,
      actorId: null,
      action:
        payment.kind === PlanPaymentKind.Renewal
          ? AuditAction.PlanRenewed
          : AuditAction.PlanPurchased,
      ip: ip ?? null,
      targetType: 'plan_payment',
      targetId: payment.id,
      result: AuditResult.Success,
      summary: { planId: plan.id, amount: payment.amount, invoiceNumber: invoice.number },
    });

    return invoice;
  }

  /** BIL-01, TRM-04: a plan for sale on a term still offered, and its price there. */
  private async priced(
    planId: string,
    billingTermId: string,
  ): Promise<{ plan: PlanRecord; term: BillingTermRecord; price: string }> {
    const plan = await this.plans.findById(planId);
    if (!plan.forSale) throw new ApiError('not_found', 'PlanNotFound', {});
    const term = await this.terms.findById(billingTermId);
    // TRM-04: a retired term is no longer offered for a new purchase or renewal. `tryAutoRenew` already
    // treats this `ApiError` as an expected renewal failure and falls through to the normal lapse ladder --
    // it doesn't need its own exemption from this check.
    if (term.retiredAt) throw new ApiError('not_found', 'BillingTermNotFound', {});
    const price = await this.terms.findPrice(planId, billingTermId);
    if (price === null) throw new ApiError('not_found', 'PriceNotFound', {});
    return { plan, term, price };
  }

  /**
   * BIL-10: paying for the shop's own plan while it is active or in grace renews it. DWN-05: so does paying into the
   * plan already scheduled as its downgrade target -- the same subscription, onto the plan that was going to take
   * over at this period boundary anyway, just a little early.
   */
  private async isRenewal(
    tenantId: string,
    planId: string,
    info: BillingInfoRow | null,
  ): Promise<boolean> {
    const scheduled = await this.downgrade.getScheduled(tenantId);
    const isOwnPlan = info?.planId === planId || scheduled?.targetPlanId === planId;
    return isOwnPlan && (info?.state === TenantState.Active || info?.state === TenantState.Grace);
  }

  /** PLN-14: the add-ons of the period being renewed that renew onto this plan, for the term's months. */
  private async carriesFor(
    tenantId: string,
    plan: PlanRecord,
    term: BillingTermRecord,
    info: BillingInfoRow | null,
  ): Promise<AddonCarry[]> {
    if (!info?.periodEnd) return [];
    return this.renewals.renewals(
      tenantId,
      info.periodEnd,
      term.months,
      await this.renewals.planFor(tenantId, plan),
    );
  }
}
