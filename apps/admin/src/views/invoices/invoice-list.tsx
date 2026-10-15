import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/types/billing';

interface InvoiceListProps {
  invoices: Invoice[];
  onView: (invoice: Invoice) => void;
}

/** Mobile cards below sm, a table from sm up — same split as every other list screen
    (ENGINEERING-STANDARDS.md §4). */
export function InvoiceList({ invoices, onView }: InvoiceListProps): React.JSX.Element {
  const { t } = useTranslation();

  if (invoices.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('invoices.noneYet')}</p>;
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {invoices.map((invoice) => (
          <button
            key={invoice.id}
            type="button"
            onClick={() => {
              onView(invoice);
            }}
            className="block w-full rounded-2xl bg-white p-4 text-left shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-900">
                {t('invoices.number', { number: invoice.number })}
              </p>
              <p className="font-semibold text-slate-900">{invoice.amount} TK</p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {new Date(invoice.issuedAt).toLocaleDateString()} · {invoice.billingTermLabel}
            </p>
          </button>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">{t('invoices.numberHeader')}</th>
              <th className="px-4 py-3 font-medium">{t('invoices.date')}</th>
              <th className="px-4 py-3 font-medium">{t('invoices.term')}</th>
              <th className="px-4 py-3 font-medium">{t('invoices.amount')}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
              >
                <td className="px-4 py-3 text-slate-900">#{invoice.number}</td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(invoice.issuedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-slate-600">{invoice.billingTermLabel}</td>
                <td className="px-4 py-3 text-slate-900">{invoice.amount} TK</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      onView(invoice);
                    }}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t('invoices.view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
