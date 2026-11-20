import { Inject, Injectable } from '@nestjs/common';
import {
  CardFactsRepository,
  TenantRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import type { CardFactsStore } from '../../modules/public-api/ports/card-facts-store';
import { DatabaseService } from '../database.service';

/** SB-10: the shops' kept card facts, written on the write pool by the minute tick. */
@Injectable()
export class DrizzleCardFactsStore implements CardFactsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CardFactsRepository) private readonly facts: CardFactsRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  listShopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  due(tx: Transaction, tenantId: string): Promise<boolean> {
    return this.facts.due(tx, tenantId);
  }

  refresh(tx: Transaction, tenantId: string, since: Date, top: number): Promise<number> {
    return this.facts.refresh(tx, tenantId, since, top);
  }
}
