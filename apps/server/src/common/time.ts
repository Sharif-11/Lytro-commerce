// Durations in milliseconds, defined once. Services use these instead of writing 60 * 1000 themselves.
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** BIL-10: a billing term's length is in whole calendar months, not a fixed day count (months vary in length). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
