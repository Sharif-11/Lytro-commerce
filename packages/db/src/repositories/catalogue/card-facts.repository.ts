import { sql, type SQL } from 'drizzle-orm';
import {
  CARD_FACTS_CHANGE_SLACK_SECONDS,
  CARD_FACTS_FULL_REFRESH_HOURS,
  CARD_FACTS_REFRESH_AFTER_MINUTES,
} from '@lytronix/validators';
import type { Transaction, TransactionRunner } from '../../transactions';
import { counted } from '../orders/sales.repository';

// SB-9, SB-10: the open ends of the windows sales are counted over.
export const EVER = new Date(0);
export const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');

/**
 * SB-9, SB-10: the shop's `top` most sold products since `since` -- by units kept, then by orders, then by id, so a tie
 * always falls the same way -- over Slice 4.7's counted orders. One definition for the live cards and the kept ones.
 */
export function bestSellersSince(tenantId: string, since: Date, top: number): SQL {
  return sql`SELECT l.product_id
    FROM tenant.orders o
    JOIN tenant.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.id
    WHERE ${counted(tenantId, { from: since, to: FAR_FUTURE })}
      AND l.returned_quantity < l.quantity AND l.product_id IS NOT NULL
    GROUP BY l.product_id
    ORDER BY sum(l.quantity - l.returned_quantity) DESC, count(DISTINCT o.id) DESC, l.product_id
    LIMIT ${top}`;
}

/** SB-10: a line of a counted order, ever, that still holds a unit of its product -- what "Ordered N times" counts. */
export function orderedLine(tenantId: string): SQL {
  return sql`l.returned_quantity < l.quantity AND ${counted(tenantId, { from: EVER, to: FAR_FUTURE })}`;
}

/**
 * SB-10 (the owner, 2026-11-20): a shop's cards' "ordered" and best-seller facts, kept (`tenant.product_card_facts`) and
 * worked out again by the minute tick, so a product list reads them instead of going through the shop's orders. Each
 * method sets the shop's tenant context, so row-level security applies.
 */
export class CardFactsRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * Whether the shop's facts are due to be worked out again, holding them for this transaction when they are: never
   * worked out; worked out a day ago; or worked out at least `CARD_FACTS_REFRESH_AFTER_MINUTES` ago with an order of
   * the shop changed since (from a little before, for a change whose transaction committed after that run began). A
   * shop another run holds is not due.
   */
  async due(tx: Transaction, tenantId: string): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ due: boolean }>(sql`
      SELECT CASE
        WHEN NOT pg_try_advisory_xact_lock(hashtextextended('card_facts ' || ${tenantId}, 0)) THEN false
        WHEN r.worked_at IS NULL THEN true
        WHEN r.worked_at <= now() - make_interval(hours => ${CARD_FACTS_FULL_REFRESH_HOURS}) THEN true
        WHEN r.worked_at > now() - make_interval(mins => ${CARD_FACTS_REFRESH_AFTER_MINUTES}) THEN false
        ELSE EXISTS (
          SELECT 1 FROM tenant.orders o
          WHERE o.tenant_id = ${tenantId}
            AND o.updated_at >= r.worked_at - make_interval(secs => ${CARD_FACTS_CHANGE_SLACK_SECONDS}))
      END AS due
      FROM (SELECT ${tenantId}::uuid AS tenant_id) shop
      LEFT JOIN tenant.card_fact_runs r ON r.tenant_id = shop.tenant_id`);
    return result.rows[0]?.due === true;
  }

  /**
   * Works the shop's facts out again from its counted orders and keeps them, with the run's time (the transaction's,
   * by the database's clock). A product ordered at least once has a row; the best sellers are counted since `since`.
   * Returns the products kept.
   */
  async refresh(tx: Transaction, tenantId: string, since: Date, top: number): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`DELETE FROM tenant.product_card_facts WHERE tenant_id = ${tenantId}`);
    const kept = await tx.execute(sql`
      WITH best AS (${bestSellersSince(tenantId, since, top)}),
      ordered AS (
        SELECT l.product_id, count(DISTINCT o.id)::int AS ordered
        FROM tenant.order_lines l
        JOIN tenant.orders o ON o.tenant_id = l.tenant_id AND o.id = l.order_id
        WHERE l.tenant_id = ${tenantId} AND l.product_id IS NOT NULL AND ${orderedLine(tenantId)}
        GROUP BY l.product_id
      )
      INSERT INTO tenant.product_card_facts (tenant_id, product_id, ordered, best_seller)
      SELECT p.tenant_id, p.id, d.ordered, EXISTS (SELECT 1 FROM best b WHERE b.product_id = d.product_id)
      FROM ordered d
      JOIN tenant.products p ON p.tenant_id = ${tenantId} AND p.id = d.product_id`);
    await tx.execute(sql`
      INSERT INTO tenant.card_fact_runs (tenant_id, worked_at) VALUES (${tenantId}, now())
      ON CONFLICT (tenant_id) DO UPDATE SET worked_at = excluded.worked_at`);
    return kept.rowCount ?? 0;
  }
}
