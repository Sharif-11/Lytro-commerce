import { Inject, Injectable } from '@nestjs/common';
import {
  SalesRepository,
  TransactionRunner,
  type BestSellerRow,
  type SalesDayCost,
  type SalesDayLines,
  type SalesDayOrders,
  type SalesPeriod,
  type Transaction,
} from '@lytronix/db';
import type { SalesRanking } from '@lytronix/validators';
import type { SalesStore } from '../../modules/orders/ports/sales-store';
import { DatabaseService } from '../database.service';

/** The shop's sales figures, read inside one transaction (STA-01 to STA-04, INV-18). */
@Injectable()
export class DrizzleSalesStore implements SalesStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(SalesRepository) private readonly sales: SalesRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  dailyOrders(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayOrders[]> {
    return this.sales.dailyOrders(tx, tenantId, period, productId);
  }

  dailyLines(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayLines[]> {
    return this.sales.dailyLines(tx, tenantId, period, productId);
  }

  dailyCost(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    productId: string | null,
  ): Promise<SalesDayCost[]> {
    return this.sales.dailyCost(tx, tenantId, period, productId);
  }

  bestSellers(
    tx: Transaction,
    tenantId: string,
    period: SalesPeriod,
    by: SalesRanking,
    limit: number,
  ): Promise<BestSellerRow[]> {
    return this.sales.bestSellers(tx, tenantId, period, by, limit);
  }
}
