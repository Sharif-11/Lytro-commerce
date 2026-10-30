import { Inject, Injectable } from '@nestjs/common';
import {
  TaxClassRepository,
  TransactionRunner,
  type SelectTaxClass,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { TaxClassStore } from '../../modules/catalogue/ports/tax-class-store';
import { DatabaseService } from '../database.service';

// TAX-01: one name per shop, ignoring case (migration 0092).
const NAME_KEY = 'tax_classes_name_key';

@Injectable()
export class DrizzleTaxClassStore implements TaxClassStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(TaxClassRepository) private readonly classes: TaxClassRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  list(tx: Transaction, tenantId: string): Promise<SelectTaxClass[]> {
    return this.classes.list(tx, tenantId);
  }

  find(tx: Transaction, tenantId: string, id: string): Promise<SelectTaxClass | null> {
    return this.classes.find(tx, tenantId, id);
  }

  lockAll(tx: Transaction, tenantId: string): Promise<number> {
    return this.classes.lockAll(tx, tenantId);
  }

  async insert(
    tx: Transaction,
    tenantId: string,
    values: { name: string; rate: string },
  ): Promise<SelectTaxClass> {
    try {
      return await this.classes.insert(tx, tenantId, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, NAME_KEY)) throw new UniqueViolation('name');
      throw error;
    }
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; rate?: string },
  ): Promise<SelectTaxClass | null> {
    try {
      return await this.classes.update(tx, tenantId, id, patch);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, NAME_KEY)) throw new UniqueViolation('name');
      throw error;
    }
  }

  delete(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.classes.delete(tx, tenantId, id);
  }

  countProducts(tx: Transaction, tenantId: string, id: string): Promise<number> {
    return this.classes.countProducts(tx, tenantId, id);
  }

  defaultOf(tx: Transaction, tenantId: string): Promise<string | null> {
    return this.classes.defaultOf(tx, tenantId);
  }

  setDefault(tx: Transaction, tenantId: string, id: string | null): Promise<void> {
    return this.classes.setDefault(tx, tenantId, id);
  }
}
