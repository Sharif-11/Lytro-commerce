import { Inject, Injectable } from '@nestjs/common';
import {
  DeliveryZoneRepository,
  LocationRepository,
  TransactionRunner,
  type DeliveryZonePatch,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import {
  ZoneInUse,
  type DeliveryZoneStore,
  type LocationStore,
} from '../../modules/delivery/ports/delivery-stores';
import type {
  LocationList,
  ZoneAreaRecord,
  ZoneAreas,
  ZoneRecord,
} from '../../modules/delivery/types/delivery';
import { DatabaseService } from '../database.service';

// The unique indexes that keep an area in one zone of a shop (DLV-02), and the key a product's limit holds (DLV-07).
const AREA_INDEXES = [
  'delivery_zone_areas_zilla_idx',
  'delivery_zone_areas_city_idx',
  'delivery_zone_areas_location_idx',
];
const PRODUCT_ZONE_KEY = 'product_delivery_zones_zone_fk';

@Injectable()
export class DrizzleLocationStore implements LocationStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(LocationRepository) private readonly locations: LocationRepository,
  ) {}

  listAll(): Promise<LocationList> {
    return this.locations.listAll(this.database.handle.db);
  }
}

@Injectable()
export class DrizzleDeliveryZoneStore implements DeliveryZoneStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(DeliveryZoneRepository) private readonly zones: DeliveryZoneRepository,
  ) {}

  ensureDefaults(
    tx: Transaction,
    tenantId: string,
    defaults: { homeCityCode: string; homeCharge: string; fallbackCharge: string },
  ): Promise<void> {
    return this.zones.ensureDefaults(tx, tenantId, defaults);
  }

  lockZones(tx: Transaction, tenantId: string): Promise<void> {
    return this.zones.lockZones(tx, tenantId);
  }

  listZones(tx: Transaction, tenantId: string): Promise<ZoneRecord[]> {
    return this.zones.listZones(tx, tenantId);
  }

  listAreas(tx: Transaction, tenantId: string): Promise<ZoneAreaRecord[]> {
    return this.zones.listAreas(tx, tenantId);
  }

  findZone(tx: Transaction, tenantId: string, id: string): Promise<ZoneRecord | null> {
    return this.zones.findZone(tx, tenantId, id);
  }

  countZones(tx: Transaction, tenantId: string): Promise<number> {
    return this.zones.countZones(tx, tenantId);
  }

  insertZone(
    tx: Transaction,
    values: { tenantId: string; name: string; charge: string; noDelivery: boolean },
  ): Promise<ZoneRecord> {
    return this.zones.insertZone(tx, values);
  }

  updateZone(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: DeliveryZonePatch,
  ): Promise<ZoneRecord | null> {
    return this.zones.updateZone(tx, tenantId, id, patch);
  }

  async deleteZone(tx: Transaction, tenantId: string, id: string): Promise<void> {
    try {
      await this.zones.deleteZone(tx, tenantId, id);
    } catch (error) {
      if (this.transactions.isForeignKeyViolation(error, PRODUCT_ZONE_KEY)) throw new ZoneInUse();
      throw error;
    }
  }

  async replaceAreas(
    tx: Transaction,
    tenantId: string,
    zoneId: string,
    areas: ZoneAreas,
  ): Promise<void> {
    try {
      await this.zones.replaceAreas(tx, tenantId, zoneId, areas);
    } catch (error) {
      if (AREA_INDEXES.some((index) => this.transactions.isUniqueViolation(error, index))) {
        throw new UniqueViolation('area');
      }
      throw error;
    }
  }

  findAreas(tx: Transaction, tenantId: string, areas: ZoneAreas): Promise<ZoneAreaRecord[]> {
    return this.zones.findAreas(tx, tenantId, areas);
  }

  productsLimitedTo(
    tx: Transaction,
    tenantId: string,
    zoneId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.zones.productsLimitedTo(tx, tenantId, zoneId);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.zones.deleteAllForTenant(tx, tenantId);
  }
}
