import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreatePlan,
  useDeletePlan,
  useOperatorPlanPrices,
  useOperatorPlanVersions,
  useOperatorPlans,
  useRemovePlanPrice,
  useSetPlanPrice,
  useUpdatePlan,
} from '@/api/operator-plans';
import { useOperatorBillingTerms } from '@/api/operator-billing-terms';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PlanForm, type PlanFormValues } from '@/views/operator/plans/plan-form';
import { PlanList } from '@/views/operator/plans/plan-list';
import { PlanDetailPanel } from '@/views/operator/plans/plan-detail-panel';
import type { Plan } from '@/types/billing-admin';

type Panel = { mode: 'create' } | { mode: 'edit'; plan: Plan } | null;

/** Container (ENGINEERING-STANDARDS.md §2a) — same CRUD-with-a-panel shape as Roles/BillingTerms, plus the
    per-term price matrix and read-only version history for whichever plan is currently open for edit. */
export function OperatorPlans(): React.JSX.Element {
  const { t } = useTranslation();
  const plans = useOperatorPlans();
  const billingTerms = useOperatorBillingTerms();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const setPlanPrice = useSetPlanPrice();
  const removePlanPrice = useRemovePlanPrice();
  const [panel, setPanel] = useState<Panel>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const editingPlanId = panel?.mode === 'edit' ? panel.plan.id : null;
  const planPrices = useOperatorPlanPrices(editingPlanId);
  const planVersions = useOperatorPlanVersions(editingPlanId);

  const formPending = createPlan.isPending || updatePlan.isPending;
  const formError = createPlan.error ?? updatePlan.error;

  function closePanel(): void {
    setPanel(null);
    createPlan.reset();
    updatePlan.reset();
  }

  function handleSubmit(values: PlanFormValues): void {
    if (panel?.mode === 'create') {
      createPlan.mutate(values, { onSuccess: closePanel });
      return;
    }
    if (panel?.mode === 'edit') {
      updatePlan.mutate({ id: panel.plan.id, ...values });
    }
  }

  function closeDeleteConfirm(): void {
    setDeleteTarget(null);
    deletePlan.reset();
  }

  function confirmDelete(): void {
    if (!deleteTarget) return;
    deletePlan.mutate(deleteTarget.id, { onSuccess: closeDeleteConfirm });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {t('operator.plans.title')}
          </h1>
          {plans.data ? (
            <p className="mt-1 text-sm text-slate-500">
              {t('operator.plans.count', { count: plans.data.length })}
            </p>
          ) : null}
        </div>
        {panel === null ? (
          <Button
            type="button"
            variant="primary"
            className="w-auto! shrink-0"
            onClick={() => {
              setPanel({ mode: 'create' });
            }}
          >
            {t('operator.plans.addPlan')}
          </Button>
        ) : null}
      </div>

      {panel !== null ? (
        <>
          <PlanForm
            mode={panel.mode}
            initial={panel.mode === 'edit' ? panel.plan : undefined}
            onCancel={closePanel}
            onSubmit={handleSubmit}
            pending={formPending}
            error={formError ? errorMessage(formError, t) : null}
          />
          {panel.mode === 'edit' ? (
            <PlanDetailPanel
              terms={billingTerms.data ?? []}
              prices={planPrices.data ?? []}
              onSetPrice={(billingTermId, price) => {
                setPlanPrice.mutate({ planId: panel.plan.id, billingTermId, price });
              }}
              onRemovePrice={(billingTermId) => {
                removePlanPrice.mutate({ planId: panel.plan.id, billingTermId });
              }}
              pricePending={setPlanPrice.isPending || removePlanPrice.isPending}
              priceError={
                setPlanPrice.error
                  ? errorMessage(setPlanPrice.error, t)
                  : removePlanPrice.error
                    ? errorMessage(removePlanPrice.error, t)
                    : null
              }
              versions={planVersions.data}
              versionsLoading={planVersions.isLoading}
            />
          ) : null}
        </>
      ) : null}

      {plans.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {plans.isError ? <ErrorBanner message={errorMessage(plans.error, t)} /> : null}
      {plans.data ? (
        <PlanList
          plans={plans.data}
          onEdit={(plan) => {
            setPanel({ mode: 'edit', plan });
          }}
          onDelete={(plan) => {
            setDeleteTarget(plan);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('operator.plans.deleteTitle')}
        message={deletePlan.error ? errorMessage(deletePlan.error, t) : undefined}
        confirmLabel={t('common.delete')}
        danger
        pending={deletePlan.isPending}
        onConfirm={confirmDelete}
        onCancel={closeDeleteConfirm}
      />
    </div>
  );
}
