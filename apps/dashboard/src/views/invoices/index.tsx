import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInvoices } from '@/api/billing';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { Card, EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { formatDate, formatDateTime } from '@/lib/dates';
import { ErrorBanner } from '@/components/ui/notice';
import { formatTaka } from '@/lib/money';
import type { Invoice } from '@/types/billing';

/** BIL-12/13: every invoice, including an earlier deleted shop's for the owner (LIF-21); the detail shows the
    plan-limits snapshot as sold at the time. */
export function Invoices(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const invoices = useInvoices();
  const [selected, setSelected] = useState<Invoice | null>(null);

  return (
    <Page>
      <PageHeader title={t('invoices.title')} />
      {selected ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[16px] font-bold text-ink">
              {t('invoices.number', { number: selected.number })}
            </h2>
            <Button
              type="button"
              tone="ghost"
              fit
              onClick={() => {
                setSelected(null);
              }}
            >
              {t('common.close')}
            </Button>
          </div>
          <dl className="num mt-3 grid gap-3 text-[14px] sm:grid-cols-2">
            <Row
              label={t('invoices.date')}
              value={formatDateTime(selected.issuedAt, i18n.language)}
            />
            <Row label={t('invoices.term')} value={selected.billingTermLabel} />
            <Row label={t('invoices.amount')} value={formatTaka(selected.amount)} />
            <Row label={t('invoices.creditAmount')} value={formatTaka(selected.creditAmount)} />
            {selected.planName ? (
              <Row label={t('invoices.plan')} value={selected.planName} />
            ) : null}
            {selected.periodStart && selected.periodEnd ? (
              <Row
                label={t('invoices.period')}
                value={`${formatDate(selected.periodStart, i18n.language)} – ${formatDate(selected.periodEnd, i18n.language)}`}
              />
            ) : null}
            {selected.paymentMethod ? (
              <Row
                label={t('invoices.paymentMethod')}
                value={`${t(`invoices.method.${selected.paymentMethod}`)}${selected.paymentReference ? ` · ${selected.paymentReference}` : ''}`}
              />
            ) : null}
          </dl>
          <h3 className="mt-4 text-[14px] font-bold text-ink">{t('invoices.planSnapshot')}</h3>
          <ul className="num mt-1 grid gap-1 text-[14px] text-neutral-700 sm:grid-cols-2">
            {Object.entries(selected.planSnapshot).map(([key, value]) => (
              <li key={key}>
                {t(`plans.limit.${key}`, { defaultValue: key })}:{' '}
                <span className="text-ink">
                  {value === null ? t('plans.unlimited') : String(value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {invoices.isLoading ? (
        <p className="text-center text-[15px] text-neutral-700">{t('common.loading')}</p>
      ) : null}
      {invoices.isError ? <ErrorBanner message={errorMessage(invoices.error, t)} /> : null}
      {invoices.data && invoices.data.length === 0 ? (
        <EmptyLine>{t('invoices.noneYet')}</EmptyLine>
      ) : null}
      {invoices.data && invoices.data.length > 0 ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-white shadow-card">
          {invoices.data.map((invoice) => (
            <li key={invoice.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(invoice);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <p className="num flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
                    {t('invoices.number', { number: invoice.number })}
                    {invoice.earlierShop ? (
                      <Tag tone="neutral">{t('invoices.earlierShop')}</Tag>
                    ) : null}
                  </p>
                  <p className="num text-[13px] text-neutral-700">
                    {formatDate(invoice.issuedAt, i18n.language)} · {invoice.billingTermLabel}
                  </p>
                </div>
                <p className="num shrink-0 text-[15px] font-bold text-ink">
                  {formatTaka(invoice.amount)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-neutral-700">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
