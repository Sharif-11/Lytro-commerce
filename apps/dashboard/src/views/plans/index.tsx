import { useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, ScheduledPlanChangeKind, TenantState } from '@lytronix/validators';
import { useBalance } from '@/api/balance';
import {
  useBillingTerms,
  useCancelScheduledChange,
  useCancelSubscription,
  useCancellation,
  useChoosePayAsYouGo,
  useCloseShop,
  useConfirmPurchase,
  useConfirmUpgrade,
  useDowngradePreview,
  usePlanPrices,
  usePlans,
  usePlatformWallets,
  useQuotePurchase,
  useQuoteUpgrade,
  useScheduleDowngrade,
  useScheduledChange,
  useSetAutoRenew,
  useUndoCancellation,
} from '@/api/billing';
import { errorMessage } from '@/api/error-message';
import { useMe } from '@/api/me';
import { Button } from '@/components/ui/button';
import { Chip, Tag } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, Page, PageHeader } from '@/components/ui/fields';
import { formatDate } from '@/lib/dates';
import { ErrorBanner, Notice } from '@/components/ui/notice';
import { formatTaka } from '@/lib/money';
import { hasPermission } from '@/lib/permissions';
import { PricingTable } from '@/lib/pricing-table';
import type { Plan, PlanPayment } from '@/types/billing';
import { PaymentForm } from '@/views/checkout/payment-form';

type PlanAction = 'purchase' | 'renew' | 'upgrade' | 'downgrade';
type ActiveQuote = { kind: 'purchase' | 'upgrade'; payment: PlanPayment; plan: Plan } | null;

/**
 * The plans and billing screen (TRL-08, BIL-01..18, UPG, DWN, PYG, LIF-01, LIF-15): every for-sale plan with
 * its real prices, the action each one allows in the shop's state, a quote-then-pay step (balance or wallet),
 * downgrade preview and scheduling, the scheduled-change banner, cancel and undo, auto-renew, pay-as-you-go
 * and closing a pay-as-you-go shop.
 */
export function Plans(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { shop } = useParams({ from: '/$shop/plans' });
  const me = useMe();
  const canManage = hasPermission(me.data, Permission.PaymentsManage);
  const tenant = me.data?.tenant ?? null;

  const plans = usePlans();
  const terms = useBillingTerms();
  const prices = usePlanPrices(
    (plans.data ?? []).filter((plan) => plan.forSale).map((plan) => plan.id),
  );
  const wallets = usePlatformWallets();
  const balance = useBalance();
  const scheduled = useScheduledChange();
  const cancellation = useCancellation();

  const quotePurchase = useQuotePurchase();
  const confirmPurchase = useConfirmPurchase();
  const quoteUpgrade = useQuoteUpgrade();
  const confirmUpgrade = useConfirmUpgrade();
  const downgradePreview = useDowngradePreview();
  const scheduleDowngrade = useScheduleDowngrade();
  const cancelScheduled = useCancelScheduledChange();
  const cancelSubscription = useCancelSubscription();
  const undoCancellation = useUndoCancellation();
  const setAutoRenew = useSetAutoRenew();
  const choosePayg = useChoosePayAsYouGo();
  const closeShop = useCloseShop();

  const [termId, setTermId] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<ActiveQuote>(null);
  const [downgradeTarget, setDowngradeTarget] = useState<Plan | null>(null);
  const [closing, setClosing] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const table = useMemo(
    () => new PricingTable(plans.data ?? [], terms.data ?? [], prices.prices),
    [plans.data, terms.data, prices.prices],
  );
  const visibleTerms = (terms.data ?? [])
    .filter((term) => term.visible)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const selectedTermId = termId ?? visibleTerms[0]?.id ?? null;
  const currentPlan = plans.data?.find((plan) => plan.name === tenant?.planName) ?? null;
  const state = tenant?.state ?? null;
  const canRenew = state === TenantState.Active || state === TenantState.Grace;

  function actionFor(plan: Plan): PlanAction | null {
    if (scheduled.data && plan.id === scheduled.data.targetPlanId) return canRenew ? 'renew' : null;
    if (currentPlan && plan.id === currentPlan.id)
      return scheduled.data ? null : canRenew ? 'renew' : null;
    if (state === TenantState.Active && currentPlan)
      return plan.rank > currentPlan.rank ? 'upgrade' : 'downgrade';
    return 'purchase';
  }

  function act(plan: Plan, action: PlanAction): void {
    setDone(null);
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
            setActiveQuote({ kind: 'upgrade', payment, plan });
          },
        },
      );
      return;
    }
    quotePurchase.mutate(
      { planId: plan.id, billingTermId: selectedTermId },
      {
        onSuccess: (payment) => {
          setActiveQuote({ kind: 'purchase', payment, plan });
        },
      },
    );
  }

  function closeQuote(message: string | null): void {
    setActiveQuote(null);
    quotePurchase.reset();
    confirmPurchase.reset();
    quoteUpgrade.reset();
    confirmUpgrade.reset();
    setDone(message);
  }

  const confirmMutation = activeQuote?.kind === 'upgrade' ? confirmUpgrade : confirmPurchase;
  const quoteError = quotePurchase.error ?? quoteUpgrade.error;

  return (
    <Page>
      <PageHeader
        title={t('plans.title')}
        lead={
          tenant
            ? t('plans.currentLine', {
                plan: tenant.planName ?? t('plans.noPlan'),
                state: t(`plans.state.${tenant.state}`),
              })
            : undefined
        }
      />

      {done ? <Notice tone="success">{done}</Notice> : null}

      {scheduled.data ? (
        <Notice tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {scheduled.data.kind === ScheduledPlanChangeKind.PayAsYouGoSwitch
                ? t('plans.scheduledPayg', {
                    date: formatDate(scheduled.data.effectiveAt, i18n.language),
                  })
                : t('plans.scheduledDowngrade', {
                    name:
                      plans.data?.find((plan) => plan.id === scheduled.data?.targetPlanId)?.name ??
                      '',
                    date: formatDate(scheduled.data.effectiveAt, i18n.language),
                  })}
            </span>
            {canManage ? (
              <button
                type="button"
                disabled={cancelScheduled.isPending}
                onClick={() => {
                  cancelScheduled.mutate();
                }}
                className="min-h-9 font-bold underline"
              >
                {t('plans.cancelScheduled')}
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      {cancellation.data?.cancelledAt ? (
        <Notice tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('plans.cancellationPending')}</span>
            {canManage ? (
              <button
                type="button"
                disabled={undoCancellation.isPending}
                onClick={() => {
                  undoCancellation.mutate(undefined, {
                    onSuccess: () => {
                      setDone(t('plans.undoSuccess'));
                    },
                  });
                }}
                className="min-h-9 font-bold underline"
              >
                {t('plans.undoCancellation')}
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      {activeQuote ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold text-ink">
                {activeQuote.kind === 'upgrade'
                  ? t('plans.confirmUpgrade')
                  : t('plans.confirmPurchase')}
              </h2>
              <p className="num text-[14px] text-neutral-700">
                {activeQuote.plan.name} · {formatTaka(activeQuote.payment.amount)}
                {Number(activeQuote.payment.creditAmount) > 0
                  ? ` · ${t('plans.creditApplied', { amount: formatTaka(activeQuote.payment.creditAmount) })}`
                  : ''}
              </p>
            </div>
            <Button
              type="button"
              tone="ghost"
              fit
              onClick={() => {
                closeQuote(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
          <p className="mt-2 text-[13px] text-neutral-700">{t('checkout.noRefund')}</p>
          <div className="mt-4">
            <PaymentForm
              quote={activeQuote.payment}
              wallets={wallets.data}
              pending={confirmMutation.isPending}
              error={confirmMutation.isError ? errorMessage(confirmMutation.error, t) : null}
              onSubmit={(values) => {
                confirmMutation.mutate(
                  { paymentId: activeQuote.payment.id, method: 'wallet', ...values },
                  {
                    onSuccess: () => {
                      closeQuote(t('checkout.submitted'));
                    },
                  },
                );
              }}
              balance={
                balance.data && !balance.data.frozen
                  ? {
                      amount: balance.data.amount,
                      pending: confirmMutation.isPending,
                      onPay: () => {
                        confirmMutation.mutate(
                          { paymentId: activeQuote.payment.id, method: 'balance' },
                          {
                            onSuccess: () => {
                              closeQuote(t('plans.paidFromBalance'));
                            },
                          },
                        );
                      },
                    }
                  : undefined
              }
            />
          </div>
        </Card>
      ) : null}

      {downgradeTarget ? (
        <Card>
          <h2 className="text-[16px] font-bold text-ink">
            {t('plans.downgradeTo', { name: downgradeTarget.name })}
          </h2>
          {downgradePreview.isPending ? (
            <p className="mt-2 text-[14px] text-neutral-700">{t('common.loading')}</p>
          ) : null}
          {downgradePreview.data && downgradePreview.data.length > 0 ? (
            <Notice tone="warning" className="mt-3">
              <p className="font-semibold">{t('plans.overLimitWarning')}</p>
              <ul className="num mt-1 list-inside list-disc">
                {downgradePreview.data.map((item) => (
                  <li key={item.key}>
                    {t(`plans.limit.${item.key}`, { defaultValue: item.key })}: {item.used} /{' '}
                    {item.limit}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {scheduleDowngrade.isError ? (
            <div className="mt-3">
              <ErrorBanner message={errorMessage(scheduleDowngrade.error, t)} />
            </div>
          ) : null}
          <div className="mt-4 grid gap-2 sm:flex">
            <Button
              type="button"
              className="sm:w-auto"
              loading={scheduleDowngrade.isPending}
              onClick={() => {
                scheduleDowngrade.mutate(
                  { planId: downgradeTarget.id },
                  {
                    onSuccess: () => {
                      setDowngradeTarget(null);
                      setDone(t('plans.downgradeScheduled'));
                    },
                  },
                );
              }}
            >
              {t('plans.scheduleDowngrade')}
            </Button>
            <Button
              type="button"
              tone="outline"
              className="sm:w-auto"
              onClick={() => {
                setDowngradeTarget(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      ) : null}

      {quoteError ? <ErrorBanner message={errorMessage(quoteError, t)} /> : null}

      {plans.isLoading || terms.isLoading || prices.isLoading ? (
        <p className="text-center text-[15px] text-neutral-700">{t('common.loading')}</p>
      ) : null}
      {plans.isError ? <ErrorBanner message={errorMessage(plans.error, t)} /> : null}

      {visibleTerms.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {visibleTerms.map((term) => (
            <Chip
              key={term.id}
              selected={term.id === selectedTermId}
              onClick={() => {
                setTermId(term.id);
              }}
            >
              {i18n.language === 'bn' ? term.labelBn : term.labelEn}
            </Chip>
          ))}
        </div>
      ) : null}

      {!table.isEmpty() ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {table.plans().map((plan) => {
            const option = selectedTermId ? table.option(plan.id, selectedTermId) : null;
            const action = actionFor(plan);
            const isCurrent = currentPlan?.id === plan.id;
            return (
              <Card key={plan.id} className={isCurrent ? 'ring-2 ring-brand-700' : ''}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="heading text-[18px] text-ink">{plan.name}</h3>
                  {isCurrent ? <Tag tone="brand">{t('plans.currentPlan')}</Tag> : null}
                </div>
                {plan.description ? (
                  <p className="mt-1 text-[14px] text-neutral-700">{plan.description}</p>
                ) : null}
                <p className="num mt-3 text-[26px] font-bold leading-none text-ink">
                  {option ? formatTaka(option.price) : '—'}
                  {option ? (
                    <span className="ml-1 text-[13px] font-normal text-neutral-700">
                      {option.term.months === 1
                        ? t('checkout.perMonth')
                        : t('checkout.perTerm', { months: option.term.months })}
                    </span>
                  ) : null}
                </p>
                {option && option.term.months > 1 ? (
                  <p className="num text-[13px] text-neutral-700">
                    {t('checkout.monthlyEquivalent', { amount: formatTaka(option.monthly) })}
                    {option.savingPercent > 0
                      ? ` · ${t('checkout.saving', { percent: option.savingPercent })}`
                      : ''}
                  </p>
                ) : null}
                <ul className="num mt-3 space-y-1 text-[14px] text-neutral-700">
                  {Object.entries(plan.limits).map(([key, value]) => (
                    <li key={key}>
                      {t(`plans.limit.${key}`, { defaultValue: key })}:{' '}
                      <span className="text-ink">
                        {value === null ? t('plans.unlimited') : String(value)}
                      </span>
                    </li>
                  ))}
                </ul>
                {action && canManage && option ? (
                  <div className="mt-4">
                    <Button
                      type="button"
                      tone={action === 'downgrade' ? 'outline' : 'primary'}
                      disabled={quotePurchase.isPending || quoteUpgrade.isPending}
                      onClick={() => {
                        act(plan, action);
                      }}
                    >
                      {t(`plans.action.${action}`)}
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : plans.data ? (
        <Notice tone="warning">{t('checkout.noPlans')}</Notice>
      ) : null}

      {canManage && tenant ? (
        <Card>
          <h2 className="text-[16px] font-bold text-ink">{t('plans.manageTitle')}</h2>
          <div className="mt-3 space-y-4">
            {state === TenantState.Active || state === TenantState.Grace ? (
              <div className="flex flex-wrap gap-2">
                {!cancellation.data?.cancelledAt ? (
                  <Button
                    type="button"
                    tone="outline"
                    fit
                    loading={cancelSubscription.isPending}
                    onClick={() => {
                      cancelSubscription.mutate(undefined, {
                        onSuccess: () => {
                          setDone(t('plans.cancelSuccess'));
                        },
                      });
                    }}
                  >
                    {t('plans.cancelSubscription')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  tone="outline"
                  fit
                  loading={setAutoRenew.isPending && setAutoRenew.variables.enabled}
                  onClick={() => {
                    setAutoRenew.mutate(
                      { enabled: true },
                      {
                        onSuccess: () => {
                          setDone(t('plans.autoRenewOn'));
                        },
                      },
                    );
                  }}
                >
                  {t('plans.autoRenewEnable')}
                </Button>
                <Button
                  type="button"
                  tone="ghost"
                  fit
                  loading={setAutoRenew.isPending && !setAutoRenew.variables.enabled}
                  onClick={() => {
                    setAutoRenew.mutate(
                      { enabled: false },
                      {
                        onSuccess: () => {
                          setDone(t('plans.autoRenewOff'));
                        },
                      },
                    );
                  }}
                >
                  {t('plans.autoRenewDisable')}
                </Button>
              </div>
            ) : null}
            {state !== TenantState.Trial && state !== TenantState.PayAsYouGo ? (
              <div>
                <p className="text-[14px] text-neutral-700">{t('plans.paygLead')}</p>
                <div className="mt-2">
                  <Button
                    type="button"
                    tone="outline"
                    fit
                    loading={choosePayg.isPending}
                    onClick={() => {
                      choosePayg.mutate(undefined, {
                        onSuccess: (data) => {
                          setDone(
                            data.effective === 'now'
                              ? t('plans.paygNow')
                              : t('plans.paygAtPeriodEnd'),
                          );
                        },
                      });
                    }}
                  >
                    {t('plans.choosePayg')}
                  </Button>
                </div>
              </div>
            ) : null}
            {state === TenantState.PayAsYouGo && me.data?.isOwner ? (
              <div>
                <p className="text-[14px] text-neutral-700">{t('plans.closeLead')}</p>
                <div className="mt-2">
                  <Button
                    type="button"
                    tone="danger"
                    fit
                    onClick={() => {
                      setClosing(true);
                    }}
                  >
                    {t('plans.closeShop')}
                  </Button>
                </div>
              </div>
            ) : null}
            {cancelSubscription.isError ? (
              <ErrorBanner message={errorMessage(cancelSubscription.error, t)} />
            ) : null}
            {setAutoRenew.isError ? (
              <ErrorBanner message={errorMessage(setAutoRenew.error, t)} />
            ) : null}
            {choosePayg.isError ? (
              <ErrorBanner message={errorMessage(choosePayg.error, t)} />
            ) : null}
          </div>
        </Card>
      ) : null}

      <p className="text-[14px]">
        <Link to="/$shop/invoices" params={{ shop }} className="font-bold text-brand-800 underline">
          {t('invoices.title')}
        </Link>
      </p>

      <ConfirmDialog
        open={closing}
        title={t('plans.closeConfirmTitle')}
        message={t('plans.closeConfirmLead')}
        error={closeShop.isError ? errorMessage(closeShop.error, t) : null}
        confirmLabel={t('plans.closeShop')}
        danger
        pending={closeShop.isPending}
        onConfirm={() => {
          closeShop.mutate(undefined, {
            onSuccess: () => {
              setClosing(false);
              setDone(t('plans.closed'));
            },
          });
        }}
        onCancel={() => {
          setClosing(false);
        }}
      />
    </Page>
  );
}
