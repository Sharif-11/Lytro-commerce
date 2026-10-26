import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BillingPaymentState, PlanPaymentKind } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import { Icon } from '@/components/icon';
import { StatusTag, type StatusTone } from '@/components/ui/status-tag';
import { formatDayMonthYear } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import type { BillingPayment } from '@/types/billing';
import { invoiceNumber, lapsesInHours, methodWords, paymentName } from './payment-words';

/** Each state as the seller reads it (TENANT-DASHBOARD-DESIGN §7.13): its chip, its lead's tint and its word. */
const STATES: Record<BillingPaymentState, { tone: StatusTone; lead: string; word: string }> = {
  [BillingPaymentState.Awaiting]: {
    tone: 'neutral',
    lead: 'bg-warning-soft text-warning',
    word: 'blAwaiting',
  },
  [BillingPaymentState.Checking]: {
    tone: 'info',
    lead: 'bg-info-soft text-info',
    word: 'blChecking',
  },
  [BillingPaymentState.Paid]: { tone: 'ok', lead: 'bg-success-soft text-success', word: 'blPaid' },
  [BillingPaymentState.Rejected]: {
    tone: 'bad',
    lead: 'bg-danger-soft text-danger',
    word: 'blRejected',
  },
  [BillingPaymentState.Expired]: {
    tone: 'neutral',
    lead: 'bg-neutral-100 text-neutral-700',
    word: 'expired',
  },
  [BillingPaymentState.Cancelled]: {
    tone: 'neutral',
    lead: 'bg-neutral-100 text-neutral-700',
    word: 'blCancelled',
  },
};

/** A payment's state chip. */
export function PaymentState({ state }: { state: BillingPaymentState }): React.JSX.Element {
  const { t } = useTranslation('money');
  return <StatusTag tone={STATES[state].tone}>{t(STATES[state].word)}</StatusTag>;
}

/**
 * One payment in Billing's list (the prototype's `blRow`): the lead tinted by its state, what it was for, the date,
 * how it went, its invoice and, while it waits for a payment, the hours before it lapses; the amount over its chip.
 */
export function PaymentRow({
  payment,
  selected,
}: {
  payment: BillingPayment;
  selected: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const { slug } = useShell();
  const state = STATES[payment.state];
  const line = [
    formatDayMonthYear(payment.quotedAt),
    methodWords(payment, t),
    payment.invoice ? invoiceNumber(payment.invoice.number, t) : null,
    payment.state === BillingPaymentState.Awaiting
      ? t('blLapses', { hours: lapsesInHours(payment) })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      to="/$shop/billing/$paymentId"
      params={{ shop: slug, paymentId: payment.id }}
      aria-current={selected ? 'true' : undefined}
      className={[
        'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-inherit no-underline',
        selected ? 'bg-primary-soft' : '',
      ].join(' ')}
    >
      <span
        className={`flex size-10 flex-none items-center justify-center rounded-[8px] ${state.lead}`}
      >
        <Icon name={payment.kind === PlanPaymentKind.TopUp ? 'plus' : 'banknote'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-medium">
          {paymentName(payment, t, i18n.language)}
          {payment.earlierShop ? (
            <>
              {' '}
              <StatusTag tone="neutral">{t('earlierShop')}</StatusTag>
            </>
          ) : null}
        </span>
        <span className="num truncate text-[14px] text-fg-muted">{line}</span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-4 lg:flex-col lg:items-end lg:gap-1">
        <span className="num text-[16px] font-semibold">{formatTaka(payment.amount)}</span>
        <PaymentState state={payment.state} />
      </span>
    </Link>
  );
}
