import { SALES_PERIOD_DAYS_MAX, SalesBucket } from '@lytronix/validators';

// TENANT-DASHBOARD-DESIGN §7.34 (STA-01): the periods Sales offers and the split each opens with, on Dhaka's calendar.
// Dates are YYYY-MM-DD, as the server takes them, both ends included.

export const PERIOD_KEYS = ['thisMonth', 'lastMonth', 'last3', 'thisYear', 'custom'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export interface SalesPeriod {
  key: PeriodKey;
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;
/** Picked dates up to this long open by week, then up to 2 years by month, then by quarter (agreed 2026-11-03). */
const WEEKS_UP_TO_DAYS = 62;
const MONTHS_UP_TO_DAYS = 731;

const utc = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The 1st of the month this many months from the one `day` is in. */
function monthStart(day: string, monthsOn: number): number {
  const date = new Date(utc(day));
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthsOn, 1);
}

/** One of the named periods, ending today unless it is a month already over. */
export function periodOf(key: Exclude<PeriodKey, 'custom'>, today: string): SalesPeriod {
  switch (key) {
    case 'thisMonth':
      return { key, from: dayOf(monthStart(today, 0)), to: today };
    case 'lastMonth':
      return {
        key,
        from: dayOf(monthStart(today, -1)),
        to: dayOf(monthStart(today, 0) - DAY_MS),
      };
    case 'last3':
      return { key, from: dayOf(monthStart(today, -2)), to: today };
    case 'thisYear':
      return { key, from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** A product's trend: this month and the eleven before it (agreed 2026-11-03). */
export function trendPeriod(today: string): { from: string; to: string } {
  return { from: dayOf(monthStart(today, -11)), to: today };
}

/** As far back as the server will read, to tell a shop that never sold from a period that had none. */
export function longestPeriod(today: string): { from: string; to: string } {
  return { from: dayOf(utc(today) - (SALES_PERIOD_DAYS_MAX - 1) * DAY_MS), to: today };
}

/** How many days a period holds, both ends counted. */
export function daysIn(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS) + 1;
}

/** What is wrong with dates as picked: the end before the start, or longer than the server reads. */
export function datesProblem(from: string, to: string): 'order' | 'long' | null {
  if (to < from) return 'order';
  return daysIn(from, to) > SALES_PERIOD_DAYS_MAX ? 'long' : null;
}

/** The split a period opens with (agreed 2026-11-03): readable bars, which the seller can still change. */
export function bucketFor(period: SalesPeriod): SalesBucket {
  if (period.key === 'thisMonth' || period.key === 'lastMonth') return SalesBucket.Week;
  if (period.key === 'last3' || period.key === 'thisYear') return SalesBucket.Month;
  const days = daysIn(period.from, period.to);
  if (days <= WEEKS_UP_TO_DAYS) return SalesBucket.Week;
  return days <= MONTHS_UP_TO_DAYS ? SalesBucket.Month : SalesBucket.Quarter;
}
