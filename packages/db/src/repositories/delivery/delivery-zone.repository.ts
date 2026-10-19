import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  deliveryZoneAreas,
  deliveryZones,
  productDeliveryZones,
  products,
  type SelectDeliveryZone,
  type SelectDeliveryZoneArea,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';
import { isEmptyPatch } from '../patch';

/** DLV-01: a zone's areas at each of the three levels. */
export interface ZoneAreas {
  zillaIds: number[];
  cityCodes: string[];
  locationIds: number[];
}

/** DLV-01: what a zone may change after it exists. */
export type DeliveryZonePatch = Partial<Pick<SelectDeliveryZone, 'name' | 'charge' | 'noDelivery'>>;

// DLV-01, DLV-02, DLV-07: a shop's delivery zones and the areas each covers. Every method sets the shop's tenant
// context, so row-level security applies.
export class DeliveryZoneRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * DLV-01: gives the shop its home and fallback zones if it has none yet, the home zone covering the default city.
   * Safe to call at the start of every zone transaction: a second caller, or one racing the first, changes nothing.
   */
  async ensureDefaults(
    tx: Transaction,
    tenantId: string,
    defaults: { homeCityCode: string; homeCharge: string; fallbackCharge: string },
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    const home = await tx.execute<{ id: string }>(sql`
      INSERT INTO tenant.delivery_zones (tenant_id, is_home, charge)
      VALUES (${tenantId}, true, ${defaults.homeCharge})
      ON CONFLICT (tenant_id) WHERE is_home DO NOTHING
      RETURNING id`);
    const homeId = home.rows[0]?.id;
    if (homeId !== undefined) {
      await tx
        .insert(deliveryZoneAreas)
        .values({ tenantId, zoneId: homeId, cityCode: defaults.homeCityCode });
    }
    await tx.execute(sql`
      INSERT INTO tenant.delivery_zones (tenant_id, is_fallback, charge)
      VALUES (${tenantId}, true, ${defaults.fallbackCharge})
      ON CONFLICT (tenant_id) WHERE is_fallback DO NOTHING`);
  }

  /** Locks the shop's home zone, so zone writes (and the 20-zone count) happen one after the other. */
  async lockZones(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(
      sql`SELECT 1 FROM tenant.delivery_zones WHERE tenant_id = ${tenantId} AND is_home FOR UPDATE`,
    );
  }

  /** The home zone first, then the shop's own in the order made, the fallback last. */
  async listZones(tx: Transaction, tenantId: string): Promise<SelectDeliveryZone[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(deliveryZones)
      .where(eq(deliveryZones.tenantId, tenantId))
      .orderBy(
        sql`${deliveryZones.isHome} DESC`,
        sql`${deliveryZones.isFallback} ASC`,
        asc(deliveryZones.createdAt),
        asc(deliveryZones.id),
      );
  }

  async listAreas(tx: Transaction, tenantId: string): Promise<SelectDeliveryZoneArea[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx.select().from(deliveryZoneAreas).where(eq(deliveryZoneAreas.tenantId, tenantId));
  }

  async findZone(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<SelectDeliveryZone | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.tenantId, tenantId), eq(deliveryZones.id, id)));
    return rows[0] ?? null;
  }

  async countZones(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(deliveryZones)
      .where(eq(deliveryZones.tenantId, tenantId));
    return rows[0]?.total ?? 0;
  }

  async insertZone(
    tx: Transaction,
    values: { tenantId: string; name: string; charge: string; noDelivery: boolean },
  ): Promise<SelectDeliveryZone> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(deliveryZones).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no delivery zone row');
    return row;
  }

  async updateZone(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: DeliveryZonePatch,
  ): Promise<SelectDeliveryZone | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const own = and(eq(deliveryZones.tenantId, tenantId), eq(deliveryZones.id, id));
    const rows = isEmptyPatch(patch)
      ? await tx.select().from(deliveryZones).where(own)
      : await tx
          .update(deliveryZones)
          .set({ ...patch, updatedAt: new Date() })
          .where(own)
          .returning();
    return rows[0] ?? null;
  }

  /** Deletes the zone and its areas. A zone a product still names is refused by its foreign key (DLV-07). */
  async deleteZone(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(deliveryZones)
      .where(and(eq(deliveryZones.tenantId, tenantId), eq(deliveryZones.id, id)));
  }

  /** Replaces the zone's areas. An area another zone holds is refused by the unique indexes (DLV-02). */
  async replaceAreas(
    tx: Transaction,
    tenantId: string,
    zoneId: string,
    areas: ZoneAreas,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(deliveryZoneAreas)
      .where(and(eq(deliveryZoneAreas.tenantId, tenantId), eq(deliveryZoneAreas.zoneId, zoneId)));
    const rows = [
      ...areas.zillaIds.map((zillaId) => ({ tenantId, zoneId, zillaId })),
      ...areas.cityCodes.map((cityCode) => ({ tenantId, zoneId, cityCode })),
      ...areas.locationIds.map((locationId) => ({ tenantId, zoneId, locationId })),
    ];
    if (rows.length > 0) await tx.insert(deliveryZoneAreas).values(rows);
  }

  /** The area rows, in any zone of the shop, that name any of these areas: for refusals, and for resolution. */
  async findAreas(
    tx: Transaction,
    tenantId: string,
    areas: ZoneAreas,
  ): Promise<SelectDeliveryZoneArea[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const matches = [
      areas.zillaIds.length > 0 ? inArray(deliveryZoneAreas.zillaId, areas.zillaIds) : undefined,
      areas.cityCodes.length > 0 ? inArray(deliveryZoneAreas.cityCode, areas.cityCodes) : undefined,
      areas.locationIds.length > 0
        ? inArray(deliveryZoneAreas.locationId, areas.locationIds)
        : undefined,
    ].filter((match) => match !== undefined);
    if (matches.length === 0) return [];
    return tx
      .select()
      .from(deliveryZoneAreas)
      .where(and(eq(deliveryZoneAreas.tenantId, tenantId), or(...matches)));
  }

  /** DLV-07: the products that name this zone in their delivery limit. */
  async productsLimitedTo(
    tx: Transaction,
    tenantId: string,
    zoneId: string,
  ): Promise<{ id: string; name: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({ id: products.id, name: products.name })
      .from(productDeliveryZones)
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productDeliveryZones.tenantId),
          eq(products.id, productDeliveryZones.productId),
        ),
      )
      .where(
        and(eq(productDeliveryZones.tenantId, tenantId), eq(productDeliveryZones.zoneId, zoneId)),
      )
      .orderBy(asc(products.name));
  }
}
