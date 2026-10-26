import { LedgerEntryType } from '@lytronix/validators';
import { formatRate, formatTakaExact } from '@lytronix/ui';
import type { IconName } from '@/components/icon';
import { readLedgerReference } from '@/lib/ledger-reference';
import type { LedgerEntry } from '@/types/balance';
import type { BillingPayment } from '@/types/billing';

type T = (key: string, options?: Record<string, unknown>) => string;

/**
 * The statement's chips (TENANT-DASHBOARD-DESIGN §7.11, decided for 11.5b): All, Top-ups, SMS, Fees and Plan, each read
 * with every ledger type it covers at once (`type=a,b`, Slice 11.5a.3). Chat AI joins when its phase comes.
 */
export const STATEMENT_CHIPS: readonly { key: string; types: readonly LedgerEntryType[] }[] = [
  { key: 'all', types: [] },
  { key: 'topUps', types: [LedgerEntryType.TopUp] },
  { key: 'sms', types: [LedgerEntryType.Sms] },
  {
    key: 'fees',
    types: [
      LedgerEntryType.OrderFee,
      LedgerEntryType.ProductFee,
      LedgerEntryType.Extraction,
      LedgerEntryType.FraudCheck,
    ],
  },
  { key: 'plan', types: [LedgerEntryType.PlanPayment, LedgerEntryType.Addon] },
];

/** A row's lead, as the sketch draws them: SMS, a top-up's plus, and the percent of a charge. */
export function entryIcon(entry: LedgerEntry): IconName {
  if (entry.type === LedgerEntryType.Sms) return 'sms';
  if (entry.type === LedgerEntryType.TopUp) return 'plus';
  return 'percent';
}

/**
 * What a row says it was (decided for 11.5b): "Top-up · TrxID 9F2KQ7", "Plan · Starter · 1 month", "Add-on · 500
 * products", "Support adjustment · {reason}", "Carried over from your earlier shop", and each charge's own word. The
 * payment a top-up, plan or add-on row came from is read from Billing's list when it is there.
 */
export function entryTitle(
  entry: LedgerEntry,
  t: T,
  language: string,
  payment: BillingPayment | undefined,
): string {
  const word = t(`row.${entry.type}`);
  const reference = readLedgerReference(entry.reference);
  switch (entry.type) {
    case LedgerEntryType.TopUp:
      return payment?.transactionId
        ? `${word} · ${t('trx', { trx: payment.transactionId })}`
        : word;
    case LedgerEntryType.PlanPayment: {
      if (!payment?.planName) return word;
      const term = payment.billingTerm
        ? language === 'bn'
          ? payment.billingTerm.labelBn
          : payment.billingTerm.labelEn
        : null;
      return [word, payment.planName, term].filter(Boolean).join(' · ');
    }
    case LedgerEntryType.Addon: {
      const addon = payment?.addons[0];
      if (!addon) return word;
      return `${word} · ${language === 'bn' ? addon.labelBn : addon.labelEn}`;
    }
    case LedgerEntryType.Adjustment:
      return reference.reason ? `${word} · ${reference.reason}` : word;
    default:
      return word;
  }
}

/** A row's second line: units at the rate when it was a metered charge ("2 × ৳0.55"), then the time. */
export function entryDetail(entry: LedgerEntry, t: T, time: string): string {
  const units =
    entry.units !== null && entry.rateUsed !== null
      ? t('unitsAtRate', { units: formatRate(entry.units), rate: formatTakaExact(entry.rateUsed) })
      : null;
  return units ? `${units} · ${time}` : time;
}

/** The payment a ledger row came from, by the id its reference carries. */
export function paymentIdOf(entry: LedgerEntry): string | undefined {
  return readLedgerReference(entry.reference).planPaymentId;
}
