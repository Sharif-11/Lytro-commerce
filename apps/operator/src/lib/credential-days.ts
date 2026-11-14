import { dhakaDay } from './format';

const DAY_MS = 24 * 60 * 60 * 1000;
// SEC-11 (Slice 9.9): the export's first offer, the last 30 days, today included.
const DEFAULT_DAYS = 30;

/** The last 30 days in Dhaka, today included: what the credential-use export offers first. */
export function lastThirtyDays(now: Date): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: dhakaDay(new Date(now.getTime() - (DEFAULT_DAYS - 1) * DAY_MS)),
    dateTo: dhakaDay(now),
  };
}

/** Whether the days can be asked for: both given, and "to" not before "from" (the server's own check). */
export function daysInOrder(dateFrom: string, dateTo: string): boolean {
  return dateFrom !== '' && dateTo !== '' && dateTo >= dateFrom;
}
