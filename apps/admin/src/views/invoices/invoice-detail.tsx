import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/types/billing';

interface InvoiceDetailProps {
  invoice: Invoice;
  onClose: () => void;
}

/** BIL-12: a read-only panel over one invoice, including the plan-limits snapshot it carries — the
    snapshot is exactly what the tenant was sold at the time, not today's possibly-since-edited plan. */
export function InvoiceDetail({ invoice, onClose }: InvoiceDetailProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          {t('invoices.number', { number: invoice.number })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-500 hover:underline"
        >
          {t('common.close')}
        </button>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{t('invoices.date')}</dt>
          <dd className="text-slate-900">{new Date(invoice.issuedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('invoices.term')}</dt>
          <dd className="text-slate-900">{invoice.billingTermLabel}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('invoices.amount')}</dt>
          <dd className="text-slate-900">{invoice.amount} TK</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('invoices.creditAmount')}</dt>
          <dd className="text-slate-900">{invoice.creditAmount} TK</dd>
        </div>
      </dl>

      <div>
        <h3 className="mb-1.5 text-sm font-medium text-slate-700">{t('invoices.planSnapshot')}</h3>
        <ul className="space-y-1 text-sm text-slate-600">
          {Object.entries(invoice.planSnapshot).map(([key, value]) => (
            <li key={key}>
              {t(`billing.limit.${key}`, { defaultValue: key })}: {String(value)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
