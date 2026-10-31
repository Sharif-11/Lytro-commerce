import { Module } from '@nestjs/common';
import { DrizzlePaymentMethodStore } from '../../database/adapters/payment-methods.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { PaymentMethodsEraser } from './services/payment-methods-eraser';
import { PaymentMethods } from './services/payment-methods';
import { PAYMENT_METHOD_STORE } from './tokens';

// WAL-01 to WAL-18 (Phase 5 Slice 5.1): the accounts a shop takes money into. It depends on the catalogue only for the
// activity log, as the brand does; the dashboard's and the public routes, and the day-60 deletion, read it. Payment
// sessions (Slice 5.2) will read the active accounts from here.
@Module({
  imports: [CatalogueModule],
  providers: [
    { provide: PAYMENT_METHOD_STORE, useClass: DrizzlePaymentMethodStore },
    PaymentMethods,
    PaymentMethodsEraser,
  ],
  exports: [PaymentMethods, PaymentMethodsEraser],
})
export class PaymentMethodsModule {}
