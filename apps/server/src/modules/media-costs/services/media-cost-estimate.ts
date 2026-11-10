import type { CloudflarePrices } from '@lytronix/validators';
import type { R2DayFigures } from '../ports/r2-usage';

// MED-12, D8-60 to D8-62 (Phase 8 Slice 8.6): Cloudflare's billing period and what it bills for R2 and Workers, worked
// out the way its pricing pages say: usage rounds up to the next whole unit before the month's allowance comes off,
// and a GB-month is the average of each day's peak storage over 30 days.

const DAY_MS = 86_400_000;
/** Cloudflare's GB, a thousand million bytes (the larger count of the two, so the estimate errs high). */
const GB = 1_000_000_000;
const MILLION = 1_000_000;
/** A GB-month is a day's peak storage over this many days. */
const STORAGE_MONTH_DAYS = 30;

/** A billing period's UTC days: `from` is its first, `to` the first of the next. */
export interface BillingPeriod {
  from: string;
  to: string;
}

/** A UTC day as YYYY-MM-DD. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The day so many days on (or back, below zero) from a YYYY-MM-DD day. */
export function addDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

/** D8-61: the billing period holding an instant, starting on the billing day of a month. */
export function periodOf(at: Date, billingDay: number): BillingPeriod {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth() - (at.getUTCDate() >= billingDay ? 0 : 1);
  return {
    from: utcDay(new Date(Date.UTC(year, month, billingDay))),
    to: utcDay(new Date(Date.UTC(year, month + 1, billingDay))),
  };
}

/** The period just before this one. */
export function periodBefore(period: BillingPeriod, billingDay: number): BillingPeriod {
  return periodOf(new Date(Date.parse(`${period.from}T00:00:00Z`) - DAY_MS), billingDay);
}

/** How many days a period has. */
export function daysOf(period: BillingPeriod): number {
  return Math.round(
    (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / DAY_MS,
  );
}

/** Whole units billed for a quantity past the month's allowance, after rounding the quantity up (1.1 bills as 2). */
function billable(quantity: number, allowance: number): number {
  // A hair's tolerance, so 3.0000000001 from adding up days doesn't bill a fourth unit.
  const units = Math.ceil(quantity - 1e-9);
  return Math.max(0, units - allowance);
}

export interface OperationsCost {
  operations: number;
  billableMillions: number;
  cost: number;
}

export interface StorageCost {
  gbMonths: number;
  billableGbMonths: number;
  cost: number;
}

export interface WorkersCost {
  requests: number;
  billableMillions: number;
  monthly: number;
  cost: number;
}

export interface MediaCostEstimate {
  classA: OperationsCost;
  classB: OperationsCost;
  storage: StorageCost;
  /** R2's three lines together. */
  r2: number;
  workers: WorkersCost;
  total: number;
}

/** GB-months a set of days' peaks come to, every bucket together. */
export function gbMonthsOf(days: readonly Pick<R2DayFigures, 'peakBytes'>[]): number {
  const bytes = days.reduce((sum, day) => sum + day.peakBytes, 0);
  return bytes / GB / STORAGE_MONTH_DAYS;
}

function operations(count: number, freeMillions: number, perMillion: number): OperationsCost {
  const billableMillions = billable(count / MILLION, freeMillions);
  return { operations: count, billableMillions, cost: billableMillions * perMillion };
}

/**
 * MED-12: the period's bill so far, from R2's recorded days (every bucket, D8-59) and the media Worker's requests.
 * Workers' monthly charge is in from the first day, as Cloudflare charges it.
 */
export function estimateOf(
  days: readonly R2DayFigures[],
  workerRequests: number,
  prices: CloudflarePrices,
): MediaCostEstimate {
  const classA = operations(
    days.reduce((sum, day) => sum + day.classA, 0),
    prices.r2FreeClassAMillions,
    prices.r2ClassAPerMillion,
  );
  const classB = operations(
    days.reduce((sum, day) => sum + day.classB, 0),
    prices.r2FreeClassBMillions,
    prices.r2ClassBPerMillion,
  );
  const gbMonths = gbMonthsOf(days);
  const billableGbMonths = billable(gbMonths, prices.r2FreeStorageGbMonths);
  const storage = {
    gbMonths,
    billableGbMonths,
    cost: billableGbMonths * prices.r2StoragePerGbMonth,
  };
  const workerMillions = billable(workerRequests / MILLION, prices.workersIncludedMillions);
  const workers = {
    requests: workerRequests,
    billableMillions: workerMillions,
    monthly: prices.workersMonthly,
    cost: prices.workersMonthly + workerMillions * prices.workersPerMillion,
  };
  const r2 = classA.cost + classB.cost + storage.cost;
  return { classA, classB, storage, r2, workers, total: r2 + workers.cost };
}

/** US dollars to two places, as the console and the alert show them. */
export function usd(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}
