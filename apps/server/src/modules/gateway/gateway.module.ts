import { Module } from '@nestjs/common';
import { apiOrigin } from '../../common/shop-address';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { DrizzleCredentialUseStore } from '../../database/adapters/gateway-credential-uses.adapter';
import { BalanceModule } from '../balance/balance.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PaymentReviewModule } from '../payment-review/payment-review.module';
import { PaymentSessionsModule } from '../payment-sessions/payment-sessions.module';
import { BkashGateway, type BkashUrls } from './services/bkash-gateway';
import { CredentialUses } from './services/credential-uses';
import { GatewayAccounts } from './services/gateway-accounts';
import { GatewayCheckouts } from './services/gateway-checkout';
import { GatewayReconcile } from './services/gateway-reconcile';
import { GatewayRegistry } from './services/gateway-registry';
import {
  BKASH_URLS,
  CREDENTIAL_USE_LOG,
  GATEWAY_CALLBACK_ORIGIN,
  GATEWAY_CLOCK,
  GATEWAY_FETCH,
} from './tokens';

// WAL-09 to WAL-13, WAL-19, VER-08 to VER-11 (Phase 5 Slice 5.7, read agreed 2026-11-03): a wallet's own checkout, as a plugin, and the
// credentials it runs on. It sits above the verifying (PaymentReviewModule), so the payment page's routes, the team's and
// the minute pass read it. bKash's production address is to be confirmed with bKash before going live.
@Module({
  imports: [
    BalanceModule,
    OrdersModule,
    PaymentMethodsModule,
    PaymentReviewModule,
    PaymentSessionsModule,
  ],
  providers: [
    {
      provide: BKASH_URLS,
      inject: [ENV],
      useFactory: (env: Env): BkashUrls => ({
        sandbox: env.BKASH_SANDBOX_URL,
        production: env.BKASH_PRODUCTION_URL,
      }),
    },
    { provide: GATEWAY_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) },
    { provide: CREDENTIAL_USE_LOG, useClass: DrizzleCredentialUseStore },
    { provide: GATEWAY_CLOCK, useValue: (): Date => new Date() },
    { provide: GATEWAY_CALLBACK_ORIGIN, inject: [ENV], useFactory: (env: Env) => apiOrigin(env) },
    BkashGateway,
    GatewayRegistry,
    GatewayAccounts,
    GatewayCheckouts,
    GatewayReconcile,
    CredentialUses,
  ],
  exports: [
    GatewayAccounts,
    GatewayCheckouts,
    GatewayReconcile,
    GatewayRegistry,
    CredentialUses,
    GATEWAY_CALLBACK_ORIGIN,
    GATEWAY_CLOCK,
  ],
})
export class GatewayModule {}
