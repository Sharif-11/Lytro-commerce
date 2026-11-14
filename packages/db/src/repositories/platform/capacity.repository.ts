import { and, eq, sql } from 'drizzle-orm';
import { TenantState } from '@lytronix/validators';
import type { Executor } from '../../transactions';
import { billingTerms, planPrices, tenants } from '../../schema';

/** DAT-55's two figures from Lytro's own tables. */
export interface CapacityFigures {
  /** Shops in a paid period now (`active`): not a trial, pay-as-you-go or a lapsed shop. */
  payingShops: number;
  /**
   * What those shops' plans bring in a month, in taka: each one's current plan price for its billing term, over the
   * term's months. A shop given its plan by the operator with no term adds nothing.
   */
  monthlyRevenue: number;
}

/** DAT-55 (Slice 9.6): the figures that say when a second server is due. */
export class CapacityRepository {
  async figures(db: Executor): Promise<CapacityFigures> {
    const rows = await db
      .select({
        payingShops: sql<number>`count(*)::int`,
        monthlyRevenue: sql<string>`coalesce(sum(${planPrices.price} / ${billingTerms.months}), 0)::numeric(14, 2)::text`,
      })
      .from(tenants)
      .leftJoin(billingTerms, eq(billingTerms.id, tenants.billingTermId))
      .leftJoin(
        planPrices,
        and(
          eq(planPrices.planId, tenants.planId),
          eq(planPrices.billingTermId, tenants.billingTermId),
        ),
      )
      .where(eq(tenants.state, TenantState.Active));
    const row = rows[0];
    return { payingShops: row?.payingShops ?? 0, monthlyRevenue: Number(row?.monthlyRevenue ?? 0) };
  }
}
