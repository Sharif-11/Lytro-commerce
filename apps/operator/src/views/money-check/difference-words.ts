import type { TFunction } from 'i18next';
import { ReconciliationDifferenceKind } from '@lytronix/validators';
import type { ReconciliationDifference } from '@/types/operator';

/** Money to the paisa, as a difference must read: ৳500.00, ৳1,280.00. */
export function exactTaka(value: string): string {
  return `৳${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function invoiceCount(count: number, t: TFunction): string {
  return count === 0 ? t('moneyCheck.noInvoice') : t('moneyCheck.invoices', { count });
}

/**
 * DAT-52 (Slice 9.9): what a difference should be and what was found, in words. Amounts are taka to the paisa; an
 * invoice count reads as one ("1 invoice") against what was found ("No invoice", "2 invoices"); nothing is a dash.
 */
export function differenceFigures(
  difference: ReconciliationDifference,
  t: TFunction,
): { expected: string; found: string } {
  if (difference.kind === ReconciliationDifferenceKind.InvoiceMismatch) {
    const found = Number(difference.details['invoices'] ?? 0);
    return { expected: invoiceCount(1, t), found: invoiceCount(found, t) };
  }
  return {
    expected: difference.expected === null ? '—' : exactTaka(difference.expected),
    found: difference.found === null ? '—' : exactTaka(difference.found),
  };
}

/** Where a difference can be looked at: its shop, and the payment still in the queue or Lytro's receipt. */
export type DifferenceLink =
  { kind: 'shop'; shopId: string } | { kind: 'payment'; paymentId: string } | { kind: 'receipt' };

// Only a payment still waiting is in the queue the console opens a payment from; verified ones show on the shop's page.
const QUEUED: readonly ReconciliationDifferenceKind[] = [
  ReconciliationDifferenceKind.ProofWithoutPayment,
];

export function differenceLinks(difference: ReconciliationDifference): DifferenceLink[] {
  const links: DifferenceLink[] = [];
  if (difference.tenantId) links.push({ kind: 'shop', shopId: difference.tenantId });
  if (QUEUED.includes(difference.kind))
    links.push({ kind: 'payment', paymentId: difference.subject });
  if (difference.kind === ReconciliationDifferenceKind.WalletMoneyUnclaimed) {
    links.push({ kind: 'receipt' });
  }
  return links;
}
