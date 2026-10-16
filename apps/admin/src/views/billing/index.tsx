import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { useMe } from '@/api/auth';
import {
  useCancelDowngrade,
  useCancelSubscription,
  useConfirmPurchase,
  useConfirmUpgrade,
  useDowngradePreview,
  usePublicBillingTerms,
  usePublicPlans,
  useQuotePurchase,
  useQuoteUpgrade,
  useScheduleDowngrade,
  useScheduledDowngrade,
  useUndoCancellation,
} from '@/api/billing';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/error-banner';
import { DowngradePanel } from '@/views/billing/downgrade-panel';
import { PaymentPanel, type ConfirmWalletValues } from '@/views/billing/payment-panel';
import { PlanGrid, type PlanAction } from '@/views/billing/plan-grid';
import { ScheduledDowngradeBanner } from '@/views/billing/scheduled-downgrade-banner';
import type { Plan } from '@/types/billing-admin';
import type { PlanPayment } from '@/types/plan-payment';

type ActiveQuote = { kind: 'purchase' | 'upgrade'; payment: PlanPayment } | null;

/** Container (ENGINEERING-STANDARDS.md §2a): owns every fetch and the three flows this page bundles —
    purchase/renew/upgrade (one quote-then-pay shape, PaymentPanel), downgrade (preview-then-schedule,
    DowngradePanel), and cancel/undo (fire-and-forget, see api/billing's own note on why there's no persisted
    status to reflect here yet). PlanGrid/DowngradePanel/PaymentPanel/ScheduledDowngradeBanner stay
    presentational. */
export function Billing(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMe();
  const plans = usePublicPlans();
  const terms = usePublicBillingTerms();
  const scheduledDowngrade = useScheduledDowngrade();
  const cancelDowngrade = useCancelDowngrade();

  const quotePurchase = useQuotePurchase();
  const confirmPurchase = useConfirmPurchase();
  const quoteUpgrade = useQuoteUpgrade();
  const confirmUpgrade = useConfirmUpgrade();
  const [activeQuote, setActiveQuote] = useState<ActiveQuote>(null);

  const downgradePreview = useDowngradePreview();
  const scheduleDowngrade = useScheduleDowngrade();
  const [downgradeTarget, setDowngradeTarget] = useState<Plan | null>(null);

  const cancelSubscription = useCancelSubscription();
  const undoCancellation = useUndoCancellation();

  const [selectedTermId, setSelectedTermId] = useState('');
  useEffect(() => {
    const firstTerm = terms.data?.[0];
    if (!selectedTermId && firstTerm) {
      setSelectedTermId(firstTerm.id);
    }
  }, [terms.data, selectedTermId]);

  const currentPlan = plans.data?.find((plan) => plan.name === me.data?.tenant?.planName) ?? null;

  function handlePlanAction(plan: Plan, action: PlanAction): void {
    if (action === 'downgrade') {
      setDowngradeTarget(plan);
      downgradePreview.mutate({ planId: plan.id });
      return;
    }
    if (!selectedTermId) return;
    if (action === 'upgrade') {
      quoteUpgrade.mutate(
        { planId: plan.id, billingTermId: selectedTermId },
        {
          onSuccess: (payment) => {
            setActiveQuote({ kind: 'upgrade', payment });
          },
        },
      );
      return;
    }
    // 'purchase' and 'renew' both quote through the same endpoint (PurchaseService.quote picks the kind).
    quotePurchase.mutate(
      { planId: plan.id, billingTermId: selectedTermId },
      {
        onSuccess: (payment) => {
          setActiveQuote({ kind: 'purchase', payment });
        },
      },
    );
  }

  function closeQuote(): void {
    setActiveQuote(null);
    quotePurchase.reset();
    confirmPurchase.reset();
    quoteUpgrade.reset();
    confirmUpgrade.reset();
  }

  function confirmBalance(): void {
    if (!activeQuote) return;
    const input = { paymentId: activeQuote.payment.id, method: 'balance' as const };
    const mutation = activeQuote.kind === 'upgrade' ? confirmUpgrade : confirmPurchase;
    mutation.mutate(input, { onSuccess: closeQuote });
  }

  function confirmWallet(values: ConfirmWalletValues): void {
    if (!activeQuote) return;
    const input = {
      paymentId: activeQuote.payment.id,
      method: 'wallet' as const,
      ...values,
    };
    const mutation = activeQuote.kind === 'upgrade' ? confirmUpgrade : confirmPurchase;
    mutation.mutate(input, { onSuccess: closeQuote });
  }

  function closeDowngrade(): void {
    setDowngradeTarget(null);
    downgradePreview.reset();
    scheduleDowngrade.reset();
  }

  const quoteError = quotePurchase.error ?? quoteUpgrade.error;
  const confirmError = confirmPurchase.error ?? confirmUpgrade.error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('billing.title')}</h1>
        {me.data?.tenant ? (
          <p className="mt-1 text-sm text-slate-500">
            {t('billing.currentPlanLine', {
              plan: me.data.tenant.planName ?? t('billing.noPlan'),
              state: t(`billing.state.${me.data.tenant.state}`),
            })}
          </p>
        ) : null}
      </div>

      {scheduledDowngrade.data && plans.data ? (
        <ScheduledDowngradeBanner
          change={scheduledDowngrade.data}
          plans={plans.data}
          onCancel={() => {
            cancelDowngrade.mutate();
          }}
          pending={cancelDowngrade.isPending}
        />
      ) : null}

      {me.data?.tenant &&
      (me.data.tenant.state === TenantState.Active ||
        me.data.tenant.state === TenantState.Grace) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <Button
            type="button"
            variant="outline"
            loading={cancelSubscription.isPending}
            onClick={() => {
              cancelSubscription.mutate();
            }}
            className="w-auto!"
          >
            {t('billing.cancelSubscription')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={undoCancellation.isPending}
            onClick={() => {
              undoCancellation.mutate();
            }}
            className="w-auto!"
          >
            {t('billing.undoCancellation')}
          </Button>
          {cancelSubscription.isSuccess ? (
            <span className="text-sm text-emerald-700">{t('billing.cancelSuccess')}</span>
          ) : null}
          {undoCancellation.isSuccess ? (
            <span className="text-sm text-emerald-700">{t('billing.undoSuccess')}</span>
          ) : null}
        </div>
      ) : null}

      {activeQuote ? (
        <PaymentPanel
          title={
            activeQuote.kind === 'upgrade' ? t('billing.upgradeTitle') : t('billing.purchaseTitle')
          }
          quote={activeQuote.payment}
          onConfirmBalance={confirmBalance}
          onConfirmWallet={confirmWallet}
          onCancel={closeQuote}
          balancePending={confirmPurchase.isPending || confirmUpgrade.isPending}
          walletPending={confirmPurchase.isPending || confirmUpgrade.isPending}
          error={confirmError ? errorMessage(confirmError, t) : null}
        />
      ) : null}

      {downgradeTarget ? (
        <DowngradePanel
          targetPlan={downgradeTarget}
          overLimitItems={downgradePreview.data}
          previewLoading={downgradePreview.isPending}
          onSchedule={() => {
            scheduleDowngrade.mutate({ planId: downgradeTarget.id }, { onSuccess: closeDowngrade });
          }}
          onCancel={closeDowngrade}
          schedulePending={scheduleDowngrade.isPending}
          error={scheduleDowngrade.error ? errorMessage(scheduleDowngrade.error, t) : null}
        />
      ) : null}

      {quoteError ? <ErrorBanner message={errorMessage(quoteError, t)} /> : null}

      {plans.isLoading || terms.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {plans.isError ? <ErrorBanner message={errorMessage(plans.error, t)} /> : null}
      {plans.data && terms.data && me.data?.tenant ? (
        <PlanGrid
          plans={plans.data}
          terms={terms.data}
          selectedTermId={selectedTermId}
          onSelectTerm={setSelectedTermId}
          currentPlan={currentPlan}
          tenantState={me.data.tenant.state}
          onAction={handlePlanAction}
          actionPending={quotePurchase.isPending || quoteUpgrade.isPending}
        />
      ) : null}
    </div>
  );
}
