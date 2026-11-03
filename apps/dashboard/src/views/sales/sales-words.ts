import { useTranslation } from 'react-i18next';
import { SalesBucket } from '@lytronix/validators';
import { formatDayMonthYear, formatMonth, shortMonth } from '@/lib/dates';
import type { SalesPeriod } from '@/lib/sales-period';

/** A calendar day at noon in Dhaka, so formatting it can't slip into the day before. */
const noonOf = (day: string): string => `${day}T06:00:00Z`;
const dayNumber = (day: string): string => String(Number(day.slice(8, 10)));
const yearOf = (day: string): string => day.slice(0, 4);

/** A bar's name under the chart, and its row's in the list below it (the prototype's `sa32Chart`). */
export interface BucketWords {
  short: string;
  long: string;
}

/** "1–2", or "31" for one day, and with its month in the list. Months are the sketch's: Bangla in a week's row. */
function weekWords(from: string, to: string, language: string): BucketWords {
  const short = from === to ? dayNumber(from) : `${dayNumber(from)}–${dayNumber(to)}`;
  const monthOf = (day: string): string => shortMonth(noonOf(day), language);
  const long =
    from.slice(0, 7) === to.slice(0, 7)
      ? `${short} ${monthOf(from)}`
      : `${dayNumber(from)} ${monthOf(from)}–${dayNumber(to)} ${monthOf(to)}`;
  return { short, long };
}

/** Words for a period's bars; `withYear` when the same month or quarter would otherwise appear twice. */
export function useBucketWords(): (
  bucket: SalesBucket,
  row: { from: string; to: string },
  withYear: boolean,
) => BucketWords {
  const { i18n } = useTranslation();
  return (bucket, row, withYear) => {
    const year = withYear ? ` ${yearOf(row.from)}` : '';
    const monthOf = (day: string): string => shortMonth(noonOf(day), 'en');
    switch (bucket) {
      case SalesBucket.Week:
        return weekWords(row.from, row.to, i18n.language);
      case SalesBucket.Month:
        return { short: monthOf(row.from), long: `${monthOf(row.from)}${year}` };
      case SalesBucket.Quarter: {
        const first = monthOf(row.from);
        const last = monthOf(row.to);
        const short = first === last ? first : `${first}–${last}`;
        return { short, long: `${short}${year}` };
      }
      case SalesBucket.Year:
        return { short: yearOf(row.from), long: yearOf(row.from) };
    }
  };
}

/** The period button's words: "This month · 1–31 Oct", "This year · Jan–Oct", picked dates as themselves. */
export function usePeriodWords(): (period: SalesPeriod) => string {
  const { t, i18n } = useTranslation('orders');
  const language = i18n.language;
  return ({ key, from, to }) => {
    if (key === 'custom') {
      return `${formatDayMonthYear(noonOf(from))} – ${formatDayMonthYear(noonOf(to))}`;
    }
    if (key === 'last3' || key === 'thisYear') {
      const name = key === 'last3' ? t('saLast3') : t('saThisYear');
      return `${name} · ${shortMonth(noonOf(from), language)}–${shortMonth(noonOf(to), language)}`;
    }
    const name = key === 'thisMonth' ? t('saThisMonth') : t('saLastMonth');
    const days = from === to ? dayNumber(from) : `${dayNumber(from)}–${dayNumber(to)}`;
    const month =
      language === 'bn' ? formatMonth(noonOf(to), language) : shortMonth(noonOf(to), language);
    return `${name} · ${days} ${month}`;
  };
}

/** "In" a month, for a sentence: "Sep", or Bangla's own form of each name, "সেপ্টেম্বরে". */
const IN_MONTH_BN = [
  'জানুয়ারিতে',
  'ফেব্রুয়ারিতে',
  'মার্চে',
  'এপ্রিলে',
  'মে-তে',
  'জুনে',
  'জুলাইয়ে',
  'আগস্টে',
  'সেপ্টেম্বরে',
  'অক্টোবরে',
  'নভেম্বরে',
  'ডিসেম্বরে',
];

export function inMonth(day: string, language: string): string {
  return language === 'bn'
    ? (IN_MONTH_BN[Number(day.slice(5, 7)) - 1] ?? '')
    : shortMonth(noonOf(day), language);
}
