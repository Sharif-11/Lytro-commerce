import { InvoiceKind } from '@lytronix/validators';
import { daysBetween, daysUntil } from '../../../common/time';
import { divideRounded, toPaisa } from '../../balance/services/money';
import type { InvoiceRecord } from '../../payments/types/invoice';

// The invoices that paid for a plan period; an add-on's own invoice paid for no plan.
const PLAN_INVOICES: ReadonlySet<InvoiceKind> = new Set([
  InvoiceKind.Purchase,
  InvoiceKind.Renewal,
  InvoiceKind.Upgrade,
]);

/**
 * The plan periods the shop holds now: from the newest purchase or upgrade -- each starts the plan's time afresh, and
 * an upgrade already took the time before it as its credit -- through every renewal after it (BIL-10).
 */
function currentPeriods(invoices: readonly InvoiceRecord[]): InvoiceRecord[] {
  const newestFirst = invoices
    .filter((invoice) => PLAN_INVOICES.has(invoice.kind))
    .sort((a, b) => b.number - a.number);
  const start = newestFirst.findIndex((invoice) => invoice.kind !== InvoiceKind.Renewal);
  return start === -1 ? newestFirst : newestFirst.slice(0, start + 1);
}

/**
 * UPG-03 (KNOWN-GAPS §84): the plan time a shop has paid for and not used yet, in whole taka (half up) -- each period it
 * holds that has not ended, at what it cost (an upgrade's own credit added back, since that part was paid too), for
 * the whole days left in it; a period paid ahead by an early renewal (BIL-10) counts in full. Worked in paisa (DAT-05).
 */
export function unusedPlanValue(invoices: readonly InvoiceRecord[], now: Date): number {
  let paisa = 0n;
  for (const invoice of currentPeriods(invoices)) {
    const { periodStart, periodEnd } = invoice;
    if (!periodStart || !periodEnd || periodEnd <= now) continue;
    const totalDays = daysBetween(periodStart, periodEnd);
    if (totalDays <= 0) continue;
    const leftDays = periodStart > now ? totalDays : Math.min(daysUntil(now, periodEnd), totalDays);
    const cost = toPaisa(invoice.amount) + toPaisa(invoice.creditAmount);
    paisa += divideRounded(cost * BigInt(leftDays), BigInt(totalDays));
  }
  return Number(divideRounded(paisa, 100n));
}
