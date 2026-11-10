import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LytroPaymentMethodsModule } from '../lytro-payments/lytro-payment-methods.module';
import { BellPaymentMethodNotifier } from '../notifications/notifiers/bell-notifiers';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PaymentMethodTypesModule } from './payment-method-types.module';
import { PaymentMethodRetiring } from './services/payment-method-retiring';
import { PAYMENT_METHOD_NOTIFIER, PAYMENT_METHOD_TYPES_CLOCK } from './tokens';

// WAL-18 (Phase 8 Slice 8.7): the operator retiring a payment method type. Above the shop's payment methods and Lytro's own,
// which both read the type's state from the leaf PaymentMethodTypesModule, so nothing below depends back on it.
@Module({
  imports: [
    AuditModule,
    LytroPaymentMethodsModule,
    NotificationsModule,
    PaymentMethodsModule,
    PaymentMethodTypesModule,
  ],
  providers: [
    { provide: PAYMENT_METHOD_NOTIFIER, useExisting: BellPaymentMethodNotifier },
    { provide: PAYMENT_METHOD_TYPES_CLOCK, useValue: (): Date => new Date() },
    PaymentMethodRetiring,
  ],
  exports: [PaymentMethodRetiring],
})
export class PaymentMethodRetiringModule {}
