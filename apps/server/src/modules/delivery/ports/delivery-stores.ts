import type { DeliveryZonePatch, Transaction } from '@lytronix/db';
import type { LocationList, ZoneAreaRecord, ZoneAreas, ZoneRecord } from '../types/delivery';

/** CUS-08: the platform's canonical zilla and thana list. */
export interface LocationStore {
  listAll(): Promise<LocationList>;
}

/**
 * DLV-01, DLV-02, DLV-07: a shop's delivery zones. An area another zone holds comes back as UniqueViolation('area');
 * deleting a zone a product names comes back as ZoneInUse.
 */
export interface DeliveryZoneStore {
  ensureDefaults(
    tx: Transaction,
    tenantId: string,
    defaults: { homeCityCode: string; homeCharge: string; fallbackCharge: string },
  ): Promise<void>;
  lockZones(tx: Transaction, tenantId: string): Promise<void>;
  listZones(tx: Transaction, tenantId: string): Promise<ZoneRecord[]>;
  listAreas(tx: Transaction, tenantId: string): Promise<ZoneAreaRecord[]>;
  findZone(tx: Transaction, tenantId: string, id: string): Promise<ZoneRecord | null>;
  countZones(tx: Transaction, tenantId: string): Promise<number>;
  insertZone(
    tx: Transaction,
    values: { tenantId: string; name: string; charge: string; noDelivery: boolean },
  ): Promise<ZoneRecord>;
  updateZone(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: DeliveryZonePatch,
  ): Promise<ZoneRecord | null>;
  deleteZone(tx: Transaction, tenantId: string, id: string): Promise<void>;
  replaceAreas(tx: Transaction, tenantId: string, zoneId: string, areas: ZoneAreas): Promise<void>;
  findAreas(tx: Transaction, tenantId: string, areas: ZoneAreas): Promise<ZoneAreaRecord[]>;
  productsLimitedTo(
    tx: Transaction,
    tenantId: string,
    zoneId: string,
  ): Promise<{ id: string; name: string }[]>;
}

/** DLV-07: a zone a product still names was deleted underneath the check that looked for one. */
export class ZoneInUse extends Error {
  constructor() {
    super('a product still limits its delivery to this zone');
  }
}
