import { Inject, Injectable } from '@nestjs/common';
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
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { addMonths, HOUR_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import { BillingTermsService } from './billing-terms.service';
import { PlansService } from './plans.service';

// BIL-09: a quote's price is held for 30 minutes.
const QUOTE_HOLD_MS = HOUR_MS / 2;

export type ConfirmPurchaseInput =
  | { method: 'balance' }
  | { method: 'wallet'; transactionId: string; senderNumber: string; amountPaid: string };

export interface ConfirmPurchaseResult {
  payment: PlanPaymentRecord;
  invoice: InvoiceRecord | null;
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
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /** BIL-01: the price and saving shown to the tenant; held for 30 minutes (BIL-09). */
  async quote(tenantId: string, planId: string, billingTermId: string): Promise<PlanPaymentRecord> {
    const plan = await this.plans.findById(planId);
    if (!plan.forSale) throw new ApiError('not_found', 'PlanNotFound', {});
    await this.terms.findById(billingTermId);
    const price = await this.terms.findPrice(planId, billingTermId);
    if (price === null) throw new ApiError('not_found', 'PriceNotFound', {});

    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    const isRenewal =
      info?.planId === planId &&
      (info.state === TenantState.Active || info.state === TenantState.Grace);

    return this.payments.quoteStandalone({
      tenantId,
      kind: isRenewal ? PlanPaymentKind.Renewal : PlanPaymentKind.Purchase,
      planId,
      billingTermId,
      amount: price,
      creditAmount: '0',
    });
  }

  /** BIL-02/16: the tenant's "I have paid" wallet submission -- enters the queue, nothing activates yet. */
  submitWalletPayment(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
  ): Promise<PlanPaymentRecord> {
    return this.payments.submitWalletPayment(paymentId, tenantId, input);
  }

  /** BIL-08: pay from balance -- atomic, instant, no transaction ID, no operator. */
  async confirmFromBalance(paymentId: string, tenantId: string): Promise<ConfirmPurchaseResult> {
    const now = this.clock();
    return this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.findForUpdate(tx, paymentId);
      if (!payment || payment.tenantId !== tenantId) {
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
      const invoice = await this.activate(tx, payment, now);
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
  async activate(tx: Transaction, payment: PlanPaymentRecord, now: Date): Promise<InvoiceRecord> {
    if (!payment.planId || !payment.billingTermId) {
      throw new Error('a purchase/renewal payment is missing its plan or billing term');
    }

    const plan = await this.plans.findById(payment.planId);
    const term = await this.terms.findById(payment.billingTermId);
    const info = await this.tenants.findBillingInfo(tx, payment.tenantId);

    const isRunning =
      info?.planId === payment.planId &&
      (info.state === TenantState.Active || info.state === TenantState.Grace) &&
      info.periodEnd !== null &&
      info.periodEnd.getTime() > now.getTime();
    const periodStart = isRunning ? (info.periodEnd ?? now) : now; // BIL-10 extends; BIL-11 restarts
    const periodEnd = addMonths(periodStart, term.months);

    await this.tenants.applyPlanAssignment(tx, payment.tenantId, {
      planId: plan.id,
      planSnapshot: plan.limits,
      periodStart,
      periodEnd,
      state: TenantState.Active,
    });

    const invoice = await this.invoices.issue(tx, {
      tenantId: payment.tenantId,
      kind: payment.kind === PlanPaymentKind.Renewal ? InvoiceKind.Renewal : InvoiceKind.Purchase,
      planSnapshot: plan.limits,
      amount: payment.amount,
      creditAmount: payment.creditAmount,
      billingTermLabel: term.labelEn,
    });

    await this.audit.record(tx, {
      tenantId: payment.tenantId,
      actorType: ActorType.User,
      actorId: null,
      action:
        payment.kind === PlanPaymentKind.Renewal
          ? AuditAction.PlanRenewed
          : AuditAction.PlanPurchased,
      targetType: 'plan_payment',
      targetId: payment.id,
      result: AuditResult.Success,
      summary: { planId: plan.id, amount: payment.amount, invoiceNumber: invoice.number },
    });

    return invoice;
  }
}
