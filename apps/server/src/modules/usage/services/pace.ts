import { DAY_MS } from '../../../common/time';

/**
 * LIM-01: when a per-cycle allowance is used up at the pace of the cycle so far -- what was used, spread over the days
 * gone (a day at least) -- or null when nothing has been used yet. The email's pace line and the usage page's run-out
 * date both read it (Slice 11.5c), so the two never disagree.
 */
export function runOutDate(used: number, limit: number, cycleStart: Date, now: Date): Date | null {
  const elapsedDays = Math.max((now.getTime() - cycleStart.getTime()) / DAY_MS, 1);
  const perDay = used / elapsedDays;
  if (perDay <= 0) return null;
  return new Date(now.getTime() + ((limit - used) / perDay) * DAY_MS);
}
