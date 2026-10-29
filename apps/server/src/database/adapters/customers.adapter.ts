import { Inject, Injectable } from '@nestjs/common';
import { CustomerRepository, TransactionRunner, type Transaction } from '@lytronix/db';
import type { CustomerStore } from '../../modules/customers/ports/customer-store';
import type { CustomerRecord } from '../../modules/customers/types/customers';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleCustomerStore implements CustomerStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CustomerRepository) private readonly customers: CustomerRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  claim(tx: Transaction, tenantId: string, phone: string): Promise<string> {
    return this.customers.claim(tx, tenantId, phone);
  }

  recount(tx: Transaction, tenantId: string, customerId: string): Promise<void> {
    return this.customers.recount(tx, tenantId, customerId);
  }

  find(tx: Transaction, tenantId: string, id: string): Promise<CustomerRecord | null> {
    return this.customers.find(tx, tenantId, id);
  }

  listForExport(
    tx: Transaction,
    tenantId: string,
    afterId: string | null,
    limit: number,
  ): Promise<CustomerRecord[]> {
    return this.customers.listForExport(tx, tenantId, afterId, limit);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.customers.deleteAllForTenant(tx, tenantId);
  }
}
