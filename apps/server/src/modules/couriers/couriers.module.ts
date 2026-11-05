import { Module } from '@nestjs/common';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { DrizzleCourierStore } from '../../database/adapters/couriers.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrdersModule } from '../orders/orders.module';
import { CourierBooking } from './services/courier-booking';
import { CourierBookingPass } from './services/courier-booking-pass';
import { CourierCalls } from './services/courier-calls';
import { CourierConnections } from './services/courier-connections';
import { CourierRegistry } from './services/courier-registry';
import { SteadfastAdapter } from './services/steadfast-adapter';
import { COURIER_CLOCK, COURIER_FETCH, COURIER_STORE, STEADFAST_URL } from './tokens';

// CRR-01 to CRR-30 (Phase 6, Slice 6.1 first): couriers as plugins, a shop's connections to them, and booking an order. It sits above
// orders, which know a parcel only as data, so the team's routes and the minute pass read it and none of them depends back on it.
@Module({
  imports: [CatalogueModule, DeliveryModule, OrdersModule],
  providers: [
    { provide: COURIER_STORE, useClass: DrizzleCourierStore },
    { provide: COURIER_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) },
    { provide: COURIER_CLOCK, useValue: (): Date => new Date() },
    { provide: STEADFAST_URL, inject: [ENV], useFactory: (env: Env) => env.STEADFAST_API_URL },
    SteadfastAdapter,
    CourierRegistry,
    CourierCalls,
    CourierConnections,
    CourierBooking,
    CourierBookingPass,
  ],
  exports: [CourierConnections, CourierBooking, CourierBookingPass],
})
export class CouriersModule {}
