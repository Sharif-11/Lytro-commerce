import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GatewayModule } from '../gateway/gateway.module';
import { HelpLineModule } from '../help-line/help-line.module';
import { ListenerModule } from '../listener/listener.module';
import { LytroReceiptsModule } from '../lytro-receipts/lytro-receipts.module';
import { PaymentSessionsModule } from '../payment-sessions/payment-sessions.module';
import { PaymentsModule } from '../payments/payments.module';
import { MailModule } from '../shared/mail/mail.module';
import { LytroPaymentMethodsModule } from './lytro-payment-methods.module';
import { LytroCheckouts } from './services/lytro-checkouts';
import { LytroPaymentPages } from './services/lytro-payment-pages';

// PAYMENT-PAGE-DESIGN §8, PAY-21: shops paying Lytro on the payment page, and through Lytro's own bKash checkout.
@Module({
  imports: [
    BillingModule,
    GatewayModule,
    HelpLineModule,
    ListenerModule,
    LytroPaymentMethodsModule,
    LytroReceiptsModule,
    MailModule,
    PaymentSessionsModule,
    PaymentsModule,
  ],
  providers: [LytroPaymentPages, LytroCheckouts],
  exports: [LytroPaymentMethodsModule, LytroPaymentPages, LytroCheckouts],
})
export class LytroPaymentsModule {}
