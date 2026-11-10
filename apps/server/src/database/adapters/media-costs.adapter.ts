import { Inject, Injectable } from '@nestjs/common';
import {
  MediaCostRepository,
  TransactionRunner,
  type MediaCostAlertRow,
  type MediaShopUse,
  type Transaction,
  type WorkerUse,
} from '@lytronix/db';
import type {
  MediaCostStore,
  RecordedR2Day,
} from '../../modules/media-costs/ports/media-cost-store';
import type { R2DayFigures } from '../../modules/media-costs/ports/r2-usage';
import { DatabaseService } from '../database.service';

/** MED-12, D8-57 to D8-64: Lytro's own tables, outside any shop's row-level security. */
@Injectable()
export class DrizzleMediaCostStore implements MediaCostStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(MediaCostRepository) private readonly costs: MediaCostRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.db, work);
  }

  replaceDays(days: readonly string[], rows: readonly R2DayFigures[]): Promise<void> {
    return this.run((tx) => this.costs.replaceDays(tx, days, rows));
  }

  daysBetween(from: string, to: string): Promise<RecordedR2Day[]> {
    return this.costs.daysBetween(this.db, from, to);
  }

  recordedSpan(): Promise<{ first: string; last: string } | null> {
    return this.costs.recordedSpan(this.db);
  }

  workerUse(from: string, to: string): Promise<WorkerUse> {
    return this.costs.workerUse(this.db, from, to);
  }

  topShops(from: string, to: string, limit: number): Promise<MediaShopUse[]> {
    return this.costs.topShops(this.db, from, to, limit);
  }

  recordAlert(tx: Transaction, alert: Omit<MediaCostAlertRow, 'sentAt'>): Promise<boolean> {
    return this.costs.recordAlert(tx, alert);
  }

  alertOf(periodStart: string): Promise<MediaCostAlertRow | null> {
    return this.costs.alertOf(this.db, periodStart);
  }
}
