import { Module } from '@nestjs/common';
import {
  DrizzleDeliveryZoneStore,
  DrizzleLocationStore,
} from '../../database/adapters/delivery.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DeliveryZoneService } from './services/delivery-zone.service';
import { LocationService } from './services/location.service';
import { DELIVERY_ZONE_STORE, LOCATION_STORE } from './tokens';

// D3-7: the delivery module -- the canonical location list (CUS-08) and the shop's delivery zones (DLV). It depends on
// catalogue (the activity log, the catalogue version, and the products a zone limit names); nothing in catalogue
// depends back on it. Orders (Phase 4) will price by it.
@Module({
  imports: [CatalogueModule],
  providers: [
    { provide: LOCATION_STORE, useClass: DrizzleLocationStore },
    { provide: DELIVERY_ZONE_STORE, useClass: DrizzleDeliveryZoneStore },
    LocationService,
    DeliveryZoneService,
  ],
  exports: [LocationService, DeliveryZoneService],
})
export class DeliveryModule {}
