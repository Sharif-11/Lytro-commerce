import { Module } from '@nestjs/common';
import { DrizzleLytroReceiptStore } from '../../database/adapters/lytro-receipts.adapter';
import { BillingModule } from '../billing/billing.module';
import { LytroPaymentMethodsModule } from '../lytro-payments/lytro-payment-methods.module';
import { PaymentsModule } from '../payments/payments.module';
import { LytroReceipts } from './services/lytro-receipts';
import { LYTRO_RECEIPT_STORE } from './tokens';

// PAY-21, D5-3 (Phase 5 Slice 5.6, read agreed 2026-11-03): sellers' money read by Lytro's own listener phone. It sits above the
// queue's verifying (billing); the phones' uploads, the team's and operator's routes and the daily pass read it.
@Module({
  imports: [BillingModule, LytroPaymentMethodsModule, PaymentsModule],
  providers: [{ provide: LYTRO_RECEIPT_STORE, useClass: DrizzleLytroReceiptStore }, LytroReceipts],
  exports: [LytroReceipts],
})
export class LytroReceiptsModule {}
