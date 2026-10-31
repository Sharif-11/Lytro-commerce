import type {
  BestSellerRow,
  SalesDayCost,
  SalesDayLines,
  SalesDayOrders,
  SalesPeriod,
  Transaction,
} from '@lytronix/db';
import type { SalesRanking } from '@lytronix/validators';

/** STA-01 to STA-04, INV-18 (Slice 4.7): a shop's sales, read from its orders day by day. */
export interface SalesStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  dailyOrders(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayOrders[]>;
  dailyLines(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayLines[]>;
  dailyCost(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayCost[]>;
  bestSellers(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    by: SalesRanking,
    limit: number,
  ): Promise<BestSellerRow[]>;
}
