import { Module } from '@nestjs/common';
import { DrizzlePaymentSessionStore } from '../../database/adapters/payment-sessions.adapter';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { payOrigin } from '../../common/shop-address';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PaymentSessionExpiry } from './services/payment-session-expiry';
import { PaymentSessionsEraser } from './services/payment-sessions-eraser';
import { PaymentSessions } from './services/payment-sessions';
import { PAYMENT_PAGE_ORIGIN, PAYMENT_SESSION_STORE } from './tokens';

// PAY-01 to PAY-08 (Phase 5 Slice 5.2): the payment page's sessions. It depends on the shop's payment methods (what
// the page offers), the stock hold's lifetime (one setting, INV-16) and orders (a checkout's unpaid order cancelled,
// D5-4); the public order and the page's routes, the minute pass and the day-60 deletion read it.
@Module({
  imports: [PaymentMethodsModule, InventoryModule, OrdersModule],
  providers: [
    { provide: PAYMENT_SESSION_STORE, useClass: DrizzlePaymentSessionStore },
    { provide: PAYMENT_PAGE_ORIGIN, inject: [ENV], useFactory: (env: Env) => payOrigin(env) },
    PaymentSessions,
    PaymentSessionExpiry,
    PaymentSessionsEraser,
  ],
  exports: [PaymentSessions, PaymentSessionExpiry, PaymentSessionsEraser],
})
export class PaymentSessionsModule {}
