import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  DEFAULT_FALLBACK_ZONE_CHARGE,
  DEFAULT_HOME_CITY,
  DEFAULT_HOME_ZONE_CHARGE,
  FieldProblemCode,
  MAX_DELIVERY_ZONES,
  ServerFieldProblemCode,
  type CreateDeliveryZoneInput,
  type DeliveryAreasInput,
  type DeliveryZoneAreasInput,
  type HomeAreaInput,
  type UpdateDeliveryZoneInput,
} from '@lytronix/validators';
import type { ZoneLimitedProduct } from '@lytronix/db';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { ShopDeliveryRateService } from '../../balance/services/shop-delivery-rate.service';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { CatalogueVersion } from '../../catalogue/services/catalogue-version';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { ZoneInUse, type DeliveryZoneStore } from '../ports/delivery-stores';
import { DELIVERY_ZONE_STORE } from '../tokens';
import type {
  DeliverySettingsView,
  HomeAreaKind,
  ResolvedZoneView,
  ZoneAreaRecord,
  ZoneAreas,
  ZoneRecord,
  ZoneView,
} from '../types/delivery';
import { LocationService } from './location.service';
import { homeAreaPhrase, zoneLabel } from './zone-labels';

const DEFAULTS = {
  homeCityCode: DEFAULT_HOME_CITY,
  homeCharge: DEFAULT_HOME_ZONE_CHARGE,
  fallbackCharge: DEFAULT_FALLBACK_ZONE_CHARGE,
};

/** Each id once, in the order given. */
function distinctAreas(input: DeliveryAreasInput): ZoneAreas {
  return {
    zillaIds: [...new Set(input.zillaIds)],
    cityCodes: [...new Set(input.cityCodes)],
    locationIds: [...new Set(input.locationIds)],
  };
}

function areasOf(rows: ZoneAreaRecord[], zoneId: string): ZoneAreas {
  const own = rows.filter((row) => row.zoneId === zoneId);
  return {
    zillaIds: own.flatMap((row) => (row.zillaId !== null ? [row.zillaId] : [])),
    cityCodes: own.flatMap((row) => (row.cityCode !== null ? [row.cityCode] : [])),
    locationIds: own.flatMap((row) => (row.locationId !== null ? [row.locationId] : [])),
  };
}

/** DLV-01: what the home zone's areas make the home area. */
function homeKind(areas: ZoneAreas): HomeAreaKind {
  if (areas.cityCodes.length > 0) return 'city';
  if (areas.zillaIds.length > 0) return 'zilla';
  return 'thanas';
}

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * DLV-01 to DLV-04, DLV-06, DLV-07: a shop's delivery zones. Every shop has a home zone ("Inside <home area>",
 * Dhaka city at 70 TK until it picks another) and the fallback ("Outside <home area>", 130 TK, everything no other
 * zone names), plus up to 18 of its own. A thana falls in the zone naming it, else its city's, else its zilla's,
 * else the fallback; no area sits in two zones. Every change is in the activity log and moves the catalogue version,
 * and applies to orders created afterwards only (DLV-04).
 */
@Injectable()
export class DeliveryZoneService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(DELIVERY_ZONE_STORE) private readonly zones: DeliveryZoneStore,
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CatalogueVersion) private readonly version: CatalogueVersion,
    @Inject(ShopDeliveryRateService) private readonly perKg: ShopDeliveryRateService,
  ) {}

  /** DLV-05: the home area and every zone, the two defaults made the first time a shop asks. */
  settings(tenantId: string): Promise<DeliverySettingsView> {
    return this.transactions.run(async (tx) => {
      await this.zones.ensureDefaults(tx, tenantId, DEFAULTS);
      return this.view(tx, tenantId);
    });
  }

  /**
   * DLV-01: sets the home area (one city, one zilla, or the tenant's own thanas) and refills the home zone with it.
   * Both charges stay; zones the tenant has not renamed follow the new area's name.
   */
  async setHomeArea(
    tenantId: string,
    input: HomeAreaInput,
    actor: CatalogueActor,
  ): Promise<DeliverySettingsView> {
    const areas = distinctAreas(input.areas);
    await this.refuseUnknownAreas(areas);
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.zones.ensureDefaults(tx, tenantId, DEFAULTS);
      await this.zones.lockZones(tx, tenantId);
      const home = (await this.zones.listZones(tx, tenantId)).find((zone) => zone.isHome);
      if (!home) throw new ApiError('not_found', 'DeliveryZoneNotFound', {});
      await this.placeAreas(tx, tenantId, home.id, areas);
      await this.record(tx, tenantId, who, AuditAction.DeliveryHomeAreaChanged, home.id, {
        kind: homeKind(areas),
        ...areas,
      });
      await this.version.bump(tx, tenantId);
      return this.view(tx, tenantId);
    });
  }

  /** DLV-01: one more zone, such as "Dhaka suburbs", up to 20 in all. */
  async create(
    tenantId: string,
    input: CreateDeliveryZoneInput,
    actor: CatalogueActor,
  ): Promise<DeliverySettingsView> {
    const areas = distinctAreas(input.areas);
    await this.refuseUnknownAreas(areas);
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.zones.ensureDefaults(tx, tenantId, DEFAULTS);
      await this.zones.lockZones(tx, tenantId);
      if ((await this.zones.countZones(tx, tenantId)) >= MAX_DELIVERY_ZONES) {
        throw new ApiError(
          'conflict',
          'TooManyDeliveryZones',
          { max: MAX_DELIVERY_ZONES },
          undefined,
          { max: MAX_DELIVERY_ZONES },
        );
      }
      const zone = await this.zones.insertZone(tx, {
        tenantId,
        name: input.name,
        charge: money(input.charge),
        noDelivery: input.noDelivery ?? false,
      });
      await this.placeAreas(tx, tenantId, zone.id, areas);
      await this.record(tx, tenantId, who, AuditAction.DeliveryZoneCreated, zone.id, {
        name: zone.name,
        charge: zone.charge,
        noDelivery: zone.noDelivery,
        ...areas,
      });
      await this.version.bump(tx, tenantId);
      return this.view(tx, tenantId);
    });
  }

  /** DLV-01, DLV-04, DLV-06: renames, re-prices or marks "no delivery"; existing orders keep their charge. */
  async update(
    tenantId: string,
    zoneId: string,
    input: UpdateDeliveryZoneInput,
    actor: CatalogueActor,
  ): Promise<DeliverySettingsView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.zones.ensureDefaults(tx, tenantId, DEFAULTS);
      const current = await this.find(tx, tenantId, zoneId);
      // Only the home and fallback zones have a name to fall back to.
      if (input.name === null && !current.isHome && !current.isFallback) {
        throw new FieldsError([{ field: 'name', problem: FieldProblemCode.Required }]);
      }
      const updated = await this.zones.updateZone(tx, tenantId, zoneId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.charge !== undefined ? { charge: money(input.charge) } : {}),
        ...(input.noDelivery !== undefined ? { noDelivery: input.noDelivery } : {}),
      });
      if (!updated) throw new ApiError('not_found', 'DeliveryZoneNotFound', {});
      await this.record(tx, tenantId, who, AuditAction.DeliveryZoneUpdated, zoneId, {
        ...(input.name !== undefined ? { name: { from: current.name, to: updated.name } } : {}),
        ...(input.charge !== undefined
          ? { charge: { from: current.charge, to: updated.charge } }
          : {}),
        ...(input.noDelivery !== undefined ? { noDelivery: updated.noDelivery } : {}),
      });
      await this.version.bump(tx, tenantId);
      return this.view(tx, tenantId);
    });
  }

  /** DLV-01: replaces one of the shop's own zones' areas. The home zone's are its home area; the fallback has none. */
  async setAreas(
    tenantId: string,
    zoneId: string,
    input: DeliveryZoneAreasInput,
    actor: CatalogueActor,
  ): Promise<DeliverySettingsView> {
    const areas = distinctAreas(input.areas);
    await this.refuseUnknownAreas(areas);
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.zones.ensureDefaults(tx, tenantId, DEFAULTS);
      await this.zones.lockZones(tx, tenantId);
      const zone = await this.find(tx, tenantId, zoneId);
      if (zone.isHome) throw new ApiError('conflict', 'HomeZoneAreasAreHomeArea', {});
      if (zone.isFallback) throw new ApiError('conflict', 'FallbackZoneHasNoAreas', {});
      await this.placeAreas(tx, tenantId, zoneId, areas);
      await this.record(tx, tenantId, who, AuditAction.DeliveryZoneUpdated, zoneId, { ...areas });
      await this.version.bump(tx, tenantId);
      return this.view(tx, tenantId);
    });
  }

  /** DLV-01, DLV-07: deletes one of the shop's own zones; one a product's delivery limit names is refused. */
  async delete(
    tenantId: string,
    zoneId: string,
    actor: CatalogueActor,
  ): Promise<DeliverySettingsView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.zones.ensureDefaults(tx, tenantId, DEFAULTS);
      await this.zones.lockZones(tx, tenantId);
      const zone = await this.find(tx, tenantId, zoneId);
      if (zone.isHome || zone.isFallback) {
        throw new ApiError('conflict', 'DeliveryZoneFixed', {});
      }
      const limited = await this.zones.productsLimitedTo(tx, tenantId, zoneId);
      if (limited.length > 0) this.refuseInUse(limited);
      try {
        await this.zones.deleteZone(tx, tenantId, zoneId);
      } catch (error) {
        // A product named the zone between the check and the delete.
        if (error instanceof ZoneInUse) this.refuseInUse([]);
        throw error;
      }
      await this.record(tx, tenantId, who, AuditAction.DeliveryZoneDeleted, zoneId, {
        name: zone.name,
        charge: zone.charge,
      });
      await this.version.bump(tx, tenantId);
      return this.view(tx, tenantId);
    });
  }

  /** DLV-02, DLV-05: the zone a thana falls in, and which of its areas put it there. */
  async resolve(tenantId: string, locationId: number): Promise<ResolvedZoneView> {
    const location = await this.locations.thana(locationId);
    if (!location) throw new ApiError('not_found', 'LocationNotFound', {});
    return this.transactions.run((tx) => this.resolveWithin(tx, tenantId, location));
  }

  /** DLV-02, D4-9: the same for a known thana, inside a transaction the caller already holds (pricing an order). */
  async resolveWithin(
    tx: Transaction,
    tenantId: string,
    location: ResolvedZoneView['location'],
  ): Promise<ResolvedZoneView> {
    await this.zones.ensureDefaults(tx, tenantId, DEFAULTS);
    const matches = await this.zones.findAreas(tx, tenantId, {
      locationIds: [location.id],
      cityCodes: location.cityCode !== null ? [location.cityCode] : [],
      zillaIds: [location.zillaId],
    });
    const byThana = matches.find((row) => row.locationId === location.id);
    const byCity = matches.find(
      (row) => location.cityCode !== null && row.cityCode === location.cityCode,
    );
    const byZilla = matches.find((row) => row.zillaId === location.zillaId);
    const match = byThana ?? byCity ?? byZilla;
    const settings = await this.view(tx, tenantId);
    const zone = match
      ? settings.zones.find((row) => row.id === match.zoneId)
      : settings.zones.find((row) => row.isFallback);
    if (!zone) throw new ApiError('not_found', 'DeliveryZoneNotFound', {});
    return {
      location,
      matchedBy: byThana ? 'thana' : byCity ? 'city' : byZilla ? 'zilla' : 'fallback',
      zone,
    };
  }

  /**
   * LIF-19: the day-60 deletion job's delivery step: every zone and its areas. Runs after the catalogue's, since a
   * product's delivery limit keeps its zone. A second run finds nothing to delete.
   */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.transactions.run((tx) => this.zones.deleteAllForTenant(tx, tenantId));
  }

  // --- Building blocks ---

  private async find(tx: Transaction, tenantId: string, zoneId: string): Promise<ZoneRecord> {
    const zone = await this.zones.findZone(tx, tenantId, zoneId);
    if (!zone) throw new ApiError('not_found', 'DeliveryZoneNotFound', {});
    return zone;
  }

  private async refuseUnknownAreas(areas: ZoneAreas): Promise<void> {
    const problems = await this.locations.problemsWith(areas);
    if (problems.length > 0) throw new FieldsError(problems);
  }

  /**
   * DLV-02: gives the zone these areas, in place of the ones it had. An area another zone holds is refused naming
   * each one, rather than moved: the tenant decides which zone it belongs to.
   */
  private async placeAreas(
    tx: Transaction,
    tenantId: string,
    zoneId: string,
    areas: ZoneAreas,
  ): Promise<void> {
    const held = (await this.zones.findAreas(tx, tenantId, areas)).filter(
      (row) => row.zoneId !== zoneId,
    );
    if (held.length > 0) this.refuseTaken(areas, held);
    try {
      await this.zones.replaceAreas(tx, tenantId, zoneId, areas);
    } catch (error) {
      // Another write placed one of them first.
      if (error instanceof UniqueViolation) this.refuseTaken(areas, []);
      throw error;
    }
  }

  private refuseTaken(areas: ZoneAreas, held: ZoneAreaRecord[]): never {
    const problems: InvalidField[] = [];
    const flag = <K>(field: string, keys: K[], holder: (key: K) => ZoneAreaRecord | undefined) => {
      keys.forEach((key, position) => {
        if (held.length === 0 || holder(key)) {
          problems.push({
            field: `areas.${field}.${String(position)}`,
            problem: ServerFieldProblemCode.Taken,
            messageKey: 'DeliveryAreaTaken',
          });
        }
      });
    };
    flag('zillaIds', areas.zillaIds, (id) => held.find((row) => row.zillaId === id));
    flag('cityCodes', areas.cityCodes, (code) => held.find((row) => row.cityCode === code));
    flag('locationIds', areas.locationIds, (id) => held.find((row) => row.locationId === id));
    throw new FieldsError(problems, 'conflict', {
      zoneIds: [...new Set(held.map((row) => row.zoneId))],
    });
  }

  /** Names each product holding the zone, and whether it is archived, so the seller knows to restore it first. */
  private refuseInUse(products: ZoneLimitedProduct[]): never {
    throw new ApiError('conflict', 'DeliveryZoneInUse', { products });
  }

  private record(
    tx: Transaction,
    tenantId: string,
    who: ResolvedActor,
    action: AuditAction,
    zoneId: string,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.activity.record(
      tx,
      tenantId,
      who,
      action,
      { type: 'delivery_zone', id: zoneId },
      summary,
    );
  }

  /**
   * DLV-05: everything the delivery settings show, with the home and fallback zones named after the home area, and the
   * shop's extra charge per kg (RAT-14) so whoever may see the zones sees it too.
   */
  private async view(tx: Transaction, tenantId: string): Promise<DeliverySettingsView> {
    const [zones, areaRows] = [
      await this.zones.listZones(tx, tenantId),
      await this.zones.listAreas(tx, tenantId),
    ];
    const home = zones.find((zone) => zone.isHome);
    const homeAreas = home
      ? await this.locations.describe(areasOf(areaRows, home.id))
      : { zillas: [], cities: [], thanas: [] };
    const kind = homeKind({
      zillaIds: homeAreas.zillas.map((zilla) => zilla.id),
      cityCodes: homeAreas.cities.map((city) => city.code),
      locationIds: homeAreas.thanas.map((thana) => thana.id),
    });
    const phrase = homeAreaPhrase(kind, homeAreas);
    const views: ZoneView[] = [];
    for (const zone of zones) {
      const automatic = zone.isHome ? zoneLabel('inside', phrase) : zoneLabel('outside', phrase);
      views.push({
        id: zone.id,
        name: zone.name,
        label: zone.name !== null ? { en: zone.name, bn: zone.name } : automatic,
        charge: zone.charge,
        isHome: zone.isHome,
        isFallback: zone.isFallback,
        noDelivery: zone.noDelivery,
        areas: await this.locations.describe(areasOf(areaRows, zone.id)),
      });
    }
    return {
      homeArea: { kind, label: { en: phrase.en, bn: phrase.bn } },
      zones: views,
      maxZones: MAX_DELIVERY_ZONES,
      extraDeliveryChargePerKg: await this.perKg.within(tx, tenantId),
    };
  }
}
