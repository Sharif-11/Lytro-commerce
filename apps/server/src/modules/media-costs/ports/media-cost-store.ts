import type { MediaCostAlertRow, MediaShopUse, Transaction, WorkerUse } from '@lytronix/db';
import type { R2DayFigures } from './r2-usage';

/** A recorded R2 day, with when it was last read. */
export interface RecordedR2Day extends R2DayFigures {
  updatedAt: Date;
}

/** MED-12, D8-57 to D8-64: Lytro's own record of R2's days, the media Worker's use, and the budget's alert. */
export interface MediaCostStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Replaces these days' rows with what was read, in one transaction. */
  replaceDays(days: readonly string[], rows: readonly R2DayFigures[]): Promise<void>;
  /** The recorded days from `from` up to, not including, `to`. */
  daysBetween(from: string, to: string): Promise<RecordedR2Day[]>;
  /** The first and last days anything was recorded for. */
  recordedSpan(): Promise<{ first: string; last: string } | null>;
  /** The media Worker's use in these Dhaka days, both included, every shop together. */
  workerUse(from: string, to: string): Promise<WorkerUse>;
  topShops(from: string, to: string, limit: number): Promise<MediaShopUse[]>;
  /** False when the period's alert was already recorded. */
  recordAlert(tx: Transaction, alert: Omit<MediaCostAlertRow, 'sentAt'>): Promise<boolean>;
  alertOf(periodStart: string): Promise<MediaCostAlertRow | null>;
}
