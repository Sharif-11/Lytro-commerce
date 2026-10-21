import { Inject, Injectable } from '@nestjs/common';
import {
  TenantRepository,
  TransactionRunner,
  UsageWarningRepository,
  type Transaction,
} from '@lytronix/db';
import type {
  UsageWarningStore,
  WarnedShop,
} from '../../modules/usage-warnings/ports/usage-warning-store';
import { DatabaseService } from '../database.service';

/** control.usage_warnings (LIM-01), and the shop summary its warnings are judged by (PLN-11). */
@Injectable()
export class DrizzleUsageWarningStore implements UsageWarningStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(UsageWarningRepository) private readonly warnings: UsageWarningRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async findShop(tenantId: string): Promise<WarnedShop | null> {
    const shop = await this.tenants.findSummaryById(this.database.handle.db, tenantId);
    return (
      shop && {
        state: shop.state,
        periodStart: shop.periodStart,
        createdAt: shop.createdAt,
        limits: shop.planLimits,
      }
    );
  }

  warned(tx: Transaction, tenantId: string, metric: string, cycleStart: Date): Promise<number> {
    return this.warnings.warned(tx, tenantId, metric, cycleStart);
  }

  setWarned(
    tx: Transaction,
    tenantId: string,
    metric: string,
    cycleStart: Date,
    percent: number,
  ): Promise<void> {
    return this.warnings.setWarned(tx, tenantId, metric, cycleStart, percent);
  }

  deleteForTenant(tenantId: string): Promise<void> {
    return this.warnings.deleteForTenant(this.database.handle.db, tenantId);
  }
}
