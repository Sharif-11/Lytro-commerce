// Durations in milliseconds, defined once. Services use these instead of writing 60 * 1000 themselves.
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

// TRM-09: Bangladesh has run a fixed UTC+6 offset since it dropped a one-off DST experiment in 2009-2010 --
// safe to hardcode, no timezone database needed for this one fixed offset.
const DHAKA_OFFSET_MS = 6 * HOUR_MS;

/**
 * BIL-10, TRM-09: a billing term's length is in whole calendar months, not a fixed day count (months vary in
 * length), counted on the Asia/Dhaka calendar day `date` falls on -- not UTC's, which can disagree with Dhaka's
 * for the last 6 hours of every UTC day (18:00-24:00 UTC is already tomorrow at UTC+6). When the target month
 * is shorter than the start day (31 Jan -> Feb), the last day of that month is used, never an overflow into
 * the month after.
 */
export function addMonths(date: Date, months: number): Date {
  // Shifting the instant forward by the offset and reading it back with the UTC getters gives the Dhaka wall
  // clock reading directly -- the same trick as a fixed-offset zone lookup, without needing one.
  const local = new Date(date.getTime() + DHAKA_OFFSET_MS);
  const day = local.getUTCDate();
  local.setUTCDate(1); // land on the 1st first, so setUTCMonth below can never itself overflow
  local.setUTCMonth(local.getUTCMonth() + months);
  const daysInTargetMonth = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
  local.setUTCDate(Math.min(day, daysInTargetMonth));
  return new Date(local.getTime() - DHAKA_OFFSET_MS);
}

/** UPG-03: the actual days between two stored dates (a period's own real length, never an assumed 30/365). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** UPG-03: whole days remaining until `to`, rounded up -- a part-day still counts as a full day owed. */
export function daysUntil(now: Date, to: Date): number {
  return Math.ceil((to.getTime() - now.getTime()) / DAY_MS);
}
