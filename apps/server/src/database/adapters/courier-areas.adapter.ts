import { Inject, Injectable } from '@nestjs/common';
import {
  CourierAreaRepository,
  TransactionRunner,
  type CourierAreaFilter,
  type CourierAreaRefreshCounts,
  type CourierAreaSummary,
  type ListedCourierArea,
  type MatchedCourierArea,
  type SelectCourierArea,
  type Transaction,
} from '@lytronix/db';
import type { CourierKey } from '@lytronix/validators';
import type { CourierAreaStore } from '../../modules/couriers/ports/courier-area-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleCourierAreaStore implements CourierAreaStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CourierAreaRepository) private readonly areas: CourierAreaRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  list(
    filter: CourierAreaFilter,
    window: { offset: number; limit: number },
  ): Promise<{ rows: SelectCourierArea[]; total: number }> {
    return this.areas.list(this.database.handle.db, filter, window);
  }

  summary(courierKey: CourierKey): Promise<CourierAreaSummary> {
    return this.areas.summary(this.database.handle.db, courierKey);
  }

  findById(id: string): Promise<SelectCourierArea | null> {
    return this.areas.findById(this.database.handle.db, id);
  }

  findByCode(courierKey: CourierKey, areaCode: string): Promise<SelectCourierArea | null> {
    return this.areas.findByCode(this.database.handle.db, courierKey, areaCode);
  }

  inThana(courierKey: CourierKey, thanaId: number): Promise<SelectCourierArea[]> {
    return this.areas.inThana(this.database.handle.db, courierKey, thanaId);
  }

  inZilla(
    courierKey: CourierKey,
    zillaId: number,
    q: string | undefined,
    limit: number,
  ): Promise<SelectCourierArea[]> {
    return this.areas.inZilla(this.database.handle.db, courierKey, zillaId, q, limit);
  }

  allOf(courierKey: CourierKey): Promise<SelectCourierArea[]> {
    return this.areas.allOf(this.database.handle.db, courierKey);
  }

  refresh(
    tx: Transaction,
    courierKey: CourierKey,
    listed: { added: MatchedCourierArea[]; kept: ListedCourierArea[] },
    now: Date,
  ): Promise<CourierAreaRefreshCounts> {
    return this.areas.refresh(tx, courierKey, listed, now);
  }

  assign(
    tx: Transaction,
    id: string,
    place: { thanaId: number | null; zillaId: number | null },
    now: Date,
  ): Promise<SelectCourierArea | null> {
    return this.areas.assign(tx, id, place, now);
  }

  confirm(tx: Transaction, ids: string[], now: Date): Promise<SelectCourierArea[]> {
    return this.areas.confirm(tx, ids, now);
  }
}
