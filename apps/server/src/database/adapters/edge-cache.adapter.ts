import { Inject, Injectable } from '@nestjs/common';
import { TenantRepository, type Transaction, TransactionRunner } from '@lytronix/db';
import type { EdgePurgeStore } from '../../modules/shared/edge-cache/ports/edge-purge-store';
import { DatabaseService } from '../database.service';

/** D9-32: the shop's slug a purge's tags are named by, read in the caller's transaction. */
@Injectable()
export class DrizzleEdgePurgeStore implements EdgePurgeStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  slugOf(tx: Transaction, tenantId: string): Promise<string | null> {
    return this.tenants.slugOf(tx, tenantId);
  }
}
