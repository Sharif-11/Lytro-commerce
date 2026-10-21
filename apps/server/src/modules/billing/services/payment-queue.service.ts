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
import { PurchaseService } from './purchase.service';
import { UpgradeService } from './upgrade.service';

/**
 * D2-1/ADM-06: the operator's one queue for every pending plan_payments row. Approving a top-up credits the
 * balance; approving a purchase/renewal/upgrade activates the plan via `PurchaseService.activate` -- both in
 * the same transaction as `PlanPaymentsService.approve`'s state-machine change and transaction-ID
 * registration, so a rejected/failed activation never leaves a verified-but-not-applied payment behind.
 */
@Injectable()
export class PaymentQueueService {
  constructor(
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(UpgradeService) private readonly upgrade: UpgradeService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  listPending(kind?: PlanPaymentKind): Promise<PlanPaymentRecord[]> {
    return this.payments.listPending(kind);
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
        // PLN-14: an add-on is paid from the balance only until Slice 10a.2; no wallet payment can be for one yet.
        throw new Error(`a ${payment.kind} payment cannot be approved from the queue`);
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
