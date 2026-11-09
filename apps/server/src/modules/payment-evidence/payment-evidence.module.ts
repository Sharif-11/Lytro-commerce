import { Module } from '@nestjs/common';
import { DrizzlePaymentEvidenceStore } from '../../database/adapters/manual-entries.adapter';
import { MediaModule } from '../media/media.module';
import { PaymentEvidence } from './services/payment-evidence';
import { PAYMENT_EVIDENCE_CLOCK, PAYMENT_EVIDENCE_STORE } from './tokens';

// ADM-14, ADM-17, D8-47 (Phase 8 Slice 8.5): payment screenshots, kept privately.
@Module({
  imports: [MediaModule],
  providers: [
    PaymentEvidence,
    { provide: PAYMENT_EVIDENCE_STORE, useClass: DrizzlePaymentEvidenceStore },
    { provide: PAYMENT_EVIDENCE_CLOCK, useValue: () => new Date() },
  ],
  exports: [PaymentEvidence],
})
export class PaymentEvidenceModule {}
