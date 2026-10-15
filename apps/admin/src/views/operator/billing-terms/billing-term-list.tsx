import { useTranslation } from 'react-i18next';
import type { BillingTerm } from '@/types/billing-admin';

interface BillingTermListProps {
  terms: BillingTerm[];
  onEdit: (term: BillingTerm) => void;
  onDelete: (term: BillingTerm) => void;
}

/** Mobile cards below sm, a table from sm up — same split as RoleList (ENGINEERING-STANDARDS.md §4). Retired
    terms (retiredAt set) still show up here since the operator list intentionally includes them (TRM-01),
    just visually muted. */
export function BillingTermList({
  terms,
  onEdit,
  onDelete,
}: BillingTermListProps): React.JSX.Element {
  const { t } = useTranslation();

  if (terms.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        {t('operator.billingTerms.noneYet')}
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {terms.map((term) => (
          <div
            key={term.id}
            className={`rounded-2xl bg-white p-4 shadow-sm ${term.retiredAt ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-900">{term.labelEn}</p>
              <p className="text-xs text-slate-400">
                {t('operator.billingTerms.monthsCount', { count: term.months })}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {term.visible
                ? t('operator.billingTerms.visible')
                : t('operator.billingTerms.hidden')}
            </p>
            <div className="mt-3 flex gap-2 border-t border-dashed border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  onEdit(term);
                }}
                className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(term);
                }}
                className="flex-1 rounded-lg border border-red-200 py-1.5 text-xs font-medium text-red-600 hover:border-red-300"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">{t('operator.billingTerms.labelEn')}</th>
              <th className="px-4 py-3 font-medium">{t('operator.billingTerms.months')}</th>
              <th className="px-4 py-3 font-medium">{t('operator.billingTerms.visible')}</th>
              <th className="px-4 py-3 font-medium">
                {t('operator.billingTerms.defaultDiscountPct')}
              </th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {terms.map((term) => (
              <tr
                key={term.id}
                className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 ${term.retiredAt ? 'opacity-60' : ''}`}
              >
                <td className="px-4 py-3 text-slate-900">{term.labelEn}</td>
                <td className="px-4 py-3 text-slate-600">{term.months}</td>
                <td className="px-4 py-3 text-slate-600">
                  {term.visible
                    ? t('operator.billingTerms.visible')
                    : t('operator.billingTerms.hidden')}
                </td>
                <td className="px-4 py-3 text-slate-600">{term.defaultDiscountPct ?? '-'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(term);
                    }}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(term);
                    }}
                    className="ml-3 font-medium text-red-600 hover:underline"
                  >
                    {t('common.delete')}
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
