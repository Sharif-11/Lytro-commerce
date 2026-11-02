import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { StatusTag } from '@/components/ui/status-tag';
import { dayLabel, formatDayMonth } from '@/lib/dates';
import { initialOf } from '@/lib/initial';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import type { CustomerSummary } from '@/types/customers';
import { customerName } from './customer-words';

/**
 * One customer (the prototype's `c30Row`): their initial, name, phone, orders and spend; their last order over
 * Has an account, for a storefront account (CUS-02).
 */
export function CustomerRow({
  customer,
  selected = false,
  search,
  wide = false,
}: {
  customer: CustomerSummary;
  selected?: boolean;
  search?: { q?: string };
  /** On a page of its own (the search), not the list beside an open customer. */
  wide?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { slug } = useShell();
  const name = customerName(customer);
  const day = customer.lastOrderAt ? dayLabel(customer.lastOrderAt) : null;
  const when = !day
    ? null
    : day.kind === 'today'
      ? t('lastToday')
      : day.kind === 'yesterday'
        ? t('lastYesterday')
        : formatDayMonth(day.iso);
  return (
    <Link
      to="/$shop/customers/$customerId"
      params={{ shop: slug, customerId: customer.id }}
      search={search}
      aria-current={selected ? 'page' : undefined}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-[inherit] no-underline ${selected ? 'bg-primary-soft' : ''}`}
    >
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-brand-100 font-semibold text-primary-text">
        {initialOf(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-medium">{name}</span>
        <span className="num truncate text-[14px] text-fg-muted">
          {[
            customer.phone ? bangladeshiPhone.grouped(customer.phone) : null,
            t('ordersN', { count: customer.orderCount }),
            t('spentTotal', { amount: formatTaka(customer.totalSpent) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span
        className={`flex flex-none flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-4 ${wide ? '' : 'lg:flex-col lg:items-end lg:gap-1'}`}
      >
        {when ? (
          <span className="text-[13px] text-fg-subtle">{t('lastOrder', { day: when })}</span>
        ) : null}
        {customer.hasAccount ? <StatusTag tone="neutral">{t('hasAccount')}</StatusTag> : null}
      </span>
    </Link>
  );
}
