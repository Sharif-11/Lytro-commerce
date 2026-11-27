import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Permission,
  planCardTaka,
  TenantState,
  UsageMetric,
  TutorialScreen,
} from '@lytronix/validators';
import { daysUntil } from '@lytronix/ui';
import {
  useCancelScheduledChange,
  useCancellation,
  useChoosePayAsYouGo,
  useDowngradeChecklist,
  usePayAsYouGoPlan,
  useScheduledChange,
  useSetAutoRenew,
  useUndoCancellation,
} from '@/api/billing';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { SectionHead } from '@/components/ui/page';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { useCurrentRates } from '@/api/balance';
import { useUsage } from '@/api/usage';
import { usePaymentNotices } from '@/views/billing/notices';
import { PaymentBanner } from '@/views/billing/payment-banner';
import type { PlanPriceOption } from '@/types/billing';
import type { MeTenant } from '@/types/me';
import { AddonsCard } from '@/views/addons/addons-card';
import { DowngradeSheet } from './downgrade-sheet';
import { lapseDays, termLabel } from './figures';
import { HowToPaySheet } from './how-to-pay-sheet';
import { Disclosure, MineCard, MineLine, PeriodBar } from './parts';
import { HOT_OUTLINE, useCardLines } from './card-lines';
import { OnThisPlan, PlanGrid, PlanOffer, TermPicker } from './plan-cards';
import { taka } from './words';
import { usePaygFees } from './payg-fees';
import { PaygSwitchSheet } from './payg-switch-sheet';
import { CancelledBanner, DowngradeChecklistCard, ScheduledBanner } from './plan-banners';
import { StopSheet } from './stop-sheet';
import { UpgradeSheet } from './upgrade-sheet';
import { usePlanCatalogue } from './use-catalogue';

// A sheet names its plan; its figures are read from the prices as they are now, so a changed amount updates them.
type OpenSheet =
  { kind: 'pay' | 'upgrade' | 'downgrade'; planId: string } | { kind: 'stop' } | { kind: 'payg' };

const PLAN_CARDS = 'plan-cards';

/**
 * Plan (TENANT-DASHBOARD-DESIGN §7.12, the prototype's `plan`) for a trial or a paid plan: the banners that need the
 * seller first, the plan card with its figures and the one action for the state, the plan cards on the chosen term
 * each with the one move it allows, and stopping the subscription as a disclosure at the foot. Every figure is read
 * without making a payment (GET /billing/prices); a request is made only in a sheet, on the tap that commits.
 */
export function PlanPage({ openPlanId }: { openPlanId: string | null }): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const navigate = useNavigate();
  const { tenant, viewer, slug, showToast } = useShell();
  const canManage = allows(viewer, [Permission.PaymentsManage]);
  const catalogue = usePlanCatalogue(tenant.billingTerm?.id ?? null);
  const payg = usePayAsYouGoPlan();
  const scheduled = useScheduledChange();
  const cancellation = useCancellation();
  const checklist = useDowngradeChecklist();
  const keepPlan = useCancelScheduledChange();
  const undo = useUndoCancellation();
  const choosePayg = useChoosePayAsYouGo();
  const fees = usePaygFees();
  const notices = usePaymentNotices();
  const rates = useCurrentRates();
  const usage = useUsage({ enabled: allows(viewer, [Permission.PaymentsRead]) });
  const [sheet, setSheet] = useState<OpenSheet | null>(null);

  const state = tenant.state;
  const trial = state === TenantState.Trial;
  const active = state === TenantState.Active;
  const lapsing = state === TenantState.Grace || state === TenantState.ReadOnly;
  const cancelled = cancellation.data?.cancelledAt != null;
  const change = scheduled.data ?? null;
  const options = catalogue.options;
  const own = options.find((option) => option.move === 'renewal') ?? null;
  const term = catalogue.term;
  const label = term ? termLabel(term, i18n.language) : '';
  const per = term && term.months > 1 ? t('perTerm', { term: label }) : t('perMonth');
  const currentLimits = own ? catalogue.planOf(own.planId) : undefined;
  const cards = useCardLines(
    [payg.data, ...options.map((option) => catalogue.planOf(option.planId))],
    rates.data,
  );
  // The orders this period counts: the plan's month, or a trial's whole life (QTA-01, QTA-04).
  const handled =
    usage.data?.metrics.find(
      (figure) => figure.metric === (trial ? UsageMetric.OrdersTotal : UsageMetric.OrdersMonthly),
    ) ?? null;
  const sheetOption =
    sheet && 'planId' in sheet
      ? options.find((option) => option.planId === sheet.planId)
      : undefined;

  function close(): void {
    setSheet(null);
  }

  function finish(message: string): void {
    setSheet(null);
    showToast(message);
  }

  function pay(option: PlanPriceOption): void {
    if (option.amount === null) return;
    setSheet({ kind: 'pay', planId: option.planId });
  }

  // Usage's "To raise it" names a plan: its upgrade, or how to take it, opens once its price is read, and the link's
  // mark is dropped so the sheet does not open again.
  const asked = options.find((option) => option.planId === openPlanId);
  useEffect(() => {
    if (!asked) return;
    if (canManage && asked.amount !== null && asked.blockedBy === null) {
      if (asked.move === 'upgrade') setSheet({ kind: 'upgrade', planId: asked.planId });
      if (asked.move === 'purchase') setSheet({ kind: 'pay', planId: asked.planId });
    }
    void navigate({ to: '/$shop/plan', params: { shop: slug }, search: {}, replace: true });
  }, [asked, canManage, navigate, slug]);

  function action(option: PlanPriceOption, hot: boolean): React.JSX.Element | null {
    if (option.move === 'renewal' && !trial) return <OnThisPlan hot={hot} />;
    if (!canManage) return null;
    if (option.move === 'upgrade') {
      return (
        <Button
          tone={hot ? 'accent' : 'primary'}
          wide
          disabled={option.amount === null || option.blockedBy !== null}
          onClick={() => {
            setSheet({ kind: 'upgrade', planId: option.planId });
          }}
        >
          {t('upgradeDue', { amount: taka(option.amount ?? option.price) })}
        </Button>
      );
    }
    if (option.move === 'downgrade') {
      return (
        <Button
          tone="outline"
          wide
          className={hot ? HOT_OUTLINE : undefined}
          disabled={change !== null}
          onClick={() => {
            setSheet({ kind: 'downgrade', planId: option.planId });
          }}
        >
          {t('moveDown')}
        </Button>
      );
    }
    return (
      <Button
        tone={hot ? 'accent' : 'outline'}
        wide
        onClick={() => {
          pay(option);
        }}
      >
        {t('ux2.take', { p: option.planName })}
      </Button>
    );
  }

  const days = daysUntil(tenant.periodEnd);
  const stopDays = tenant.lapseStages ? lapseDays(tenant.lapseStages) : null;
  const end = tenant.periodEnd ? formatDayMonth(tenant.periodEnd) : '';
  const scheduledTo =
    change?.targetPlanId != null
      ? (options.find((option) => option.planId === change.targetPlanId)?.planName ?? null)
      : null;

  return (
    <ShellPage tutorials={TutorialScreen.Plan}>
      {notices.plan ? <PaymentBanner notice={notices.plan} about="plan" /> : null}
      {change && tenant.planName ? (
        <ScheduledBanner
          change={change}
          from={tenant.planName}
          to={scheduledTo}
          measureAgainst={change.targetPlanId ?? payg.data?.id ?? null}
          canManage={canManage}
          busy={keepPlan.isPending}
          onKeep={() => {
            keepPlan.mutate(undefined, {
              onSuccess: () => {
                showToast(t('keptPlan', { plan: tenant.planName ?? '' }));
              },
            });
          }}
        />
      ) : null}
      {cancelled && tenant.periodEnd ? (
        <CancelledBanner
          periodEnd={tenant.periodEnd}
          canManage={canManage}
          busy={undo.isPending}
          onUndo={() => {
            undo.mutate(undefined, {
              onSuccess: () => {
                showToast(t('undone'));
              },
            });
          }}
        />
      ) : null}
      {keepPlan.isError || undo.isError || choosePayg.isError ? (
        <ErrorBanner error={keepPlan.error ?? undo.error ?? choosePayg.error} />
      ) : null}
      {checklist.data && tenant.planName ? (
        <DowngradeChecklistCard checklist={checklist.data} planName={tenant.planName} />
      ) : null}
      <div className="flex flex-col gap-section lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-columns">
        <MineCard>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] text-neutral-700">{t('yourPlan')}</span>
            {lapsing ? (
              <StatusTag tone="warn">{t('grace')}</StatusTag>
            ) : trial ? (
              <StatusTag tone="info">{t('trial')}</StatusTag>
            ) : (
              <StatusTag tone="ok">{t('active')}</StatusTag>
            )}
          </div>
          <h2 className="text-[24px] font-bold">
            {trial
              ? t('trial')
              : tenant.billingTerm
                ? t('planTerm', {
                    plan: tenant.planName ?? '',
                    term: termLabel(tenant.billingTerm, i18n.language),
                  })
                : (tenant.planName ?? '')}
          </h2>
          <p className="num text-[15px] text-neutral-700">
            {trial
              ? t('ux2.planTrialLeft', { n: days ?? 0 })
              : lapsing
                ? `${end} · ${t('overdue')}`
                : t('ux2.planUntil', { d: end, n: days ?? 0 })}
          </p>
          <PeriodBar
            daysLeft={lapsing ? 0 : (days ?? 0)}
            months={tenant.billingTerm?.months ?? 1}
          />
          {trial || !own?.amount ? null : (
            <MineLine label={t('nextPay')} value={`${taka(own.amount)} · ${end}`} />
          )}
          {handled ? (
            <MineLine
              label={t('ux2.planHandled')}
              value={`${handled.used.toLocaleString('en-US')} / ${handled.limit === null ? '∞' : handled.limit.toLocaleString('en-US')}`}
            />
          ) : null}
          {canManage ? (
            trial ? (
              <Button
                tone="accent"
                wide
                onClick={() => {
                  document.getElementById(PLAN_CARDS)?.scrollIntoView({ block: 'start' });
                }}
              >
                {t('pickPlan')}
              </Button>
            ) : cancelled ? (
              <Button
                tone="accent"
                wide
                busy={undo.isPending}
                onClick={() => {
                  undo.mutate(undefined, {
                    onSuccess: () => {
                      showToast(t('undone'));
                    },
                  });
                }}
              >
                {t('keep')}
              </Button>
            ) : own?.amount ? (
              <Button
                tone="accent"
                wide
                onClick={() => {
                  pay(own);
                }}
              >
                {t('renewFor', { amount: taka(own.amount) })}
              </Button>
            ) : null
          ) : null}
          <div className="flex justify-center">
            <Link
              to="/$shop/billing"
              params={{ shop: slug }}
              className={`${buttonClass('ghost', 'sm')} min-h-10 !text-[15px]`}
            >
              {t('seeBilling')}
            </Link>
          </div>
          {!trial && canManage && !cancelled ? (
            <AutoRenew tenant={tenant} amount={own?.amount ?? null} />
          ) : null}
        </MineCard>
        <AddonsCard />
      </div>
      <div id={PLAN_CARDS} className="flex scroll-mt-4 flex-col gap-3">
        <SectionHead>{t('changePlan')}</SectionHead>
        <TermPicker
          terms={catalogue.terms}
          table={catalogue.table}
          termId={term?.id ?? null}
          onPick={catalogue.pickTerm}
        />
        {catalogue.error ? <ErrorBanner error={catalogue.error} /> : null}
        <PlanGrid>
          {payg.data ? (
            <PlanOffer
              name={t('payg')}
              who={payg.data.description}
              price={planCardTaka(0)}
              card={cards.payg(payg.data)}
              hot={payg.data.suggested === true}
              start={trial && payg.data.suggested === true}
              action={
                canManage && change === null ? (
                  <Button
                    tone={payg.data.suggested === true && !active ? 'accent' : 'outline'}
                    wide
                    className={payg.data.suggested === true && active ? HOT_OUTLINE : undefined}
                    busy={choosePayg.isPending}
                    onClick={() => {
                      if (active) {
                        setSheet({ kind: 'payg' });
                        return;
                      }
                      choosePayg.mutate();
                    }}
                  >
                    {active ? t('ux2.toPayg') : t('ux2.pickPayg')}
                  </Button>
                ) : null
              }
            />
          ) : null}
          {options.map((option) => {
            const plan = catalogue.planOf(option.planId);
            const hot = plan?.suggested === true;
            const mine = !trial && option.move === 'renewal';
            const months = term?.months ?? 1;
            return (
              <PlanOffer
                key={option.planId}
                name={option.planName}
                who={plan?.description ?? null}
                price={planCardTaka(Number(option.price) / months)}
                termNote={months > 1 ? `${taka(option.price)}${per}` : null}
                card={cards.of(plan)}
                mine={mine}
                hot={hot}
                start={mine || (trial && hot)}
                action={action(option, hot)}
              />
            );
          })}
        </PlanGrid>
      </div>
      {active && canManage && !cancelled && change === null ? (
        <Disclosure title={t('stopTitle')}>
          <p className="mt-2 mb-3 text-[14px] text-fg-muted">
            {stopDays
              ? t('stopNote', { viewOnly: stopDays.viewOnly, deleted: stopDays.deleted })
              : null}
          </p>
          <Button
            tone="outline"
            size="sm"
            onClick={() => {
              setSheet({ kind: 'stop' });
            }}
          >
            <span className="text-danger">{t('cancelAtEnd')}</span>
          </Button>
        </Disclosure>
      ) : null}
      {sheet?.kind === 'pay' && sheetOption && term ? (
        <HowToPaySheet option={sheetOption} termId={term.id} onClose={close} onDone={finish} />
      ) : null}
      {sheet?.kind === 'upgrade' && sheetOption && term ? (
        <UpgradeSheet
          option={sheetOption}
          termId={term.id}
          termLabel={label}
          termMonths={term.months}
          from={currentLimits}
          to={catalogue.planOf(sheetOption.planId)}
          periodEnd={tenant.periodEnd}
          onClose={close}
          onDone={finish}
        />
      ) : null}
      {sheet?.kind === 'downgrade' && sheetOption ? (
        <DowngradeSheet
          option={sheetOption}
          periodEnd={tenant.periodEnd}
          onClose={close}
          onDone={close}
        />
      ) : null}
      {sheet?.kind === 'stop' && tenant.periodEnd && tenant.lapseStages ? (
        <StopSheet
          shopName={tenant.shopName}
          periodEnd={tenant.periodEnd}
          stages={tenant.lapseStages}
          onClose={close}
          onDone={close}
        />
      ) : null}
      {sheet?.kind === 'payg' && tenant.periodEnd ? (
        <PaygSwitchSheet
          periodEnd={tenant.periodEnd}
          from={currentLimits}
          payg={payg.data}
          fees={fees}
          onClose={close}
          onDone={close}
        />
      ) : null}
    </ShellPage>
  );
}

/** BIL-17: renew from the balance by itself, under a teal-200 rule with what it takes and when. */
function AutoRenew({
  tenant,
  amount,
}: {
  tenant: MeTenant;
  amount: string | null;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const setAutoRenew = useSetAutoRenew();
  const [on, setOn] = useState(tenant.autoRenewEnabled);
  return (
    <div className="flex min-h-10 items-center gap-3 border-t border-brand-200 pt-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{t('autoRenew')}</span>
        <span className="text-[14px] text-fg-muted">
          {tenant.periodEnd && amount
            ? t('autoRenewNote', {
                date: formatDayMonth(tenant.periodEnd),
                amount: taka(amount),
              })
            : null}
        </span>
        {setAutoRenew.isError ? (
          <span className="text-[13px] text-danger">{errorText(setAutoRenew.error)}</span>
        ) : null}
      </span>
      <Switch
        checked={on}
        label={t('autoRenew')}
        disabled={setAutoRenew.isPending}
        onChange={(next) => {
          setAutoRenew.mutate(
            { enabled: next },
            {
              onSuccess: () => {
                setOn(next);
              },
            },
          );
        }}
      />
    </div>
  );
}
