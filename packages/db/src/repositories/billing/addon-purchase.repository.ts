import { and, asc, eq, gt, inArray, lte, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import {
  AddonKind,
  AddonPurchaseStatus,
  PlanPaymentStatus,
  TenantState,
  type PlanPaymentMethod,
} from '@lytronix/validators';
import {
  addonPurchases,
  addons,
  planPayments,
  tenants,
  type SelectAddonPurchase,
} from '../../schema';
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
  /** Known at the quote only for an upgrade's extension, which starts where the add-on it extends ends. */
  startsAt?: Date | null;
  expiresAt: Date;
  /**
   * PLN-14: the add-on this one continues into a new period. It keeps that one's purchase time, copied in the database
   * to the microsecond, so it stays exactly as old and oldest first holds from one period to the next.
   */
  continuesId?: string | null;
}

/** PLN-14: how a payment's add-on takes effect -- from when, until when, and how it was paid. */
export interface AddonActivation {
  startsAt: Date;
  expiresAt: Date;
  paidFrom: PlanPaymentMethod;
}

/**
 * PLN-14, UPG-14: an add-on of the period about to be renewed or replaced, with what the catalogue says of its item
 * now: the monthly price it renews at, and whether it is still for sale.
 */
export interface RenewingAddonRow {
  id: string;
  tenantId: string;
  addonId: string;
  key: string;
  kind: AddonKind;
  labelEn: string;
  limitKey: string | null;
  unitSize: number | null;
  quantity: number;
  renews: boolean;
  purchasedAt: Date;
  expiresAt: Date;
  price: string;
  retiredAt: Date | null;
}

/** BIL-12, ADM-06: an add-on a payment pays for, as its invoice line and the operator's queue name it. */
export interface PaymentAddonRow {
  id: string;
  planPaymentId: string;
  key: string;
  labelEn: string;
  labelBn: string;
  quantity: number;
  price: string;
  status: AddonPurchaseStatus;
  startsAt: Date | null;
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
  /** When the catalogue stopped selling its item; a retired item never renews. */
  retiredAt: Date | null;
  /** The catalogue's price for a month of one now, what renewing it would cost. */
  monthlyPrice: string;
}

/**
 * LIF-05: the add-on ends with its shop's period, and the shop is still active or in grace -- where everything works as
 * before until the shop renews (which moves the period on) or its grace ends.
 */
function carriedByGrace(): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${tenants} AS shop
    WHERE shop.id = ${addonPurchases.tenantId}
      AND shop.state IN (${TenantState.Active}, ${TenantState.Grace})
      AND date_trunc('milliseconds', shop.period_end) = date_trunc('milliseconds', ${addonPurchases.expiresAt})
  )`;
}

/**
 * PLN-13, PLN-14, LIF-05: an add-on counts only while active, from its start until its end -- or, when it ends with its
 * shop's period, on through grace -- whatever any job has done.
 */
function counting(): SQL | undefined {
  return and(
    eq(addonPurchases.status, AddonPurchaseStatus.Active),
    lte(addonPurchases.startsAt, sql`now()`),
    or(gt(addonPurchases.expiresAt, sql`now()`), carriedByGrace()),
  );
}

/** PLN-14: another add-on continues this one, in one of these states. */
function continuedAs(...statuses: AddonPurchaseStatus[]): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${addonPurchases} AS next
    WHERE next.continues_id = ${addonPurchases.id}
      AND next.status IN (${sql.join(
        statuses.map((status) => sql`${status}`),
        sql`, `,
      )})
  )`;
}

/** What the lifecycle tick reads of an add-on: the row, with what the catalogue says of its item now. */
const CARRIED_COLUMNS = {
  id: addonPurchases.id,
  tenantId: addonPurchases.tenantId,
  addonId: addonPurchases.addonId,
  key: addons.key,
  kind: addonPurchases.kind,
  labelEn: addons.labelEn,
  limitKey: addonPurchases.limitKey,
  unitSize: addonPurchases.unitSize,
  quantity: addonPurchases.quantity,
  renews: addonPurchases.renews,
  purchasedAt: addonPurchases.purchasedAt,
  expiresAt: addonPurchases.expiresAt,
  price: addons.price,
  retiredAt: addons.retiredAt,
};

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
    const continued = values.continuesId
      ? {
          purchasedAt: sql`(SELECT purchased_at FROM ${addonPurchases} WHERE id = ${values.continuesId})`,
        }
      : {};
    const [row] = await db
      .insert(addonPurchases)
      .values({ ...values, ...continued })
      .returning();
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

  /** PLN-14: it takes effect, for the period its payment landed in. */
  async activate(db: Executor, id: string, activation: AddonActivation): Promise<void> {
    await db
      .update(addonPurchases)
      .set({ status: AddonPurchaseStatus.Active, ...activation })
      .where(eq(addonPurchases.id, id));
  }

  /** PLN-14: its payment will never activate it. */
  async cancel(db: Executor, id: string): Promise<void> {
    await db
      .update(addonPurchases)
      .set({ status: AddonPurchaseStatus.Cancelled })
      .where(eq(addonPurchases.id, id));
  }

  /** BIL-12, ADM-06: the add-ons these payments pay for, each payment's in the order they were added. */
  async listForPayments(db: Executor, planPaymentIds: string[]): Promise<PaymentAddonRow[]> {
    if (planPaymentIds.length === 0) return [];
    const rows = await db
      .select({
        id: addonPurchases.id,
        planPaymentId: addonPurchases.planPaymentId,
        key: addons.key,
        labelEn: addons.labelEn,
        labelBn: addons.labelBn,
        quantity: addonPurchases.quantity,
        price: addonPurchases.price,
        status: addonPurchases.status,
        startsAt: addonPurchases.startsAt,
        expiresAt: addonPurchases.expiresAt,
      })
      .from(addonPurchases)
      .innerJoin(addons, eq(addons.id, addonPurchases.addonId))
      .where(inArray(addonPurchases.planPaymentId, planPaymentIds))
      .orderBy(asc(addonPurchases.purchasedAt), asc(addonPurchases.id));
    return rows.flatMap(({ planPaymentId, ...row }) =>
      planPaymentId === null ? [] : [{ planPaymentId, ...row }],
    );
  }

  /**
   * PLN-14, UPG-14: the add-ons set to renew that end with the period ending at `periodEnd`, oldest first -- what a
   * renewal carries into the next period and an upgrade extends. Compared to the millisecond, the precision the
   * server writes both with.
   */
  async listRenewing(db: Executor, tenantId: string, periodEnd: Date): Promise<RenewingAddonRow[]> {
    return db
      .select(CARRIED_COLUMNS)
      .from(addonPurchases)
      .innerJoin(addons, eq(addons.id, addonPurchases.addonId))
      .where(
        and(
          eq(addonPurchases.tenantId, tenantId),
          eq(addonPurchases.status, AddonPurchaseStatus.Active),
          eq(addonPurchases.renews, true),
          sql`date_trunc('milliseconds', ${addonPurchases.expiresAt}) = ${periodEnd}`,
        ),
      )
      .orderBy(asc(addonPurchases.purchasedAt), asc(addonPurchases.id));
  }

  /**
   * PLN-14: active add-ons that no longer count -- their end passed and no grace carries them -- and that nothing
   * continues (`continuedBy`: in those states), oldest first.
   */
  async listEnded(db: Executor, continuedBy: AddonPurchaseStatus[]): Promise<RenewingAddonRow[]> {
    return db
      .select(CARRIED_COLUMNS)
      .from(addonPurchases)
      .innerJoin(addons, eq(addons.id, addonPurchases.addonId))
      .where(
        and(
          eq(addonPurchases.status, AddonPurchaseStatus.Active),
          lte(addonPurchases.expiresAt, sql`now()`),
          sql`NOT ${carriedByGrace()}`,
          sql`NOT ${continuedAs(...continuedBy)}`,
        ),
      )
      .orderBy(asc(addonPurchases.purchasedAt), asc(addonPurchases.id));
  }

  /** PLN-14: add-ons counting now that end before `horizon`, oldest first -- the ones a warning may be due for. */
  async listEndingBy(db: Executor, horizon: Date): Promise<RenewingAddonRow[]> {
    return db
      .select(CARRIED_COLUMNS)
      .from(addonPurchases)
      .innerJoin(addons, eq(addons.id, addonPurchases.addonId))
      .where(
        and(
          counting(),
          gt(addonPurchases.expiresAt, sql`now()`),
          lte(addonPurchases.expiresAt, horizon),
        ),
      )
      .orderBy(asc(addonPurchases.purchasedAt), asc(addonPurchases.id));
  }

  /** PLN-14: it ended, and nothing continues it. */
  async lapse(db: Executor, id: string): Promise<void> {
    await db
      .update(addonPurchases)
      .set({ status: AddonPurchaseStatus.Lapsed })
      .where(eq(addonPurchases.id, id));
  }

  /** PLN-14: the add-ons a payment would have activated, once it is turned down. */
  async cancelForPayment(db: Executor, planPaymentId: string): Promise<void> {
    await db
      .update(addonPurchases)
      .set({ status: AddonPurchaseStatus.Cancelled })
      .where(
        and(
          eq(addonPurchases.planPaymentId, planPaymentId),
          eq(addonPurchases.status, AddonPurchaseStatus.Pending),
        ),
      );
  }

  /**
   * BIL-15: the add-ons of quotes that expired or were turned down. An expired quote paid late and approved still
   * activates them (`AddonRenewalService`), so this only tidies what no one is waiting on. How many.
   */
  async cancelForStalePayments(db: Executor): Promise<number> {
    const rows = await db
      .update(addonPurchases)
      .set({ status: AddonPurchaseStatus.Cancelled })
      .where(
        and(
          eq(addonPurchases.status, AddonPurchaseStatus.Pending),
          inArray(
            addonPurchases.planPaymentId,
            db
              .select({ id: planPayments.id })
              .from(planPayments)
              .where(
                inArray(planPayments.status, [
                  PlanPaymentStatus.Expired,
                  PlanPaymentStatus.Rejected,
                ]),
              ),
          ),
        ),
      )
      .returning({ id: addonPurchases.id });
    return rows.length;
  }

  /** One of this shop's purchases, locked for a change to it. */
  async findForTenantForUpdate(
    db: Executor,
    tenantId: string,
    id: string,
  ): Promise<AddonPurchaseRow | null> {
    const rows = await db
      .select()
      .from(addonPurchases)
      .where(and(eq(addonPurchases.id, id), eq(addonPurchases.tenantId, tenantId)))
      .limit(1)
      .for('update');
    return rows[0] ?? null;
  }

  /** PLN-14: the add-on's renewal switch. */
  async setRenews(db: Executor, id: string, renews: boolean): Promise<void> {
    await db.update(addonPurchases).set({ renews }).where(eq(addonPurchases.id, id));
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
        retiredAt: addons.retiredAt,
        monthlyPrice: addons.price,
      })
      .from(addonPurchases)
      .innerJoin(addons, eq(addons.id, addonPurchases.addonId))
      .where(and(eq(addonPurchases.tenantId, tenantId), counting()))
      .orderBy(asc(addonPurchases.purchasedAt));
  }
}
