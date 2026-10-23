import { Inject, Injectable } from '@nestjs/common';
import { ActorType, AuditAction, AuditResult, type PlanPaymentKind } from '@lytronix/validators';
import { AuditService } from '../../audit/services/audit.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';
import { AddonRenewalService } from './addon-renewal.service';

/**
 * BIL-19 (decided 2026-10-23, the design's open question 6): the shop cancels a payment request it has sent nothing
 * for, instead of waiting for it to lapse at 24 hours (BIL-15). The add-ons it carried are released at once, and the
 * shop's activity log says who closed it.
 */
@Injectable()
export class PaymentCancellationService {
  constructor(
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /** `kinds` are the payments the caller's route may close: a plan's, an upgrade's and an add-on's, or a top-up. */
  cancel(
    tenantId: string,
    paymentId: string,
    kinds: readonly PlanPaymentKind[],
    ip?: string | null,
  ): Promise<PlanPaymentRecord> {
    const now = this.clock();
    return this.tenants.runStandalone(async (tx) => {
      const payment = await this.payments.cancel(tx, tenantId, paymentId, kinds, now);
      await this.renewals.cancelFor(tx, payment.id);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.User,
        actorId: null,
        action: AuditAction.PlanPaymentCancelled,
        ip: ip ?? null,
        targetType: 'plan_payment',
        targetId: payment.id,
        result: AuditResult.Success,
        summary: { kind: payment.kind, amount: payment.amount },
      });
      return payment;
    });
  }
}
