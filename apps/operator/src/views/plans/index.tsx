import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { useBillingTerms } from '@/api/billing-terms';
import { useDeletePlan, usePlanPrices, usePlans } from '@/api/plans';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { EmptyBox } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { NOTE } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import type { OperatorPlan } from '@/types/operator';
import { PlanEditor } from './plan-editor';
import { PriceMatrix } from './price-matrix';
import { VersionsPanel } from './versions-panel';

type Open = { step: 'new' } | { step: 'edit' | 'versions' | 'delete'; planId: string } | null;

function DeletePanel({
  plan,
  onClose,
  onCancel,
}: {
  plan: OperatorPlan;
  onClose: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useDeletePlan();
  return (
    <ActionPanel
      title={t('plans.delete')}
      sub={`${plan.name} · v${String(plan.version)}`}
      onClose={onClose}
      onCancel={onCancel}
      actionLabel={t('plans.delete')}
      danger
      pending={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      onSubmit={() => {
        remove.mutate(plan.id, {
          onSuccess: () => {
            toast(t('plans.deleted', { name: plan.name }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">{t('plans.deleteConsequence')}</Consequence>
    </ActionPanel>
  );
}

/** OPERATOR-CONSOLE-DESIGN §6: what plans exist, what they allow, and what each costs for how long. */
export function Plans(): React.JSX.Element {
  const { t } = useTranslation();
  const plans = usePlans();
  const terms = useBillingTerms();
  const prices = usePlanPrices();
  const [open, setOpen] = useState<Open>(null);
  const sorted = [...(plans.data ?? [])].sort((a, b) => a.rank - b.rank);
  const live = (terms.data ?? [])
    .filter((term) => term.retiredAt === null)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const failed = plans.isError || terms.isError || prices.isError;
  const loading = plans.isLoading || terms.isLoading || prices.isLoading;
  const close = (): void => {
    setOpen(null);
  };
  const chosen = open && open.step !== 'new' ? sorted.find((p) => p.id === open.planId) : undefined;
  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.plans')}
        lead={t('plans.lead')}
        actions={
          <Button
            type="button"
            small
            fit
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              setOpen({ step: 'new' });
            }}
          >
            <ConsoleIcon name="plus" size={18} />
            {t('plans.new')}
          </Button>
        }
      />
      {failed ? (
        <LoadFailed
          onRetry={() => {
            void plans.refetch();
            void terms.refetch();
            void prices.refetch();
          }}
        />
      ) : loading ? (
        <section
          aria-busy="true"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
        >
          <span className="skel w-4/5" />
          <span className="skel w-3/5" />
        </section>
      ) : sorted.length === 0 ? (
        <section className="rounded-card border border-line bg-surface">
          <EmptyBox icon="tag" title={t('plans.empty')} hint={t('plans.emptyHint')} />
        </section>
      ) : (
        <PriceMatrix
          plans={sorted}
          terms={live}
          prices={prices.data ?? []}
          onEdit={(plan) => {
            setOpen({ step: 'edit', planId: plan.id });
          }}
        />
      )}
      <div className={NOTE}>
        {t('plans.rule1')} {t('plans.rule2')}
      </div>
      {open?.step === 'new' ? (
        <PlanEditor
          plan={null}
          allPlans={sorted}
          onClose={close}
          onVersions={close}
          onDelete={close}
        />
      ) : null}
      {open?.step === 'edit' && chosen ? (
        <PlanEditor
          key={chosen.id}
          plan={chosen}
          allPlans={sorted}
          onClose={close}
          onVersions={() => {
            setOpen({ step: 'versions', planId: chosen.id });
          }}
          onDelete={() => {
            setOpen({ step: 'delete', planId: chosen.id });
          }}
        />
      ) : null}
      {open?.step === 'versions' && chosen ? <VersionsPanel plan={chosen} onClose={close} /> : null}
      {open?.step === 'delete' && chosen ? (
        <DeletePanel
          plan={chosen}
          onClose={close}
          onCancel={() => {
            setOpen({ step: 'edit', planId: chosen.id });
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
