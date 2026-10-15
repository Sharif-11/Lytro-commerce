import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import type { BillingTerm, Plan } from '@/types/billing-admin';

export type PlanAction = 'purchase' | 'renew' | 'upgrade' | 'downgrade';

interface PlanGridProps {
  plans: Plan[];
  terms: BillingTerm[];
  selectedTermId: string;
  onSelectTerm: (id: string) => void;
  currentPlan: Plan | null;
  tenantState: TenantState;
  onAction: (plan: Plan, action: PlanAction) => void;
  actionPending: boolean;
}

/** PLN-12: every limit/feature comes from the real plans response, nothing hard-coded here. No price shows
    on the grid itself — BIL-01's quote (PurchaseService/UpgradeService) is the only source of a real price,
    so a price only appears once a plan is actually quoted, same as the balance top-up flow. Action per plan
    mirrors the server's own eligibility rules (PurchaseService/UpgradeService/DowngradeService): upgrade and
    downgrade only make sense while `active` with a real current plan; everything else is a plain purchase
    (first purchase, or buying again out of a lapsed state), and the current plan while `active`/`grace`
    offers a renewal instead of a no-op "current" label. */
export function PlanGrid({
  plans,
  terms,
  selectedTermId,
  onSelectTerm,
  currentPlan,
  tenantState,
  onAction,
  actionPending,
}: PlanGridProps): React.JSX.Element {
  const { t } = useTranslation();

  function actionFor(plan: Plan): PlanAction | null {
    if (currentPlan && plan.id === currentPlan.id) {
      return tenantState === TenantState.Active || tenantState === TenantState.Grace
        ? 'renew'
        : null;
    }
    if (tenantState === TenantState.Active && currentPlan) {
      return plan.rank > currentPlan.rank ? 'upgrade' : 'downgrade';
    }
    return 'purchase';
  }

  const actionLabelKeys: Record<PlanAction, string> = {
    purchase: 'billing.choosePlan',
    renew: 'billing.renew',
    upgrade: 'billing.upgrade',
    downgrade: 'billing.downgrade',
  };

  return (
    <div className="space-y-4">
      <label className="block max-w-xs">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {t('billing.billingTerm')}
        </span>
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm"
          value={selectedTermId}
          onChange={(event) => {
            onSelectTerm(event.target.value);
          }}
        >
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.labelEn}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const action = actionFor(plan);
          const isCurrent = currentPlan?.id === plan.id;
          return (
            <div
              key={plan.id}
              className={`space-y-3 rounded-2xl bg-white p-5 shadow-sm ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}
            >
              <div>
                <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
                {isCurrent ? (
                  <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    {t('billing.currentPlan')}
                  </span>
                ) : null}
                {plan.description ? (
                  <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                ) : null}
              </div>

              <ul className="space-y-1 text-sm text-slate-600">
                {Object.entries(plan.limits).map(([key, value]) => (
                  <li key={key}>
                    {t(`billing.limit.${key}`, { defaultValue: key })}: {String(value)}
                  </li>
                ))}
              </ul>

              {action ? (
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => {
                    onAction(plan, action);
                  }}
                  className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t(actionLabelKeys[action])}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
