import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
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
import { Banner } from '@/components/ui/banner';
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
import type { PlanPriceOption } from '@/types/billing';
import type { MeTenant } from '@/types/me';
import { TermChips } from './change-plan';
import { DowngradeSheet } from './downgrade-sheet';
import { lapseDays, termLabel } from './figures';
import { HowToPaySheet } from './how-to-pay-sheet';
import {
  CurrentCard,
  Disclosure,
  PlanCard,
  PlanRow,
  TightStat,
  TightStats,
  YouAreHere,
} from './parts';
import { taka, useLimitLines, usePaygLines } from './words';
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
export function PlanPage(): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
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
  const limitLines = useLimitLines();
  const paygLines = usePaygLines(fees);
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

  function action(option: PlanPriceOption): React.JSX.Element | null {
    if (option.move === 'renewal' && !trial) return <YouAreHere />;
    if (!canManage) return null;
    if (option.move === 'upgrade') {
      return (
        <Button
          tone="accent"
          size="sm"
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
          size="sm"
          wide
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
        size="sm"
        wide
        onClick={() => {
          pay(option);
        }}
      >
        {t('takePlan', { plan: option.planName })}
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
    <ShellPage>
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
        <Banner tone="bad">{errorText(keepPlan.error ?? undo.error ?? choosePayg.error)}</Banner>
      ) : null}
      {checklist.data && tenant.planName ? (
        <DowngradeChecklistCard checklist={checklist.data} planName={tenant.planName} />
      ) : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <CurrentCard>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-fg-muted">{t('yourPlan')}</span>
              {lapsing ? (
                <StatusTag tone="warn">{t('grace')}</StatusTag>
              ) : trial ? (
                <StatusTag tone="info">{t('trial')}</StatusTag>
              ) : (
                <StatusTag tone="ok">{t('active')}</StatusTag>
              )}
            </div>
            <h2 className="mt-0.5 mb-3 text-[24px] font-bold">
              {trial
                ? t('trial')
                : tenant.billingTerm
                  ? t('planTerm', {
                      plan: tenant.planName ?? '',
                      term: termLabel(tenant.billingTerm, i18n.language),
                    })
                  : (tenant.planName ?? '')}
            </h2>
            <TightStats>
              {trial ? (
                <TightStat label={t('trialDaysLeft')} value={days ?? 0} note={t('thenPayg')} />
              ) : (
                <TightStat label={t('daysLeft')} value={lapsing ? 0 : (days ?? 0)} note={end} />
              )}
              <TightStat
                label={t('nextPay')}
                value={trial || !own?.amount ? '—' : taka(own.amount)}
                note={trial ? undefined : lapsing ? t('overdue') : end}
              />
            </TightStats>
            {canManage ? (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {trial ? (
                  <Button
                    tone="accent"
                    onClick={() => {
                      document.getElementById(PLAN_CARDS)?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    {t('pickPlan')}
                  </Button>
                ) : cancelled ? (
                  <Button
                    tone="accent"
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
                    onClick={() => {
                      pay(own);
                    }}
                  >
                    {t('renewFor', { amount: taka(own.amount) })}
                  </Button>
                ) : null}
                <Link
                  to="/$shop/invoices"
                  params={{ shop: slug }}
                  className={buttonClass('ghost', 'md')}
                >
                  {t('seeBilling')}
                </Link>
              </div>
            ) : null}
            {!trial && canManage && !cancelled ? (
              <AutoRenew tenant={tenant} amount={own?.amount ?? null} />
            ) : null}
          </CurrentCard>
          <div id={PLAN_CARDS} className="scroll-mt-4">
            <SectionHead>{t('changePlan')}</SectionHead>
            <div className="mt-2">
              <TermChips
                terms={catalogue.terms}
                table={catalogue.table}
                termId={term?.id ?? null}
                onPick={catalogue.pickTerm}
              />
            </div>
            {catalogue.error ? (
              <div className="mt-3">
                <Banner tone="bad">{errorText(catalogue.error)}</Banner>
              </div>
            ) : null}
            <div className="mt-3">
              <PlanRow>
                {options.map((option) => (
                  <PlanCard
                    key={option.planId}
                    name={option.planName}
                    price={taka(option.price)}
                    per={per}
                    lines={limitLines(catalogue.planOf(option.planId))}
                    current={!trial && option.move === 'renewal'}
                    action={action(option)}
                  />
                ))}
                {payg.data ? (
                  <PlanCard
                    dashed
                    name={t('payg')}
                    price="৳0"
                    per={t('perMonth')}
                    lines={paygLines(payg.data)}
                    action={
                      canManage && change === null ? (
                        <Button
                          tone="outline"
                          size="sm"
                          wide
                          busy={choosePayg.isPending}
                          onClick={() => {
                            if (active) {
                              setSheet({ kind: 'payg' });
                              return;
                            }
                            choosePayg.mutate();
                          }}
                        >
                          {active ? t('switchPayg') : t('choose')}
                        </Button>
                      ) : null
                    }
                  />
                ) : null}
              </PlanRow>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
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
        </div>
      </div>
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
    <div className="mt-3 flex min-h-10 items-center gap-3 border-t border-brand-200 pt-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{t('autoRenew')}</span>
        <span className="truncate text-[14px] text-fg-muted">
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
