import { sql, type SQL } from 'drizzle-orm';
import {
  OrderPaymentStatus,
  SalesRanking,
  StatusOverride,
  StockReason,
  type StockUnit,
} from '@lytronix/validators';
import type { Transaction, TransactionRunner } from '../../transactions';

/** A period of instants, the end not included. */
export interface SalesPeriod {
  from: Date;
  to: Date;
}

/** STA-01, STA-03: one Asia/Dhaka day's counted orders and the delivery charges they carried. */
export interface SalesDayOrders {
  day: string;
  orders: number;
  deliveryCharges: string;
}

/** STA-01, STA-03: one day's items in one stock unit -- the units kept, their revenue and the tax inside it. */
export interface SalesDayLines {
  day: string;
  stockUnit: StockUnit;
  units: string;
  revenue: string;
  tax: string;
}

/** INV-18 (Slice 4.7): one day's cost of the goods its counted orders kept; a movement with no cost is counted. */
export interface SalesDayCost {
  day: string;
  value: string;
  unknownCost: number;
}

/** STA-02: one product's sales in a period, in one stock unit. */
export interface BestSellerRow {
  productId: string | null;
  name: string;
  stockUnit: StockUnit;
  units: string;
  revenue: string;
  orders: number;
}

// The reference a sale's and a return's movements carry to the reservation they moved (INV-15, INV-17).
const RESERVATION_REFERENCE = 'reservation';

/**
 * STA-01 to STA-04 (Phase 4 Slice 4.7, agreed 2026-10-30): the orders sales figures count -- delivered (a takeaway or
 * dine-in order handed over is delivered too), never cancelled, failed or refunded, with at least one unit kept -- on
 * the Asia/Dhaka day each was placed.
 */
function counted(tenantId: string, period: SalesPeriod): SQL {
  return sql`o.tenant_id = ${tenantId} AND o.created_at >= ${period.from} AND o.created_at < ${period.to}
    AND o.delivered_at IS NOT NULL
    AND o.status_override IS DISTINCT FROM ${StatusOverride.Cancelled}
    AND o.payment_status NOT IN (${OrderPaymentStatus.PaymentFailed}, ${OrderPaymentStatus.Refunded})
    AND EXISTS (SELECT 1 FROM tenant.order_lines k
      WHERE k.tenant_id = o.tenant_id AND k.order_id = o.id AND k.returned_quantity < k.quantity)`;
}

const DAY = sql`to_char(o.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD')`;

/** The share of a line's quantity that was kept, the rest having come back (INV-17). */
const KEPT = sql`(l.quantity - l.returned_quantity) / l.quantity`;

/**
 * A line's revenue: its total less its share of the order's discount -- the share TAX-02 works its tax out on, by item
 * totals, to the paisa below -- for the units kept, to the paisa. Prices include tax, so this includes it.
 */
const LINE_REVENUE = sql`round((l.item_total - CASE WHEN o.subtotal > 0
    THEN floor(o.discount * l.item_total * 100 / o.subtotal) / 100 ELSE 0 END) * ${KEPT}, 2)`;

/** The tax inside a line's revenue, for the units kept. */
const LINE_TAX = sql`round(l.tax_amount * ${KEPT}, 2)`;

/**
 * STA-01 to STA-03, INV-18 (Phase 4 Slice 4.7): sales figures from the orders themselves, never a stored total, so they
 * always agree with the order list. Each read gives one row per Asia/Dhaka day (and unit), for the caller to group into
 * weeks, months, quarters or years; every method sets the shop's tenant context.
 */
export class SalesRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** Each day's counted orders; with a product, those holding it. */
  async dailyOrders(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayOrders[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const holding =
      productId === null
        ? sql``
        : sql`AND EXISTS (SELECT 1 FROM tenant.order_lines l WHERE l.tenant_id = o.tenant_id
            AND l.order_id = o.id AND l.product_id = ${productId} AND l.returned_quantity < l.quantity)`;
    const result = await tx.execute<{ day: string; orders: number; delivery_charges: string }>(sql`
      SELECT ${DAY} AS day, count(*)::int AS orders,
        sum(o.delivery_charge)::numeric(14, 2)::text AS delivery_charges
      FROM tenant.orders o
      WHERE ${counted(tenantId, period)} ${holding}
      GROUP BY 1
      ORDER BY 1`);
    return result.rows.map((row) => ({
      day: row.day,
      orders: row.orders,
      deliveryCharges: row.delivery_charges,
    }));
  }

  /** Each day's items by stock unit: the units kept, their revenue and its tax; with a product, its items only. */
  async dailyLines(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayLines[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      day: string;
      stock_unit: StockUnit;
      units: string;
      revenue: string;
      tax: string;
    }>(sql`
      SELECT ${DAY} AS day, l.stock_unit,
        sum(l.quantity - l.returned_quantity)::numeric(14, 3)::text AS units,
        sum(${LINE_REVENUE})::numeric(14, 2)::text AS revenue,
        sum(${LINE_TAX})::numeric(14, 2)::text AS tax
      FROM tenant.orders o
      JOIN tenant.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.id
      WHERE ${counted(tenantId, period)} ${productId === null ? sql`` : sql`AND l.product_id = ${productId}`}
      GROUP BY 1, 2
      ORDER BY 1, 2`);
    return result.rows.map((row) => ({
      day: row.day,
      stockUnit: row.stock_unit,
      units: row.units,
      revenue: row.revenue,
      tax: row.tax,
    }));
  }

  /**
   * INV-11, INV-17, INV-18: each day's cost of the goods its counted orders kept -- their items' sales less what came
   * back, each at the cost its movement recorded, as the cost of goods sold is counted (a combo's at its components').
   */
  async dailyCost(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayCost[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ day: string; value: string; unknown_cost: number }>(sql`
      SELECT ${DAY} AS day,
        coalesce(round(sum(-m.quantity_delta * m.unit_cost), 2), 0)::numeric(14, 2)::text AS value,
        count(*) FILTER (WHERE m.unit_cost IS NULL)::int AS unknown_cost
      FROM tenant.orders o
      JOIN tenant.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.id
      JOIN tenant.stock_reservations r ON r.tenant_id = l.tenant_id AND r.order_line_id = l.id
      JOIN tenant.stock_movements m ON m.tenant_id = r.tenant_id
        AND m.reference_type = ${RESERVATION_REFERENCE} AND m.reference_id = r.id
        AND m.reason IN (${StockReason.Sale}, ${StockReason.ReturnReceived})
      WHERE ${counted(tenantId, period)} ${productId === null ? sql`` : sql`AND l.product_id = ${productId}`}
      GROUP BY 1
      ORDER BY 1`);
    return result.rows.map((row) => ({
      day: row.day,
      value: row.value,
      unknownCost: row.unknown_cost,
    }));
  }

  /**
   * STA-02: the products that sold most in the period, by units or by revenue, the other measure then the name breaking
   * ties. A combo is itself (agreed 2026-10-30); a product deleted for good is its items' name. Units are compared as
   * they are, each row naming its unit.
   */
  async bestSellers(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    by: SalesRanking,
    limit: number,
  ): Promise<BestSellerRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const ranked =
      by === SalesRanking.Revenue ? sql`revenue DESC, units DESC` : sql`units DESC, revenue DESC`;
    const result = await tx.execute<{
      product_id: string | null;
      name: string;
      stock_unit: StockUnit;
      units: string;
      revenue: string;
      orders: number;
    }>(sql`
      SELECT l.product_id,
        coalesce(p.name, (array_agg(l.product_name ORDER BY o.created_at DESC))[1]) AS name,
        l.stock_unit,
        -- Left numeric, so the ranking compares amounts, not text; node-pg reads a numeric as a string.
        sum(l.quantity - l.returned_quantity)::numeric(14, 3) AS units,
        sum(${LINE_REVENUE})::numeric(14, 2) AS revenue,
        count(DISTINCT o.id)::int AS orders
      FROM tenant.orders o
      JOIN tenant.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.id
      LEFT JOIN tenant.products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
      WHERE ${counted(tenantId, period)} AND l.returned_quantity < l.quantity
      GROUP BY l.product_id, p.name, CASE WHEN l.product_id IS NULL THEN l.product_name END, l.stock_unit
      ORDER BY ${ranked}, name, l.product_id
      LIMIT ${limit}`);
    return result.rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      stockUnit: row.stock_unit,
      units: row.units,
      revenue: row.revenue,
      orders: row.orders,
    }));
  }
}
