import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentListRepository,
  TransactionRunner,
  type PaymentListFilter,
  type PaymentListRow,
  type Transaction,
} from '@lytronix/db';
import type { PaymentListStore } from '../../modules/payment-review/ports/payment-list-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzlePaymentListStore implements PaymentListStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PaymentListRepository) private readonly payments: PaymentListRepository,
  ) {}

  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  list(
    tx: Transaction,
    tenantId: string,
    filter: PaymentListFilter,
    page: { offset: number; limit: number } | null,
  ): Promise<{ rows: PaymentListRow[]; total: number; amount: string }> {
    return this.payments.list(tx, tenantId, filter, page);
  }
}
