import { Module } from '@nestjs/common';
import { setTimeout as wait } from 'node:timers/promises';
import { apiOrigin } from '../../common/shop-address';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { DrizzleCourierStore } from '../../database/adapters/couriers.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrdersModule } from '../orders/orders.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CourierMessagesController } from './controllers/courier-messages.controller';
import { ConsoleCourierNotifier } from './services/console-courier-notifier';
import { CourierBooking } from './services/courier-booking';
import { CourierBookingPass } from './services/courier-booking-pass';
import { CourierCalls } from './services/courier-calls';
import { CourierChecks } from './services/courier-checks';
import { CourierConnections } from './services/courier-connections';
import { CourierMessages } from './services/courier-messages';
import { CourierNewsPath } from './services/courier-news-path';
import { CourierRegistry } from './services/courier-registry';
import { PathaoAdapter } from './services/pathao-adapter';
import { SteadfastAdapter } from './services/steadfast-adapter';
import {
  COURIER_CLOCK,
  COURIER_FETCH,
  COURIER_MESSAGE_ORIGIN,
  COURIER_NOTIFIER,
  COURIER_PAUSE,
  COURIER_STORE,
  PATHAO_TEST_ANSWER,
  PATHAO_URL,
  STEADFAST_URL,
} from './tokens';

// CRR-01 to CRR-30 (Phase 6, Slice 6.1 first): couriers as plugins, a shop's connections to them, and booking an order. It sits above
// orders, which know a parcel only as data, so the team's routes and the minute pass read it and none of them depends back on it.
@Module({
  imports: [CatalogueModule, DeliveryModule, OrdersModule, PlatformSettingsModule, TenancyModule],
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
    SteadfastAdapter,
    PathaoAdapter,
    CourierRegistry,
    CourierCalls,
    CourierMessages,
    CourierConnections,
    CourierBooking,
    CourierNewsPath,
    CourierChecks,
    CourierBookingPass,
  ],
  exports: [
    CourierConnections,
    CourierMessages,
    CourierBooking,
    CourierBookingPass,
    CourierChecks,
    COURIER_NOTIFIER,
  ],
})
export class CouriersModule {}
