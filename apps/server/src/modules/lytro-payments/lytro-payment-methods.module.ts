import { Module } from '@nestjs/common';
import { DrizzleLytroPaymentMethodStore } from '../../database/adapters/lytro-payment-methods.adapter';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { GatewayModule } from '../gateway/gateway.module';
import { PaymentMethodTypesModule } from '../payment-method-types/payment-method-types.module';
import { LytroPaymentMethods } from './services/lytro-payment-methods';
import { LYTRO_PAYMENT_METHOD_STORE } from './tokens';

// OPERATOR-CONSOLE-DESIGN §10: what shops may pay Lytro by. Apart from the page's module, since Lytro's receipts need to read a method's way
// and the page needs those receipts.
@Module({
  imports: [AuditModule, BalanceModule, GatewayModule, PaymentMethodTypesModule],
  providers: [
    { provide: LYTRO_PAYMENT_METHOD_STORE, useClass: DrizzleLytroPaymentMethodStore },
    LytroPaymentMethods,
  ],
  exports: [LytroPaymentMethods],
})
export class LytroPaymentMethodsModule {}
