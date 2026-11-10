import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentMethodTypeRepository,
  TransactionRunner,
  type PaymentMethodTypePatch,
  type SelectPaymentMethodType,
  type Transaction,
} from '@lytronix/db';
import type { AccountMethod, RetireState } from '@lytronix/validators';
import type { PaymentMethodTypeStore } from '../../modules/payment-method-types/ports/payment-method-type-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzlePaymentMethodTypeStore implements PaymentMethodTypeStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PaymentMethodTypeRepository) private readonly types: PaymentMethodTypeRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  all(): Promise<SelectPaymentMethodType[]> {
    return this.types.all(this.database.handle.db);
  }

  sharedState(tx: Transaction, method: AccountMethod): Promise<RetireState> {
    return this.types.sharedState(tx, method);
  }

  lock(tx: Transaction, method: AccountMethod): Promise<SelectPaymentMethodType> {
    return this.types.lock(tx, method);
  }

  save(
    tx: Transaction,
    method: AccountMethod,
    patch: PaymentMethodTypePatch,
    now: Date,
  ): Promise<SelectPaymentMethodType> {
    return this.types.save(tx, method, patch, now);
  }
}
