import { Module } from '@nestjs/common';
import {
  DrizzleDeliveryZoneStore,
  DrizzleLocationStore,
} from '../../database/adapters/delivery.adapter';
import { BalanceModule } from '../balance/balance.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DeliveryZoneService } from './services/delivery-zone.service';
import { LocationService } from './services/location.service';
import { DELIVERY_ZONE_STORE, LOCATION_STORE } from './tokens';

// D3-7: the delivery module -- the canonical location list (CUS-08) and the shop's delivery zones (DLV). It depends on
// catalogue (the activity log, the catalogue version, and the products a zone limit names) and on balance (the shop's
// extra charge per kg, RAT-14, which the delivery settings show); neither depends back on it. Orders (Phase 4) will
// price by it.
@Module({
  imports: [BalanceModule, CatalogueModule],
  providers: [
    { provide: LOCATION_STORE, useClass: DrizzleLocationStore },
    { provide: DELIVERY_ZONE_STORE, useClass: DrizzleDeliveryZoneStore },
    LocationService,
    DeliveryZoneService,
  ],
  exports: [LocationService, DeliveryZoneService],
})
export class DeliveryModule {}
