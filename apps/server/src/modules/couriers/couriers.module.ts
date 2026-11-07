import { Module } from '@nestjs/common';
import { setTimeout as wait } from 'node:timers/promises';
import { apiOrigin } from '../../common/shop-address';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { DrizzleCourierAdapterStore } from '../../database/adapters/courier-adapters.adapter';
import { DrizzleCourierAreaStore } from '../../database/adapters/courier-areas.adapter';
import { DrizzleCourierStore } from '../../database/adapters/couriers.adapter';
import { AuditModule } from '../audit/audit.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrdersModule } from '../orders/orders.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CourierMessagesController } from './controllers/courier-messages.controller';
import { ConsoleCourierNotifier } from './services/console-courier-notifier';
import { CourierAreaList } from './services/courier-area-list';
import { CourierBooking } from './services/courier-booking';
import { CourierBookingPass } from './services/courier-booking-pass';
import { CourierCalls } from './services/courier-calls';
import { CourierChecks } from './services/courier-checks';
import { CourierFraudScores } from './services/courier-fraud-scores';
import { CourierPayouts } from './services/courier-payouts';
import { CourierRetiring } from './services/courier-retiring';
import { CourierConnections } from './services/courier-connections';
import { CourierMessages } from './services/courier-messages';
import { CourierNewsPath } from './services/courier-news-path';
import { CourierRegistry } from './services/courier-registry';
import { PathaoAdapter } from './services/pathao-adapter';
import { RedxAdapter } from './services/redx-adapter';
import { SteadfastAdapter } from './services/steadfast-adapter';
import {
  COURIER_AREA_STORE,
  COURIER_ADAPTER_STORE,
  COURIER_AREA_TOKENS,
  COURIER_CLOCK,
  COURIER_FETCH,
  COURIER_MESSAGE_ORIGIN,
  COURIER_NOTIFIER,
  COURIER_PAUSE,
  COURIER_STORE,
  PATHAO_TEST_ANSWER,
  PATHAO_URL,
  REDX_URL,
  STEADFAST_URL,
} from './tokens';

// CRR-01 to CRR-30 (Phase 6, Slice 6.1 first): couriers as plugins, a shop's connections to them, and booking an order. It sits above
// orders, which know a parcel only as data, so the team's routes and the minute pass read it and none of them depends back on it.
@Module({
  imports: [
    AuditModule,
    CatalogueModule,
    DeliveryModule,
    OrdersModule,
    PlatformSettingsModule,
    TenancyModule,
  ],
  controllers: [CourierMessagesController],
  providers: [
    { provide: COURIER_NOTIFIER, useClass: ConsoleCourierNotifier },
    { provide: COURIER_MESSAGE_ORIGIN, inject: [ENV], useFactory: (env: Env) => apiOrigin(env) },
    { provide: COURIER_PAUSE, useValue: (ms: number) => wait(ms).then(() => undefined) },
    { provide: COURIER_STORE, useClass: DrizzleCourierStore },
    { provide: COURIER_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) },
    { provide: COURIER_CLOCK, useValue: (): Date => new Date() },
    { provide: STEADFAST_URL, inject: [ENV], useFactory: (env: Env) => env.STEADFAST_API_URL },
    { provide: PATHAO_URL, inject: [ENV], useFactory: (env: Env) => env.PATHAO_API_URL },
    {
      provide: PATHAO_TEST_ANSWER,
      inject: [ENV],
      useFactory: (env: Env) => env.PATHAO_WEBHOOK_INTEGRATION_SECRET ?? null,
    },
    { provide: REDX_URL, inject: [ENV], useFactory: (env: Env) => env.REDX_API_URL },
    { provide: COURIER_AREA_STORE, useClass: DrizzleCourierAreaStore },
    { provide: COURIER_ADAPTER_STORE, useClass: DrizzleCourierAdapterStore },
    {
      provide: COURIER_AREA_TOKENS,
      inject: [ENV],
      useFactory: (env: Env) => (env.REDX_AREAS_TOKEN ? { redx: env.REDX_AREAS_TOKEN } : {}),
    },
    SteadfastAdapter,
    PathaoAdapter,
    RedxAdapter,
    CourierRegistry,
    CourierAreaList,
    CourierCalls,
    CourierMessages,
    CourierConnections,
    CourierBooking,
    CourierNewsPath,
    CourierChecks,
    CourierPayouts,
    CourierFraudScores,
    CourierRetiring,
    CourierBookingPass,
  ],
  exports: [
    CourierAreaList,
    CourierConnections,
    CourierMessages,
    CourierBooking,
    CourierBookingPass,
    CourierChecks,
    CourierPayouts,
    CourierFraudScores,
    CourierRetiring,
    COURIER_NOTIFIER,
  ],
})
export class CouriersModule {}
