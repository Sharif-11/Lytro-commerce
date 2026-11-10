import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  LedgerEntryType,
  PlanPaymentKind,
  PlatformActorType,
  PlatformAuditAction,
} from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import type { QueuedPayment } from '../types/addon';
import { AddonPurchaseService } from './addon-purchase.service';
import { AddonRenewalService } from './addon-renewal.service';
import { PurchaseService } from './purchase.service';
import { UpgradeService } from './upgrade.service';

/**
 * D2-1/ADM-06: the operator's one queue for every pending plan_payments row. Approving a top-up credits the
 * balance; approving a purchase/renewal/upgrade activates the plan via `PurchaseService.activate`, and an add-on via
 * `AddonPurchaseService.activate` (PLN-14) -- each in the same transaction as `PlanPaymentsService.approve`'s
 * state-machine change and transaction-ID registration, so a rejected/failed activation never leaves a
 * verified-but-not-applied payment behind.
 */
@Injectable()
export class PaymentQueueService {
  constructor(
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(UpgradeService) private readonly upgrade: UpgradeService,
    @Inject(AddonPurchaseService) private readonly addons: AddonPurchaseService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * ADM-06: each payment waiting, with the add-ons it pays for, so the operator sees what the money is for; one shop's
   * alone for its page (ADM-03).
   */
  async listPending(kind?: PlanPaymentKind, tenantId?: string): Promise<QueuedPayment[]> {
    const pending = await this.payments.listPending(kind, tenantId);
    const addons = await this.renewals.forPayments(pending.map((payment) => payment.id));
    return pending.map((payment) => ({ ...payment, addons: addons.get(payment.id) ?? [] }));
  }

  /**
   * ADM-06, BIL-06: the operator approves a payment, saying what arrived when it is not what a receipt says or what was
   * quoted. What the seller typed is never credited on its own say-so (agreed 2026-11-03).
   */
  approve(
    paymentId: string,
    operatorId: string,
    ip?: string | null,
    amountArrived?: string,
  ): Promise<PlanPaymentRecord> {
    const now = this.clock();
    return this.tenants.runStandalone((tx) =>
      this.verifyWithin(tx, paymentId, operatorId, now, ip ?? null, amountArrived),
    );
  }

  /**
   * BIL-05, PAY-21 (Slice 5.6): a payment verified in the caller's transaction, by the operator or (null) by Lytro's own
   * phone: the plan activated or the balance credited -- a top-up with what arrived, once anyone says, else what was
   * quoted (BAL-03, agreed 2026-11-03). No fee: it is Lytro's own money (WAL-20).
   */
  async verifyWithin(
    tx: Transaction,
    paymentId: string,
    operatorId: string | null,
    now: Date,
    ip: string | null,
    amountArrived?: string,
    reusingTransactionId = false,
  ): Promise<PlanPaymentRecord> {
    const payment = await this.payments.approve(
      tx,
      paymentId,
      operatorId,
      now,
      amountArrived,
      reusingTransactionId,
    );

    if (payment.kind === PlanPaymentKind.TopUp) {
      const credited = payment.amountArrived ?? payment.amount;
      await this.balance.credit(tx, {
        tenantId: payment.tenantId,
        type: LedgerEntryType.TopUp,
        amount: credited,
        reference: { planPaymentId: payment.id },
      });
      await this.audit.record(tx, {
        tenantId: payment.tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.BalanceToppedUp,
        ip,
        targetType: 'plan_payment',
        targetId: payment.id,
        result: AuditResult.Success,
        summary: { amount: credited },
      });
    } else if (payment.kind === PlanPaymentKind.Upgrade) {
      await this.upgrade.activate(tx, payment, now, ip);
    } else if (
      payment.kind === PlanPaymentKind.Purchase ||
      payment.kind === PlanPaymentKind.Renewal
    ) {
      await this.purchase.activate(tx, payment, now, ip);
    } else {
      // PLN-14: the last kind, an add-on's own payment.
      await this.addons.activate(tx, payment, now, ip);
    }

    await this.platformAudit.recordWithin(tx, {
      actorType: operatorId === null ? PlatformActorType.System : PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.PlanPaymentVerified,
      targetType: 'plan_payment',
      targetId: payment.id,
      result: AuditResult.Success,
      ip,
      summary: { kind: payment.kind, amount: payment.amount, tenantId: payment.tenantId },
    });

    return payment;
  }

  /**
   * BIL-06 (Slice 5.6, agreed 2026-11-03): money for a plan, upgrade or add-on at the wrong amount, put on the seller's balance
   * instead of activating it: what the operator says arrived, else what a receipt says. The add-ons it carried are cancelled.
   */
  creditInstead(
    paymentId: string,
    operatorId: string,
    ip: string | null,
    amount?: string,
  ): Promise<PlanPaymentRecord> {
    const now = this.clock();
    return this.tenants.runStandalone(async (tx) => {
      const held = await this.payments.findForUpdate(tx, paymentId);
      if (!held) throw new ApiError('not_found', 'PlanPaymentNotFound', {});
      const arrived = amount ?? held.amountArrived;
      if (arrived === null) throw new ApiError('validation_error', 'PaymentAmountNeeded', {});
      const payment = await this.payments.creditInsteadWithin(
        tx,
        paymentId,
        operatorId,
        arrived,
        now,
      );
      await this.renewals.cancelFor(tx, payment.id);
      await this.balance.credit(tx, {
        tenantId: payment.tenantId,
        type: LedgerEntryType.TopUp,
        amount: arrived,
        reference: { planPaymentId: payment.id },
      });
      await this.audit.record(tx, {
        tenantId: payment.tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null,
        action: AuditAction.BalanceToppedUp,
        ip,
        targetType: 'plan_payment',
        targetId: payment.id,
        result: AuditResult.Success,
        summary: { amount: arrived, was: held.kind },
      });
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlanPaymentCredited,
        targetType: 'plan_payment',
        targetId: payment.id,
        result: AuditResult.Success,
        ip,
        summary: {
          was: held.kind,
          quoted: held.amount,
          amount: arrived,
          tenantId: payment.tenantId,
        },
      });
      return payment;
    });
  }

  async reject(
    paymentId: string,
    operatorId: string,
    note: string,
    ip?: string | null,
  ): Promise<PlanPaymentRecord> {
    const now = this.clock();
    return this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.reject(tx, paymentId, operatorId, now, note);
      // PLN-14: a payment turned down activates nothing; the add-ons it carried are cancelled with it.
      await this.renewals.cancelFor(tx, payment.id);
      // AUD-08, ADM-04: the shop learns its payment was turned down, and why, as "Platform support".
      await this.audit.record(tx, {
        tenantId: payment.tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null,
        action: AuditAction.PlanPaymentRejected,
        ip: ip ?? null,
        targetType: 'plan_payment',
        targetId: payment.id,
        result: AuditResult.Success,
        summary: { kind: payment.kind, amount: payment.amount, note },
      });
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlanPaymentRejected,
        targetType: 'plan_payment',
        targetId: payment.id,
        result: AuditResult.Success,
        ip: ip ?? null,
        summary: { kind: payment.kind, tenantId: payment.tenantId, note },
      });
      return payment;
    });
  }
}
