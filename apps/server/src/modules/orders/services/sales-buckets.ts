import { SalesBucket } from '@lytronix/validators';

/** A stretch of calendar days written YYYY-MM-DD, both ends included. */
export interface DayRange {
  from: string;
  to: string;
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** The first day of the bucket a day falls in: a week's Saturday (agreed 2026-10-30), a month's, quarter's or year's 1st. */
function bucketStart(day: string, bucket: SalesBucket): Date {
  const date = dateOf(day);
  switch (bucket) {
    case SalesBucket.Week:
      // getUTCDay: Sunday 0 ... Saturday 6, so Saturday is 0 days in.
      return new Date(date.getTime() - ((date.getUTCDay() + 1) % 7) * 86_400_000);
    case SalesBucket.Month:
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    case SalesBucket.Quarter:
      return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - (date.getUTCMonth() % 3), 1),
      );
    case SalesBucket.Year:
      return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  }
}

/** The first day of the bucket after the one starting on `start`. */
function nextStart(start: Date, bucket: SalesBucket): Date {
  switch (bucket) {
    case SalesBucket.Week:
      return new Date(start.getTime() + 7 * 86_400_000);
    case SalesBucket.Month:
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    case SalesBucket.Quarter:
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1));
    case SalesBucket.Year:
      return new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
  }
}

/**
 * STA-01: the period's weeks, months, quarters or years in order, the first and last cut to the period, so the buckets
 * of any split add up to the same period (a month's weeks add up to the month).
 */
export function bucketsOf(period: DayRange, bucket: SalesBucket): DayRange[] {
  const ranges: DayRange[] = [];
  let start = bucketStart(period.from, bucket);
  while (dayOf(start) <= period.to) {
    const next = nextStart(start, bucket);
    const last = dayOf(new Date(next.getTime() - 86_400_000));
    ranges.push({
      from: dayOf(start) < period.from ? period.from : dayOf(start),
      to: last > period.to ? period.to : last,
    });
    start = next;
  }
  return ranges;
}
