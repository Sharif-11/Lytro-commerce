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

  /** ADM-06: each payment waiting, with the add-ons it pays for, so the operator sees what the money is for. */
  async listPending(kind?: PlanPaymentKind): Promise<QueuedPayment[]> {
    const pending = await this.payments.listPending(kind);
    const addons = await this.renewals.forPayments(pending.map((payment) => payment.id));
    return pending.map((payment) => ({ ...payment, addons: addons.get(payment.id) ?? [] }));
  }

  async approve(
    paymentId: string,
    operatorId: string,
    ip?: string | null,
  ): Promise<PlanPaymentRecord> {
    const now = this.clock();
    return this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.approve(tx, paymentId, operatorId, now);

      if (payment.kind === PlanPaymentKind.TopUp) {
        await this.balance.credit(tx, {
          tenantId: payment.tenantId,
          type: LedgerEntryType.TopUp,
          amount: payment.amount,
          reference: { planPaymentId: payment.id },
        });
        await this.audit.record(tx, {
          tenantId: payment.tenantId,
          actorType: ActorType.User,
          actorId: null,
          action: AuditAction.BalanceToppedUp,
          ip: ip ?? null,
          targetType: 'plan_payment',
          targetId: payment.id,
          result: AuditResult.Success,
          summary: { amount: payment.amount },
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
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlanPaymentVerified,
        targetType: 'plan_payment',
        targetId: payment.id,
        result: AuditResult.Success,
        ip: ip ?? null,
        summary: { kind: payment.kind, amount: payment.amount, tenantId: payment.tenantId },
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
      const payment = await this.payments.reject(tx, paymentId, operatorId, now);
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
