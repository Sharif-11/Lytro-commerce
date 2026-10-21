import { TenantState } from '@lytronix/validators';

// Durations in milliseconds, defined once. Services use these instead of writing 60 * 1000 themselves.
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

// TRM-09: Bangladesh has run a fixed UTC+6 offset since it dropped a one-off DST experiment in 2009-2010 --
// safe to hardcode, no timezone database needed for this one fixed offset.
export const DHAKA_OFFSET_MS = 6 * HOUR_MS;

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

/**
 * UPG-10, PYG-19: the start of the month-long cycle `now` falls in, counting whole months from `anchor` (via
 * `addMonths`, so a cycle anchored on the 31st starts on the last day of a shorter month). `anchor` may be
 * after `now` -- a renewal paid early starts its period at the old period's end -- and the cycles then
 * count back from it.
 */
export function monthlyCycleStart(anchor: Date, now: Date): Date {
  return addMonths(anchor, cycleIndex(anchor, now));
}

/** Where the month-long cycle `now` falls in ends: the next one's start, counted from `anchor` the same way. */
export function monthlyCycleEnd(anchor: Date, now: Date): Date {
  return addMonths(anchor, cycleIndex(anchor, now) + 1);
}

/** How many whole months from `anchor` the cycle `now` falls in starts. */
function cycleIndex(anchor: Date, now: Date): number {
  const from = new Date(anchor.getTime() + DHAKA_OFFSET_MS);
  const to = new Date(now.getTime() + DHAKA_OFFSET_MS);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  // The calendar-month difference is right or one too many; step back until the cycle has started.
  while (addMonths(anchor, months) > now) months -= 1;
  return months;
}

/**
 * UPG-10, PYG-19, RTE-03: the start of the shop's usage cycle `now` falls in. A monthly allowance (free essential SMS,
 * API requests) runs in months from the paid period's start, so a purchase, a restart after lapse or an upgrade (each
 * a new period) starts it again from zero. Pay-as-you-go has no period, so it counts from the shop's creation date.
 */
export function usageCycleStart(tenant: CycleTenant, now: Date): Date {
  return monthlyCycleStart(usageAnchor(tenant), now);
}

/** LIM-02: when the shop's usage cycle `now` falls in ends, and its per-cycle counts start again. */
export function usageCycleEnd(tenant: CycleTenant, now: Date): Date {
  return monthlyCycleEnd(usageAnchor(tenant), now);
}

/** What a shop's usage cycle is counted from. */
interface CycleTenant {
  state: TenantState;
  periodStart: Date | null;
  createdAt: Date;
}

function usageAnchor(tenant: CycleTenant): Date {
  return tenant.state === TenantState.PayAsYouGo
    ? tenant.createdAt
    : (tenant.periodStart ?? tenant.createdAt);
}

/** BIL-14: the start (00:00) of the Asia/Dhaka calendar day `date` falls on, same offset trick as `addMonths`. */
export function startOfDayDhaka(date: Date): Date {
  const local = new Date(date.getTime() + DHAKA_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - DHAKA_OFFSET_MS);
}

/** INV-18: the start (00:00) of the Asia/Dhaka calendar day written YYYY-MM-DD. */
export function dhakaDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DHAKA_OFFSET_MS);
}

/** BIL-05: the Asia/Dhaka calendar date `date` falls on, as YYYY-MM-DD -- how a date is written into a notice. */
export function dhakaDate(date: Date): string {
  return new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}
