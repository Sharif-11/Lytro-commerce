import { Module } from '@nestjs/common';
import { DrizzlePaymentMethodTypeStore } from '../../database/adapters/payment-method-types.adapter';
import { PaymentMethodTypes } from './services/payment-method-types';
import { PAYMENT_METHOD_TYPE_STORE } from './tokens';

// WAL-18 (Phase 8 Slice 8.7): each payment method type's state. A leaf, so the shop's payment methods, Lytro's own and the
// operator's retiring (PaymentMethodRetiringModule, which sits above them all) can each import it with no cycle.
@Module({
  providers: [
    { provide: PAYMENT_METHOD_TYPE_STORE, useClass: DrizzlePaymentMethodTypeStore },
    PaymentMethodTypes,
  ],
  exports: [PaymentMethodTypes],
})
export class PaymentMethodTypesModule {}
