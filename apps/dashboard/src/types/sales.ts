import type { ProductKind, SalesBucket, SalesRanking, StockUnit } from '@lytronix/validators';

/** INV-18, D3-9: only for someone who may see costs; `unknownCost` the sales with no cost recorded. */
export interface SalesProfit {
  revenueLessTax: string;
  costOfGoods: string;
  profit: string;
  unknownCost: number;
}

/** STA-01, STA-04: what a stretch of days came to. */
export interface SalesFigure {
  orders: number;
  units: { unit: StockUnit; quantity: string }[];
  revenue: string;
  tax: string;
  /** Null on one product's trend. */
  deliveryCharges: string | null;
  /**
   * CRR-17 (Slice 6.5): what couriers charged, where a courier said; never taken off profit. `unknownCourierCharges` counts the
   * orders a courier carried without saying. Null on one product's trend.
   */
  courierCharges: string | null;
  unknownCourierCharges: number | null;
  profit?: SalesProfit;
}

export interface SalesBucketRow extends SalesFigure {
  from: string;
  to: string;
}

/** Mirrors `salesViewSchema` in apps/server/src/modules/team/dto/sales.dto.ts. */
export interface SalesRead {
  dateFrom: string;
  dateTo: string;
  bucket: SalesBucket;
  productId: string | null;
  buckets: SalesBucketRow[];
  totals: SalesFigure;
}

/** STA-02: `productId` is null for a product since deleted for good. */
export interface BestSeller {
  productId: string | null;
  name: string;
  kind: ProductKind;
  stockUnit: StockUnit;
  units: string;
  revenue: string;
  orders: number;
}

export interface BestSellersRead {
  dateFrom: string;
  dateTo: string;
  by: SalesRanking;
  products: BestSeller[];
}
