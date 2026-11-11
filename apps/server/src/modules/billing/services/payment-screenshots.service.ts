import { Inject, Injectable } from '@nestjs/common';
import type { PlanPaymentKind } from '@lytronix/validators';
import { PaymentEvidence } from '../../payment-evidence/services/payment-evidence';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';

/**
 * ADM-17, D8-15 (Phase 8 Slice 8.8): a screenshot for a payment the seller already sent on the payment page, while Lytro
 * is still checking it. Since #337 the page takes the transaction ID and no screenshot, so Billing offers one after.
 * Optional, one a payment, kept once sent and seen only by Lytro (D8-47).
 */
@Injectable()
export class PaymentScreenshotsService {
  constructor(
    @Inject(PaymentEvidence) private readonly evidence: PaymentEvidence,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
  ) {}

  /** `kinds` are the payments the caller's route may name: a plan's, an upgrade's and an add-on's, or a top-up. */
  async attach(
    tenantId: string,
    paymentId: string,
    kinds: readonly PlanPaymentKind[],
    evidenceKey: string,
  ): Promise<{ evidenceSentAt: Date }> {
    const evidenceSentAt = await this.evidence.withKept(
      { tenantId, uploader: 'seller' },
      evidenceKey,
      (evidenceId) => {
        // A key always keeps a file or is refused, so there is always one here.
        if (evidenceId === null) throw new Error('a screenshot key kept no file');
        return this.payments.run((tx) =>
          this.payments.attachEvidence(tx, tenantId, paymentId, kinds, evidenceId),
        );
      },
    );
    return { evidenceSentAt };
  }
}
