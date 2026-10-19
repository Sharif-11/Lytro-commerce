import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useInvoices } from '@/api/billing';
import { errorMessage } from '@lytronix/api-client';
import {
  EmptyLine,
  ErrorBanner,
  formatDate,
  formatTaka,
  Icon,
  Page,
  PageHeader,
  Tag,
} from '@lytronix/ui';
import { Sheet } from '@/components/ui/sheet';
import type { Invoice } from '@/types/billing';

/** BIL-12/13: the list with number, plan, date, term and amount; the invoice itself opens in a sheet with
    every line the SRS names and the limits snapshot under a disclosure. */
export function Invoices(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { shop } = useParams({ from: '/$shop/invoices' });
  const invoices = useInvoices();
  const [open, setOpen] = useState<Invoice | null>(null);

  return (
    <Page narrow>
      <div>
        <p className="flex items-center gap-1.5 text-[13px] text-neutral-700">
          <Link to="/$shop/plan" params={{ shop }} className="font-semibold text-brand-800">
            {t('more.plan')}
          </Link>
          <Icon name="next" size={14} />
          <span>{t('invoices.title')}</span>
        </p>
        <PageHeader title={t('invoices.title')} />
      </div>
      {invoices.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {invoices.isError ? <ErrorBanner message={errorMessage(invoices.error, t)} /> : null}
      {invoices.data && invoices.data.length === 0 ? (
        <EmptyLine>{t('invoices.noneYet')}</EmptyLine>
      ) : null}
      {invoices.data && invoices.data.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          {invoices.data.map((invoice) => (
            <button
              key={invoice.id}
              type="button"
              onClick={() => {
                setOpen(invoice);
              }}
              className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0 hover:bg-neutral-50"
            >
              <div className="min-w-0 flex-1">
                <p className="num flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
                  #{invoice.number}
                  {invoice.planName ? <span>· {invoice.planName}</span> : null}
                  {invoice.earlierShop ? (
                    <Tag tone="neutral">{t('invoices.earlierShop')}</Tag>
                  ) : null}
                </p>
                <p className="num text-[13px] text-neutral-700">
                  {formatDate(invoice.issuedAt, i18n.language)} · {invoice.billingTermLabel}
                  {invoice.paymentMethod
                    ? ` · ${t(`invoices.method.${invoice.paymentMethod}`)}`
                    : ''}
                </p>
              </div>
              <span className="num text-[16px] font-bold text-ink">
                {formatTaka(invoice.amount)}
              </span>
              <span className="text-neutral-400">
                <Icon name="next" size={18} />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <Sheet
        open={open !== null}
        title={open ? `#${String(open.number)}${open.planName ? ` · ${open.planName}` : ''}` : ''}
        onClose={() => {
          setOpen(null);
        }}
      >
        {open ? <InvoiceDetail invoice={open} /> : null}
      </Sheet>
    </Page>
  );
}

function InvoiceDetail({ invoice }: { invoice: Invoice }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const date = (iso: string | null | undefined): string =>
    iso ? formatDate(iso, i18n.language) : '—';
  const rows: [string, string][] = [
    [t('invoices.issued'), date(invoice.issuedAt)],
    [t('invoices.period'), `${date(invoice.periodStart)} – ${date(invoice.periodEnd)}`],
    [
      t('invoices.plan'),
      `${invoice.planName ?? '—'}${invoice.planVersion ? ` v${String(invoice.planVersion)}` : ''} · ${invoice.billingTermLabel}`,
    ],
    [t('invoices.price'), formatTaka(Number(invoice.amount) + Number(invoice.creditAmount))],
    [t('invoices.discount'), formatTaka(invoice.discountAmount ?? '0')],
    [t('invoices.credit'), `−${formatTaka(invoice.creditAmount)}`],
    [t('invoices.paid'), formatTaka(invoice.amount)],
    [
      t('invoices.paidBy'),
      invoice.paymentMethod
        ? `${t(`invoices.method.${invoice.paymentMethod}`)}${invoice.paymentReference ? ` · ${invoice.paymentReference}` : ''}`
        : '—',
    ],
    [
      t('invoices.billedTo'),
      [invoice.shopName, invoice.ownerName].filter(Boolean).join(' · ') || '—',
    ],
  ];
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-dashed divide-line text-[14px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 py-2">
            <dt className="text-neutral-700">{label}</dt>
            <dd className="num text-right font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <details className="text-[14px] text-neutral-700">
        <summary className="cursor-pointer font-semibold text-ink">
          {t('invoices.limitsOnInvoice')}
        </summary>
        <dl className="mt-2 divide-y divide-dashed divide-line">
          {Object.entries(invoice.planSnapshot).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 py-1.5">
              <dt>{t(`plan.limit.${key}`, { defaultValue: key })}</dt>
              <dd className="num font-semibold text-ink">
                {value === null ? t('plan.unlimited') : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="text-[13px] text-neutral-700">{t('invoices.pdfLater')}</p>
    </div>
  );
}
