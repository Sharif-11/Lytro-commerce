import { Inject, Injectable } from '@nestjs/common';
import type { SalesDayCost, SalesDayLines, SalesDayOrders } from '@lytronix/db';
import {
  SALES_PERIOD_DAYS_MAX,
  type BestSellersQuery,
  type SalesQuery,
} from '@lytronix/validators';
import { dayPeriodOf } from '../../../common/day-period';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { unitTotals } from '../../inventory/services/unit-quantities';
import type { SalesStore } from '../ports/sales-store';
import { SALES_STORE } from '../tokens';
import type { BestSellersView, SalesFigureView, SalesProfitView, SalesView } from '../types/sales';
import { bucketsOf, type DayRange } from './sales-buckets';

/** One stretch's rows, as read day by day. */
interface DayRows {
  orders: SalesDayOrders[];
  lines: SalesDayLines[];
  cost: SalesDayCost[] | null;
}

function within<T extends { day: string }>(rows: readonly T[], range: DayRange): T[] {
  return rows.filter((row) => row.day >= range.from && row.day <= range.to);
}

function paisaSum(values: readonly string[]): bigint {
  return values.reduce((sum, value) => sum + toPaisa(value), 0n);
}

/** STA-01, STA-03, INV-18: one stretch's figures, every sum exact to the paisa, so buckets add up to their totals. */
function figureOf(rows: DayRows, productView: boolean): SalesFigureView {
  const revenue = paisaSum(rows.lines.map((row) => row.revenue));
  const tax = paisaSum(rows.lines.map((row) => row.tax));
  const figure: SalesFigureView = {
    orders: rows.orders.reduce((sum, row) => sum + row.orders, 0),
    units: unitTotals(rows.lines.map((row) => ({ unit: row.stockUnit, quantity: row.units }))),
    revenue: fromPaisa(revenue),
    tax: fromPaisa(tax),
    deliveryCharges: productView
      ? null
      : fromPaisa(paisaSum(rows.orders.map((row) => row.deliveryCharges))),
  };
  if (rows.cost === null) return figure;
  const cost = paisaSum(rows.cost.map((row) => row.value));
  const profit: SalesProfitView = {
    revenueLessTax: fromPaisa(revenue - tax),
    costOfGoods: fromPaisa(cost),
    profit: fromPaisa(revenue - tax - cost),
    unknownCost: rows.cost.reduce((sum, row) => sum + row.unknownCost, 0),
  };
  return { ...figure, profit };
}

/**
 * STA-01 to STA-04, INV-18 (Phase 4 Slice 4.7, agreed 2026-10-30): a shop's sales from its delivered orders, each on
 * the day it was placed -- order counts, units, revenue with the tax inside it and the delivery charges, split into
 * weeks (from Saturday), months, quarters or years; one product's trend; the best sellers. Profit -- the items less
 * their tax, less the cost of the goods kept -- only for a caller who may see cost (D3-9).
 */
@Injectable()
export class SalesFigures {
  constructor(@Inject(SALES_STORE) private readonly store: SalesStore) {}

  sales(
    tenantId: string,
    query: SalesQuery,
    canSeeCost: boolean,
    now = new Date(),
  ): Promise<SalesView> {
    const { dateFrom, dateTo, ...period } = dayPeriodOf(query, now, SALES_PERIOD_DAYS_MAX);
    const productId = query.productId ?? null;
    return this.store.run(tenantId, async (tx) => {
      const rows: DayRows = {
        orders: await this.store.dailyOrders(tx, tenantId, period, productId),
        lines: await this.store.dailyLines(tx, tenantId, period, productId),
        cost: canSeeCost ? await this.store.dailyCost(tx, tenantId, period, productId) : null,
      };
      const productView = productId !== null;
      return {
        dateFrom,
        dateTo,
        bucket: query.bucket,
        productId,
        buckets: bucketsOf({ from: dateFrom, to: dateTo }, query.bucket).map((range) => ({
          ...range,
          ...figureOf(
            {
              orders: within(rows.orders, range),
              lines: within(rows.lines, range),
              cost: rows.cost === null ? null : within(rows.cost, range),
            },
            productView,
          ),
        })),
        totals: figureOf(rows, productView),
      };
    });
  }

  /** STA-02: the products that sold most in the period, by units or by revenue. */
  bestSellers(
    tenantId: string,
    query: BestSellersQuery,
    now = new Date(),
  ): Promise<BestSellersView> {
    const { dateFrom, dateTo, ...period } = dayPeriodOf(query, now, SALES_PERIOD_DAYS_MAX);
    return this.store.run(tenantId, async (tx) => ({
      dateFrom,
      dateTo,
      by: query.by,
      products: await this.store.bestSellers(tx, tenantId, period, query.by, query.limit),
    }));
  }
}
