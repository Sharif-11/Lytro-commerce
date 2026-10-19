import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBillingTerms } from '@/api/billing-terms';
import {
  useCreatePlan,
  useDeletePlan,
  usePlanPrices,
  usePlanVersions,
  usePlans,
  useRemovePlanPrice,
  useSetPlanPrice,
  useUpdatePlan,
} from '@/api/plans';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import type { Plan } from '@/types/operator';
import { PlanForm, type PlanFormValues } from './plan-form';
import { PlanList } from './plan-list';
import { PlanPrices } from './plan-prices';
import { PlanVersions } from './plan-versions';

type Panel = { mode: 'create' } | { mode: 'edit'; plan: Plan } | null;

/** PLN-01..03, TRM-03: the plan catalogue with each plan's prices per term and its version history, both
    shown under whichever plan is open for edit. Container: owns the fetches, the mutations and the panel. */
export function Plans(): React.JSX.Element {
  const { t } = useTranslation();
  const plans = usePlans();
  const terms = useBillingTerms();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const setPrice = useSetPlanPrice();
  const removePrice = useRemovePlanPrice();
  const [panel, setPanel] = useState<Panel>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);

  const editingId = panel?.mode === 'edit' ? panel.plan.id : null;
  const prices = usePlanPrices(editingId);
  const versions = usePlanVersions(editingId);

  function closePanel(): void {
    setPanel(null);
    createPlan.reset();
    updatePlan.reset();
  }

  function handleSubmit(values: PlanFormValues): void {
    if (panel?.mode === 'create') {
      createPlan.mutate(values, { onSuccess: closePanel });
    } else if (panel?.mode === 'edit') {
      updatePlan.mutate({ id: panel.plan.id, ...values }, { onSuccess: closePanel });
    }
  }

  return (
    <Page>
      <PageHeader
        title={t('plans.title')}
        lead={plans.data ? t('plans.count', { count: plans.data.length }) : undefined}
        action={
          panel === null ? (
            <Button
              type="button"
              fit
              onClick={() => {
                setPanel({ mode: 'create' });
              }}
            >
              {t('plans.add')}
            </Button>
          ) : null
        }
      />

      {panel !== null ? (
        <>
          <PlanForm
            mode={panel.mode}
            initial={panel.mode === 'edit' ? panel.plan : undefined}
            pending={createPlan.isPending || updatePlan.isPending}
            error={
              createPlan.isError
                ? errorMessage(createPlan.error, t)
                : updatePlan.isError
                  ? errorMessage(updatePlan.error, t)
                  : null
            }
            onCancel={closePanel}
            onSubmit={handleSubmit}
          />
          {panel.mode === 'edit' ? (
            <>
              <PlanPrices
                terms={(terms.data ?? []).filter((term) => term.retiredAt === null)}
                prices={prices.data ?? []}
                pending={setPrice.isPending || removePrice.isPending}
                error={
                  setPrice.isError
                    ? errorMessage(setPrice.error, t)
                    : removePrice.isError
                      ? errorMessage(removePrice.error, t)
                      : null
                }
                onSet={(billingTermId, price) => {
                  setPrice.mutate({ planId: panel.plan.id, billingTermId, price });
                }}
                onRemove={(billingTermId) => {
                  removePrice.mutate({ planId: panel.plan.id, billingTermId });
                }}
              />
              <PlanVersions versions={versions.data} loading={versions.isLoading} />
            </>
          ) : null}
        </>
      ) : null}

      {plans.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {plans.isError ? <ErrorBanner message={errorMessage(plans.error, t)} /> : null}
      {plans.data ? (
        <PlanList
          plans={plans.data}
          onEdit={(plan) => {
            setPanel({ mode: 'edit', plan });
          }}
          onDelete={setDeleting}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={t('plans.deleteTitle')}
        message={deleting?.name}
        error={deletePlan.isError ? errorMessage(deletePlan.error, t) : null}
        confirmLabel={t('common.delete')}
        danger
        pending={deletePlan.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deletePlan.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              if (editingId === deleting.id) closePanel();
            },
          });
        }}
        onCancel={() => {
          setDeleting(null);
          deletePlan.reset();
        }}
      />
    </Page>
  );
}
