import { useTranslation } from 'react-i18next';
import type { Plan } from '@/types/billing-admin';

interface PlanListProps {
  plans: Plan[];
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}

/** Mobile cards below sm, a table from sm up — same split as RoleList (ENGINEERING-STANDARDS.md §4). */
export function PlanList({ plans, onEdit, onDelete }: PlanListProps): React.JSX.Element {
  const { t } = useTranslation();

  if (plans.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('operator.plans.noneYet')}</p>;
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-900">{plan.name}</p>
              <p className="text-xs text-slate-400">
                {t('operator.plans.rankLabel', { rank: plan.rank })}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {plan.forSale ? t('operator.plans.forSale') : t('operator.plans.notForSale')} ·{' '}
              {t('operator.plans.versionLabel', { version: plan.version })}
            </p>
            <div className="mt-3 flex gap-2 border-t border-dashed border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  onEdit(plan);
                }}
                className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(plan);
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
              <th className="px-4 py-3 font-medium">{t('operator.plans.name')}</th>
              <th className="px-4 py-3 font-medium">{t('operator.plans.rank')}</th>
              <th className="px-4 py-3 font-medium">{t('operator.plans.forSale')}</th>
              <th className="px-4 py-3 font-medium">{t('operator.plans.version')}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr
                key={plan.id}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
              >
                <td className="px-4 py-3 text-slate-900">{plan.name}</td>
                <td className="px-4 py-3 text-slate-600">{plan.rank}</td>
                <td className="px-4 py-3 text-slate-600">
                  {plan.forSale ? t('common.active') : t('common.disabled')}
                </td>
                <td className="px-4 py-3 text-slate-600">{plan.version}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(plan);
                    }}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(plan);
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
