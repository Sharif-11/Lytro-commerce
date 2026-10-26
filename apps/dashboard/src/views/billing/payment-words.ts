import { BillingPaymentState, PaymentCancelReason, PlanPaymentKind } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import type { BillingPayment, Invoice } from '@/types/billing';

// BIL-15: a request nothing was sent for lapses this long after it was made.
const LAPSE_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

type T = (key: string, options?: Record<string, unknown>) => string;

/** The term's words in the language shown, or none. */
function termOf(payment: BillingPayment, language: string): string {
  const term = payment.billingTerm;
  if (!term) return '';
  return language === 'bn' ? term.labelBn : term.labelEn;
}

/** An add-on's name with its quantity, as the add-ons screen names it: "500 products" is "×1"; a pack of two is "×2". */
function addonName(payment: BillingPayment, language: string): string {
  const addon = payment.addons[0];
  if (!addon) return '';
  const label = language === 'bn' ? addon.labelBn : addon.labelEn;
  return addon.quantity > 1 ? `${label} ×${String(addon.quantity)}` : label;
}

/**
 * What a payment was for, as Billing's row and screen name it (TENANT-DASHBOARD-DESIGN §7.13): "Starter · 1 month ·
 * renewal", "Balance top-up", "Upgrade to Growth", "Add-on · 500 products".
 */
export function paymentName(payment: BillingPayment, t: T, language: string): string {
  const plan = payment.planName ?? '';
  const term = termOf(payment, language);
  switch (payment.kind) {
    case PlanPaymentKind.TopUp:
      return t('blTopUp');
    case PlanPaymentKind.Renewal:
      return t('blRenewal', { plan, term });
    case PlanPaymentKind.Purchase:
      return t('blFirst', { plan, term });
    case PlanPaymentKind.Upgrade:
      return t('upTitle', { plan });
    case PlanPaymentKind.Addon:
      return t('blAddon', { name: addonName(payment, language) });
  }
}

/** The payment's "For" line: the plan, its term and period; the amount a top-up adds; the add-on. */
export function forLine(
  payment: BillingPayment,
  t: T,
  language: string,
  period: string | null,
): string {
  if (payment.kind === PlanPaymentKind.TopUp) {
    const amount = formatTaka(payment.amount);
    return payment.state === BillingPaymentState.Paid
      ? t('blForTopUpDone', { amount })
      : t('blForTopUp', { amount });
  }
  if (payment.kind === PlanPaymentKind.Addon) return addonName(payment, language);
  const plan = payment.planName ?? '';
  const term = termOf(payment, language);
  return period ? t('blForPlan', { plan, term, period }) : t('blFirst', { plan, term });
}

/**
 * How a payment went (§7.13): from the balance, or by its TrxID -- which wallet is not recorded until Phase 5's page --
 * or nothing sent.
 */
export function methodWords(payment: BillingPayment, t: T): string {
  if (payment.method === 'balance') return t('psBalance');
  if (payment.transactionId) return t('trx', { trx: payment.transactionId });
  return t('blNoTrx');
}

/** BIL-15: whole hours, rounded up, before a request nothing was sent for lapses; 0 once it has. */
export function lapsesInHours(payment: Pick<BillingPayment, 'quotedAt'>, now = Date.now()): number {
  const left = Date.parse(payment.quotedAt) + LAPSE_HOURS * HOUR_MS - now;
  return Math.max(0, Math.ceil(left / HOUR_MS));
}

/** When a request nothing was sent for lapsed (BIL-15). */
export function lapsedAt(payment: Pick<BillingPayment, 'quotedAt'>): string {
  return new Date(Date.parse(payment.quotedAt) + LAPSE_HOURS * HOUR_MS).toISOString();
}

/** An invoice's number as the shop's invoices are numbered: "INV-000214". */
export function invoiceNumber(number: number, t: T): string {
  return t('invoiceNo', { number: String(number).padStart(6, '0') });
}

/** One step of "What happened", newest first: its words, a line under them, when, and its dot. */
export interface TimelineStep {
  key: string;
  text: string;
  sub: string | null;
  at: string | null;
  /** The time is now, not a moment (the check under way). */
  now?: boolean;
  dot: 'on' | 'bad' | 'plain';
}

/**
 * "What happened" for a payment (§7.13): requested; sent (the TrxID) or paid from the balance; then checking,
 * confirmed with its invoice, rejected with support's note, lapsed after 24 hours, or cancelled -- by the shop, or by
 * its newer request.
 */
export function timelineOf(payment: BillingPayment, t: T, invoice: Invoice | null): TimelineStep[] {
  const requested: TimelineStep = {
    key: 'requested',
    text: t('blTlRequested'),
    sub: null,
    at: payment.quotedAt,
    dot: 'on',
  };
  const sent: TimelineStep | null =
    payment.method === 'balance'
      ? {
          key: 'sent',
          text: t('blTlBalance'),
          sub: null,
          at: payment.submittedAt ?? payment.verifiedAt,
          dot: 'on',
        }
      : payment.transactionId
        ? {
            key: 'sent',
            text: t('blTlSubmittedTrx', { trx: payment.transactionId }),
            sub: null,
            at: payment.submittedAt ?? null,
            dot: 'on',
          }
        : null;
  const after = [sent, requested].filter((step): step is TimelineStep => step !== null);
  switch (payment.state) {
    case BillingPaymentState.Checking:
      return [
        {
          key: 'checking',
          text: t('blTlChecking'),
          sub: t('blTlChecking2'),
          at: null,
          now: true,
          dot: 'plain',
        },
        ...after,
      ];
    case BillingPaymentState.Paid: {
      const what =
        payment.kind === PlanPaymentKind.TopUp
          ? t('blForTopUpDone', { amount: formatTaka(payment.amount) })
          : payment.invoice
            ? `${t('blInvoice')} ${invoiceNumber(invoice?.number ?? payment.invoice.number, t)}`
            : '';
      return [
        {
          key: 'paid',
          text: t('blTlPaid', { what }),
          sub: null,
          at: payment.verifiedAt,
          dot: 'on',
        },
        ...(payment.method === 'balance' ? [requested] : after),
      ];
    }
    case BillingPaymentState.Rejected:
      return [
        {
          key: 'rejected',
          text: t('blTlRejected'),
          sub: payment.note ?? null,
          at: payment.verifiedAt,
          dot: 'bad',
        },
        ...after,
      ];
    case BillingPaymentState.Expired:
      return [
        { key: 'expired', text: t('blTlExpired'), sub: null, at: lapsedAt(payment), dot: 'plain' },
        requested,
      ];
    case BillingPaymentState.Cancelled:
      return [
        {
          key: 'cancelled',
          text:
            payment.cancelReason === PaymentCancelReason.Replaced
              ? t('blTlReplaced')
              : t('blTlCancelled'),
          sub: t('blNoTrx'),
          at: payment.verifiedAt,
          dot: 'plain',
        },
        requested,
      ];
    case BillingPaymentState.Awaiting:
      return [{ ...requested, sub: t('blNoTrx') }];
  }
}
