import type { SalesBucket, SalesRanking, StockUnit } from '@lytronix/validators';
import type { UnitQuantity } from '../../inventory/types/inventory';

/**
 * INV-18, D3-9 (Slice 4.7, agreed 2026-10-30): what the items made after the tax inside them, less the cost of the
 * goods kept; only for a caller who may see cost. A movement with no recorded cost adds nothing and is counted.
 */
export interface SalesProfitView {
  revenueLessTax: string;
  costOfGoods: string;
  profit: string;
  unknownCost: number;
}

/** STA-01, STA-03: the sales in a stretch of days -- the shop's, or one product's. */
export interface SalesFigureView {
  /** Delivered orders placed in it; for a product, those holding it. */
  orders: number;
  /** The units kept, by stock unit, never added across units. */
  units: UnitQuantity[];
  /** The items after discounts and returns, tax included (agreed 2026-10-30). */
  revenue: string;
  /** The tax inside `revenue` (TAX-02). */
  tax: string;
  /** What the orders were charged for delivery; null for one product. */
  deliveryCharges: string | null;
  profit?: SalesProfitView;
}

/** One week (Saturday to Friday), month, quarter or year, cut to the period; both ends included. */
export interface SalesBucketView extends SalesFigureView {
  from: string;
  to: string;
}

export interface SalesView {
  dateFrom: string;
  dateTo: string;
  bucket: SalesBucket;
  productId: string | null;
  buckets: SalesBucketView[];
  totals: SalesFigureView;
}

/** STA-02: one best seller; `productId` is null for a product since deleted for good. */
export interface BestSellerView {
  productId: string | null;
  name: string;
  stockUnit: StockUnit;
  units: string;
  revenue: string;
  orders: number;
}

export interface BestSellersView {
  dateFrom: string;
  dateTo: string;
  by: SalesRanking;
  products: BestSellerView[];
}
