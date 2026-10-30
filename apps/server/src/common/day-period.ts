import { FieldProblemCode } from '@lytronix/validators';
import { FieldsError } from './api-error';
import { DAY_MS, dhakaDate, dhakaDayStart } from './time';

/** A period of whole Asia/Dhaka days, both ends included, and the instants it runs between (the end not included). */
export interface DayPeriod {
  dateFrom: string;
  dateTo: string;
  from: Date;
  to: Date;
}

/**
 * INV-18, STA-01: the period a query asks for. Left out, it ends today and starts on the first of the month it ends in;
 * one that ends before it starts, or runs longer than `maxDays`, is refused on its start date.
 */
export function dayPeriodOf(
  query: { dateFrom?: string | undefined; dateTo?: string | undefined },
  now: Date,
  maxDays?: number,
): DayPeriod {
  const dateTo = query.dateTo ?? dhakaDate(now);
  const dateFrom = query.dateFrom ?? `${dateTo.slice(0, 7)}-01`;
  if (dateFrom > dateTo) {
    throw new FieldsError([
      {
        field: 'dateFrom',
        problem: FieldProblemCode.NotAllowed,
        messageKey: 'PeriodEndsBeforeItStarts',
      },
    ]);
  }
  const from = dhakaDayStart(dateFrom);
  const to = new Date(dhakaDayStart(dateTo).getTime() + DAY_MS);
  if (maxDays !== undefined && (to.getTime() - from.getTime()) / DAY_MS > maxDays) {
    throw new FieldsError([
      {
        field: 'dateFrom',
        problem: FieldProblemCode.NotAllowed,
        messageKey: 'PeriodTooLong',
        params: { days: maxDays },
      },
    ]);
  }
  return { dateFrom, dateTo, from, to };
}
