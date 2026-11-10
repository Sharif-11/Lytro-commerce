import { SalesBucket } from '@lytronix/validators';
import { dhakaDay } from '@/lib/format';

/** ADM-09 (§10e): the four ways the reports open a period, each with the split it reads best in. */
export type Preset = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear';

export const PRESETS: readonly Preset[] = ['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'];

export interface Period {
  dateFrom: string;
  dateTo: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

function lastDayOf(year: number, month: number): string {
  // Day 0 of the next month is this month's last; months here run 1 to 12.
  return `${String(year)}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
}

/** A preset's days, as of today in Dhaka. */
export function presetPeriod(preset: Preset, now = new Date()): Period {
  const today = dhakaDay(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (preset === 'thisMonth') return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
  if (preset === 'lastMonth') {
    const lastYear = month === 1 ? year - 1 : year;
    const last = month === 1 ? 12 : month - 1;
    return {
      dateFrom: `${String(lastYear)}-${pad(last)}-01`,
      dateTo: lastDayOf(lastYear, last),
    };
  }
  if (preset === 'thisQuarter') {
    const first = month - ((month - 1) % 3);
    return { dateFrom: `${String(year)}-${pad(first)}-01`, dateTo: today };
  }
  return { dateFrom: `${String(year)}-01-01`, dateTo: today };
}

/** The split a preset reads best in: a month by week, longer by month. */
export function presetSplit(preset: Preset): SalesBucket {
  return preset === 'thisMonth' || preset === 'lastMonth' ? SalesBucket.Week : SalesBucket.Month;
}
