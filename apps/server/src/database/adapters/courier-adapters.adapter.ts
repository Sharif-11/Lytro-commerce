import { Inject, Injectable } from '@nestjs/common';
import {
  CourierAdapterRepository,
  TransactionRunner,
  type CourierAdapterPatch,
  type SelectCourierAdapter,
  type Transaction,
} from '@lytronix/db';
import type { CourierKey } from '@lytronix/validators';
import type { CourierAdapterStore } from '../../modules/couriers/ports/courier-adapter-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleCourierAdapterStore implements CourierAdapterStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CourierAdapterRepository) private readonly adapters: CourierAdapterRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  all(): Promise<SelectCourierAdapter[]> {
    return this.adapters.all(this.database.handle.db);
  }

  lock(tx: Transaction, courierKey: CourierKey): Promise<SelectCourierAdapter> {
    return this.adapters.lock(tx, courierKey);
  }

  save(
    tx: Transaction,
    courierKey: CourierKey,
    patch: CourierAdapterPatch,
    now: Date,
  ): Promise<SelectCourierAdapter> {
    return this.adapters.save(tx, courierKey, patch, now);
  }
}
