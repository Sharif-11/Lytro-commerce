import { daysBetween, daysUntil } from '../../../common/time';
import { divideRounded, fromPaisa, toPaisa } from '../../balance/services/money';

/** The plan period an add-on is bought into: it runs from now to the period's end. */
export interface AddonPeriod {
  start: Date;
  end: Date;
  /** The months the shop's billing term covers; null for a period with no term (an operator's assignment, PLN-12). */
  months: number | null;
}

// PLN-14: how many days a month of a period with no billing term counts.
const MONTH_DAYS = 30;

/**
 * PLN-14: what `quantity` of an add-on priced `monthly` (whole taka a month) costs from now to its period's end, in whole
 * taka, half up (UPG-03's rounding). A period costs the monthly price times its term's months, and a part of it the
 * share its days left are of its days -- more than all of it when the shop renewed early (BIL-10) and the period has
 * not begun. A period with no term costs a month per 30 days. Worked in paisa (DAT-05).
 */
export function addonPrice(
  monthly: string,
  quantity: number,
  period: AddonPeriod,
  now: Date,
): number {
  const leftDays = BigInt(daysUntil(now, period.end));
  const perMonth = toPaisa(monthly) * BigInt(quantity);
  const paisa =
    period.months === null
      ? divideRounded(perMonth * leftDays, BigInt(MONTH_DAYS))
      : divideRounded(
          perMonth * BigInt(period.months) * leftDays,
          BigInt(Math.max(daysBetween(period.start, period.end), 1)),
        );
  return Number(divideRounded(paisa, 100n));
}

/**
 * PLN-14, UPG-14: what `quantity` of an add-on priced `monthly` costs for a whole new period of `months` -- the term's
 * months when it renews with the plan, one for its own 30 days (pay-as-you-go, a plan with no end) -- as money. Whole
 * taka times whole numbers, so nothing is rounded.
 */
export function renewalPrice(monthly: string, quantity: number, months: number): string {
  return fromPaisa(toPaisa(monthly) * BigInt(quantity * months));
}
