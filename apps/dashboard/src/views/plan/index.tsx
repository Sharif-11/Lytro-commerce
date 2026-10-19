import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
import {
  useBillingTerms,
  useCancelScheduledChange,
  useCancellation,
  useChoosePayAsYouGo,
  usePlanPrices,
  usePlans,
  useScheduledChange,
  useUndoCancellation,
} from '@/api/billing';
import { errorMessage } from '@lytronix/api-client';
import { Chip, ErrorBanner, Notice, Page } from '@lytronix/ui';
import { useMe } from '@/api/me';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { PricingTable } from '@/lib/pricing-table';
import type { Plan } from '@/types/billing';
import { CurrentPlanCard } from './current-plan-card';
import { DowngradeSheet } from './downgrade-sheet';
import { PaySheet, type PayIntent } from './pay-sheet';
import { PlanBanners } from './plan-banners';
import { PlanCards } from './plan-cards';
import { StopSubscription } from './stop-subscription';

/**
 * Plan (DASHBOARD-SECTIONS-DESIGN §3): the banners that need attention first, the plan card with its three
 * figures and the one action for the state, the plan cards with the consequence on each button, and
 * stopping the subscription as a disclosure at the foot. Container: every query and mutation lives here.
 */
export function PlanView(): React.JSX.Element {
  const { t } = useTranslation();
  const { shop } = useParams({ from: '/$shop/plan' });
  const navigate = useNavigate();
  const me = useMe();
  const tenant = me.data?.tenant ?? null;
  const canManage = hasPermission(me.data, Permission.PaymentsManage);
  const isOwner = me.data?.isOwner === true;

  const plans = usePlans();
  const terms = useBillingTerms();
  const prices = usePlanPrices(
    (plans.data ?? []).filter((plan) => plan.forSale).map((plan) => plan.id),
  );
  const scheduled = useScheduledChange();
  const cancellation = useCancellation();
  const cancelScheduled = useCancelScheduledChange();
  const undoCancellation = useUndoCancellation();
  const choosePayg = useChoosePayAsYouGo();
  const toast = useToast();

  const [termId, setTermId] = useState<string | null>(null);
  const [payIntent, setPayIntent] = useState<PayIntent | null>(null);
  const [downgradeTarget, setDowngradeTarget] = useState<Plan | null>(null);

  const table = useMemo(
    () => new PricingTable(plans.data ?? [], terms.data ?? [], prices.prices),
    [plans.data, terms.data, prices.prices],
  );
  const visibleTerms = (terms.data ?? [])
    .filter((term) => term.visible)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const selectedTermId = termId ?? visibleTerms[0]?.id ?? null;
  const selectedTerm = visibleTerms.find((term) => term.id === selectedTermId) ?? null;
  const currentPlan = plans.data?.find((plan) => plan.name === tenant?.planName) ?? null;
  const state = tenant?.state ?? null;
  const cancelled = cancellation.data?.cancelledAt != null;

  function scrollToPlans(): void {
    document.getElementById('plan-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const renewOption =
    currentPlan && selectedTermId ? table.option(currentPlan.id, selectedTermId) : null;

  return (
    <Page>
      {tenant ? (
        <PlanBanners
          tenant={tenant}
          scheduled={scheduled.data ?? null}
          scheduledPlanName={
            plans.data?.find((plan) => plan.id === scheduled.data?.targetPlanId)?.name ?? null
          }
          cancelledAt={cancellation.data?.cancelledAt ?? null}
          canManage={canManage}
          cancelScheduledPending={cancelScheduled.isPending}
          undoPending={undoCancellation.isPending}
          onCancelScheduled={() => {
            cancelScheduled.mutate(undefined, {
              onSuccess: () => {
                toast.show(t('plan.scheduleCancelled'));
              },
            });
          }}
          onUndoCancellation={() => {
            undoCancellation.mutate(undefined, {
              onSuccess: () => {
                toast.show(t('plan.undoSuccess'));
              },
            });
          }}
        />
      ) : null}
      {cancelScheduled.isError ? (
        <ErrorBanner message={errorMessage(cancelScheduled.error, t)} />
      ) : null}
      {undoCancellation.isError ? (
        <ErrorBanner message={errorMessage(undoCancellation.error, t)} />
      ) : null}

      {tenant ? (
        <CurrentPlanCard
          tenant={tenant}
          currentPlan={currentPlan}
          term={selectedTerm}
          renewPrice={renewOption?.price ?? null}
          cancelled={cancelled}
          canManage={canManage}
          onRenew={() => {
            if (currentPlan && selectedTermId) {
              setPayIntent({ kind: 'purchase', plan: currentPlan, termId: selectedTermId });
            }
          }}
          onPickPlan={scrollToPlans}
          onKeepPlan={() => {
            undoCancellation.mutate(undefined, {
              onSuccess: () => {
                toast.show(t('plan.undoSuccess'));
              },
            });
          }}
          onInvoices={() => {
            void navigate({ to: '/$shop/invoices', params: { shop } });
          }}
          onAutoRenewChanged={(enabled) => {
            toast.show(enabled ? t('plan.autoRenewOn') : t('plan.autoRenewOff'));
          }}
        />
      ) : null}

      <section id="plan-cards" className="scroll-mt-20">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold text-ink">
            {state === TenantState.Trial || state === TenantState.PayAsYouGo
              ? t('plan.pickPlan')
              : t('plan.changePlan')}
          </h2>
          {visibleTerms.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleTerms.map((term) => (
                <Chip
                  key={term.id}
                  selected={term.id === selectedTermId}
                  className="min-h-10!"
                  onClick={() => {
                    setTermId(term.id);
                  }}
                >
                  {t('plan.termChip', {
                    label: term.labelBn,
                    labelEn: term.labelEn,
                    discount: table.discountPercent(term.id),
                  })}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
        {plans.isLoading || terms.isLoading || prices.isLoading ? (
          <p className="py-4 text-center text-[15px] text-neutral-700">{t('common.loading')}</p>
        ) : null}
        {plans.isError ? <ErrorBanner message={errorMessage(plans.error, t)} /> : null}
        {!table.isEmpty() && selectedTermId ? (
          <PlanCards
            table={table}
            termId={selectedTermId}
            currentPlan={currentPlan}
            state={state}
            scheduledTargetId={scheduled.data?.targetPlanId ?? null}
            canManage={canManage}
            paygPending={choosePayg.isPending}
            onPurchase={(plan) => {
              setPayIntent({ kind: 'purchase', plan, termId: selectedTermId });
            }}
            onUpgrade={(plan) => {
              setPayIntent({ kind: 'upgrade', plan, termId: selectedTermId });
            }}
            onDowngrade={setDowngradeTarget}
            onPayg={() => {
              choosePayg.mutate(undefined, {
                onSuccess: (data) => {
                  toast.show(
                    data.effective === 'now' ? t('plan.paygNow') : t('plan.paygAtPeriodEnd'),
                  );
                },
              });
            }}
          />
        ) : plans.data && table.isEmpty() ? (
          <Notice tone="warning">{t('checkout.noPlans')}</Notice>
        ) : null}
        {choosePayg.isError ? (
          <div className="mt-3">
            <ErrorBanner message={errorMessage(choosePayg.error, t)} />
          </div>
        ) : null}
      </section>

      {tenant && canManage ? (
        <StopSubscription
          tenant={tenant}
          isOwner={isOwner}
          cancelled={cancelled}
          onCancelled={() => {
            toast.show(t('plan.cancelSuccess'));
          }}
          onClosed={() => {
            toast.show(t('plan.closed'));
          }}
        />
      ) : null}

      <PaySheet
        intent={payIntent}
        table={table}
        onClose={() => {
          setPayIntent(null);
        }}
        onPaid={(message) => {
          setPayIntent(null);
          toast.show(message);
        }}
      />
      <DowngradeSheet
        target={downgradeTarget}
        price={
          downgradeTarget && selectedTermId
            ? (table.option(downgradeTarget.id, selectedTermId)?.price ?? null)
            : null
        }
        periodEnd={tenant?.periodEnd ?? null}
        onClose={() => {
          setDowngradeTarget(null);
        }}
        onScheduled={() => {
          setDowngradeTarget(null);
          toast.show(t('plan.downgradeScheduled'));
        }}
      />
      <Toast message={toast.message} />
    </Page>
  );
}
