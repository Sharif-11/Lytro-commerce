import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInvoices } from '@/api/billing';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/error-banner';
import { InvoiceDetail } from '@/views/invoices/invoice-detail';
import { InvoiceList } from '@/views/invoices/invoice-list';
import type { Invoice } from '@/types/billing';

/** Container (ENGINEERING-STANDARDS.md §2a) — the list already carries every field the detail panel needs
    (InvoiceListDto and InvoiceDto share the same shape), so "view" just holds the row itself locally
    instead of a second GET /billing/invoices/:id round trip. */
export function Invoices(): React.JSX.Element {
  const { t } = useTranslation();
  const invoices = useInvoices();
  const [selected, setSelected] = useState<Invoice | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('invoices.title')}</h1>

      {selected ? (
        <InvoiceDetail
          invoice={selected}
          onClose={() => {
            setSelected(null);
          }}
        />
      ) : null}

      {invoices.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {invoices.isError ? <ErrorBanner message={errorMessage(invoices.error, t)} /> : null}
      {invoices.data ? (
        <InvoiceList
          invoices={invoices.data}
          onView={(invoice) => {
            setSelected(invoice);
          }}
        />
      ) : null}
    </div>
  );
}
