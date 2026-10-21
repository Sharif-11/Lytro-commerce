import { and, asc, eq, gt, lte, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { AddonKind, AddonPurchaseStatus, type PlanPaymentMethod } from '@lytronix/validators';
import { addonPurchases, addons, type SelectAddonPurchase } from '../../schema';
import type { Executor } from '../../transactions';

export type AddonPurchaseRow = SelectAddonPurchase;

export interface NewAddonPurchaseValues {
  tenantId: string;
  addonId: string;
  kind: AddonKind;
  limitKey: string | null;
  unitSize: number | null;
  quantity: number;
  price: string;
  paidFrom: PlanPaymentMethod;
  planPaymentId: string;
  expiresAt: Date;
}

/** PLN-13: one limit raised by a shop's active add-ons, and by how much in that limit's own unit. */
export interface AddonUnits {
  limitKey: string;
  units: number;
}

/** PLN-14: an add-on the shop has now, as the dashboard lists it. */
export interface ActiveAddonRow {
  id: string;
  addonId: string;
  key: string;
  kind: AddonKind;
  labelEn: string;
  labelBn: string;
  limitKey: string | null;
  unitSize: number | null;
  quantity: number;
  startsAt: Date | null;
  expiresAt: Date;
  renews: boolean;
}

/** PLN-13, PLN-14: an add-on counts only while active, from its start until its end -- whatever any job has done. */
function counting(): SQL | undefined {
  return and(
    eq(addonPurchases.status, AddonPurchaseStatus.Active),
    lte(addonPurchases.startsAt, sql`now()`),
    gt(addonPurchases.expiresAt, sql`now()`),
  );
}

/**
 * PLN-13: a shop's active limit add-ons as one object, limit key to units -- the one definition every reader of a
 * shop's limits uses, the tenant summary as a subquery beside the shop's overrides.
 */
export function addonUnitsOf(tenantId: SQLWrapper | string): SQL<Record<string, number> | null> {
  return sql<Record<string, number> | null>`(
    SELECT jsonb_object_agg(a.limit_key, a.units) FROM (
      SELECT ${addonPurchases.limitKey} AS limit_key,
             SUM(${addonPurchases.quantity} * ${addonPurchases.unitSize})::int AS units
      FROM ${addonPurchases}
      WHERE ${addonPurchases.tenantId} = ${tenantId}
        AND ${addonPurchases.kind} = ${AddonKind.Limit}
        AND ${counting()}
      GROUP BY ${addonPurchases.limitKey}
    ) a
  )`;
}

/** The object `addonUnitsOf` reads, as the list `withAddons` takes. */
export function addonUnitList(units: Record<string, number> | null): AddonUnits[] {
  return Object.entries(units ?? {}).map(([limitKey, value]) => ({ limitKey, units: value }));
}

// PLN-14: the add-ons each shop bought.
export class AddonPurchaseRepository {
  async insert(db: Executor, values: NewAddonPurchaseValues): Promise<AddonPurchaseRow> {
    const [row] = await db.insert(addonPurchases).values(values).returning();
    if (!row) throw new Error('insert returned no add-on purchase');
    return row;
  }

  /** The purchase a quoted payment pays for, locked for its confirmation. */
  async findByPaymentForUpdate(
    db: Executor,
    planPaymentId: string,
  ): Promise<AddonPurchaseRow | null> {
    const rows = await db
      .select()
      .from(addonPurchases)
      .where(eq(addonPurchases.planPaymentId, planPaymentId))
      .limit(1)
      .for('update');
    return rows[0] ?? null;
  }

  /** PLN-14: it takes effect now. */
  async activate(db: Executor, id: string, startsAt: Date): Promise<void> {
    await db
      .update(addonPurchases)
      .set({ status: AddonPurchaseStatus.Active, startsAt })
      .where(eq(addonPurchases.id, id));
  }

  /** PLN-13: the shop's active limit add-ons, limit by limit. */
  async activeUnits(db: Executor, tenantId: string): Promise<AddonUnits[]> {
    const rows = await db.execute<{ units: Record<string, number> | null }>(
      sql`SELECT ${addonUnitsOf(tenantId)} AS units`,
    );
    return addonUnitList(rows.rows[0]?.units ?? null);
  }

  /** PLN-14: what the shop has now, every kind, with the catalogue's names. */
  async listActive(db: Executor, tenantId: string): Promise<ActiveAddonRow[]> {
    return db
      .select({
        id: addonPurchases.id,
        addonId: addonPurchases.addonId,
        key: addons.key,
        kind: addonPurchases.kind,
        labelEn: addons.labelEn,
        labelBn: addons.labelBn,
        limitKey: addonPurchases.limitKey,
        unitSize: addonPurchases.unitSize,
        quantity: addonPurchases.quantity,
        startsAt: addonPurchases.startsAt,
        expiresAt: addonPurchases.expiresAt,
        renews: addonPurchases.renews,
      })
      .from(addonPurchases)
      .innerJoin(addons, eq(addons.id, addonPurchases.addonId))
      .where(and(eq(addonPurchases.tenantId, tenantId), counting()))
      .orderBy(asc(addonPurchases.purchasedAt));
  }
}
