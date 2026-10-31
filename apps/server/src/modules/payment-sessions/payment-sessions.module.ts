import { Module } from '@nestjs/common';
import { DrizzlePaymentSessionStore } from '../../database/adapters/payment-sessions.adapter';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { payOrigin } from '../../common/shop-address';
import { AuditModule } from '../audit/audit.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PaymentPageOversight } from './services/payment-page-oversight';
import { PaymentSessionExpiry } from './services/payment-session-expiry';
import { PaymentSessionsEraser } from './services/payment-sessions-eraser';
import { PaymentSessions } from './services/payment-sessions';
import { PAYMENT_PAGE_ORIGIN, PAYMENT_SESSION_STORE } from './tokens';

// PAY-01 to PAY-08, PAY-24, TVR-02, TVR-03 (Phase 5 Slice 5.2): the payment page's sessions, staff's payment links, and
// Lytro's watch over the pages. It depends on the shop's payment methods (what the page offers), the stock hold's
// lifetime (one setting, INV-16), orders (a checkout's unpaid order cancelled, D5-4) and the activity logs; the public
// order and the page's routes, the staff and operator routes, the minute pass and the day-60 deletion read it.
@Module({
  imports: [PaymentMethodsModule, InventoryModule, OrdersModule, CatalogueModule, AuditModule],
  providers: [
    { provide: PAYMENT_SESSION_STORE, useClass: DrizzlePaymentSessionStore },
    { provide: PAYMENT_PAGE_ORIGIN, inject: [ENV], useFactory: (env: Env) => payOrigin(env) },
    PaymentSessions,
    PaymentSessionExpiry,
    PaymentSessionsEraser,
    PaymentPageOversight,
  ],
  exports: [PaymentSessions, PaymentSessionExpiry, PaymentSessionsEraser, PaymentPageOversight],
})
export class PaymentSessionsModule {}
