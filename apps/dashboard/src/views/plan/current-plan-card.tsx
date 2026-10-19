import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { useSetAutoRenew } from '@/api/billing';
import { errorMessage } from '@lytronix/api-client';
import { Button, daysUntil, ErrorBanner, formatDate, formatTaka, Tag } from '@lytronix/ui';
import type { BillingTerm, Plan } from '@/types/billing';
import type { MeTenant } from '@/types/me';

interface CurrentPlanCardProps {
  tenant: MeTenant;
  currentPlan: Plan | null;
  term: BillingTerm | null;
  renewPrice: number | null;
  cancelled: boolean;
  canManage: boolean;
  onRenew: () => void;
  onPickPlan: () => void;
  onKeepPlan: () => void;
  onInvoices: () => void;
  onAutoRenewChanged: (enabled: boolean) => void;
}

const STATE_TONES: Record<TenantState, 'success' | 'brand' | 'accent' | 'danger' | 'neutral'> = {
  [TenantState.Trial]: 'brand',
  [TenantState.PayAsYouGo]: 'success',
  [TenantState.Active]: 'success',
  [TenantState.Grace]: 'accent',
  [TenantState.ReadOnly]: 'accent',
  [TenantState.Locked]: 'danger',
  [TenantState.Archived]: 'neutral',
  [TenantState.Deleted]: 'neutral',
};

/** The number first, then the one thing to do (rule 1): days left, the next payment, the headline limit,
    and the action the state calls for. The auto-renew switch sits under a rule (BIL-17). */
export function CurrentPlanCard({
  tenant,
  currentPlan,
  term,
  renewPrice,
  cancelled,
  canManage,
  onRenew,
  onPickPlan,
  onKeepPlan,
  onInvoices,
  onAutoRenewChanged,
}: CurrentPlanCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const setAutoRenew = useSetAutoRenew();
  const [autoRenew, setAutoRenewLocal] = useState(tenant.autoRenewEnabled ?? false);
  const state = tenant.state;
  const days = daysUntil(tenant.periodEnd);
  const ended = tenant.periodEnd !== null && new Date(tenant.periodEnd).getTime() < Date.now();
  const trial = state === TenantState.Trial;
  const payg = state === TenantState.PayAsYouGo;
  const subscribed = state === TenantState.Active || state === TenantState.Grace;
  const lapsed =
    state === TenantState.ReadOnly ||
    state === TenantState.Locked ||
    state === TenantState.Archived;
  const date = tenant.periodEnd ? formatDate(tenant.periodEnd, i18n.language) : null;
  const headlineLimit = currentPlan?.limits.products;

  const name = trial
    ? t('plan.state.trial')
    : payg
      ? t('plan.state.pay_as_you_go')
      : (tenant.planName ?? t('plan.noPlan'));

  const stateLabel = cancelled && date ? t('plan.endsOn', { date }) : t(`plan.state.${state}`);

  let primary: { label: string; onClick: () => void; tone: 'accent' | 'primary' } | null = null;
  if (canManage) {
    if (trial || payg)
      primary = { label: t('plan.pickPlan'), onClick: onPickPlan, tone: 'primary' };
    else if (cancelled)
      primary = { label: t('plan.keepPlan'), onClick: onKeepPlan, tone: 'primary' };
    else if (renewPrice !== null) {
      primary = {
        label: t('plan.renewFor', { amount: formatTaka(renewPrice) }),
        onClick: onRenew,
        tone: 'accent',
      };
    }
  }

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-neutral-700">{t('plan.yourPlan')}</p>
          <h2 className="heading flex flex-wrap items-center gap-2 text-[22px] text-ink">
            {name}
            <Tag tone={cancelled ? 'accent' : STATE_TONES[state]}>{stateLabel}</Tag>
          </h2>
        </div>
        {term && subscribed ? (
          <span className="text-[13px] text-neutral-700">
            {i18n.language === 'bn' ? term.labelBn : term.labelEn}
          </span>
        ) : payg ? (
          <span className="text-[13px] text-neutral-700">{t('plan.noPeriod')}</span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {payg ? (
          <Figure value="—" label={t('plan.figures.noPeriodFees')} />
        ) : lapsed && ended ? (
          <Figure
            value={String(daysSinceEnd(tenant.periodEnd))}
            label={t('plan.figures.daysSinceEnd')}
          />
        ) : (
          <Figure value={days === null ? '—' : String(days)} label={t('plan.figures.daysLeft')} />
        )}
        {trial ? (
          <Figure value="৳0" label={t('plan.figures.paygAfterTrial', { days: days ?? 0 })} />
        ) : cancelled ? (
          <Figure value="—" label={t('plan.figures.noPayment')} />
        ) : renewPrice !== null && date ? (
          <Figure
            value={formatTaka(renewPrice)}
            label={
              lapsed ? t('plan.figures.renewFromNow') : t('plan.figures.nextPayment', { date })
            }
          />
        ) : (
          <Figure value="—" label={t('plan.figures.nextPaymentNone')} />
        )}
        <Figure
          value={
            headlineLimit === undefined
              ? '—'
              : headlineLimit === null
                ? t('plan.unlimited')
                : headlineLimit.toLocaleString('en-US')
          }
          label={t('plan.figures.productsAllowed')}
          wide
        />
      </div>

      {primary || canManage ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {primary ? (
            <Button type="button" tone={primary.tone} onClick={primary.onClick}>
              {primary.label}
            </Button>
          ) : null}
          <Button type="button" tone="outline" onClick={onInvoices}>
            {t('plan.seeInvoices')}
          </Button>
        </div>
      ) : null}

      {subscribed && canManage && !cancelled ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-[15px] text-ink">{t('plan.autoRenew')}</p>
            <p className="text-[13px] text-neutral-700">
              {date && renewPrice !== null
                ? t('plan.autoRenewNote', { date, amount: formatTaka(renewPrice) })
                : t('plan.autoRenewNoteShort')}
            </p>
            {setAutoRenew.isError ? (
              <div className="mt-2">
                <ErrorBanner message={errorMessage(setAutoRenew.error, t)} />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoRenew}
            aria-label={t('plan.autoRenew')}
            disabled={setAutoRenew.isPending}
            onClick={() => {
              const next = !autoRenew;
              setAutoRenew.mutate(
                { enabled: next },
                {
                  onSuccess: () => {
                    setAutoRenewLocal(next);
                    onAutoRenewChanged(next);
                  },
                },
              );
            }}
            className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              autoRenew ? 'bg-brand-700' : 'bg-neutral-200'
            }`}
          >
            <span
              className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                autoRenew ? 'left-[21px]' : 'left-[3px]'
              }`}
            />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function daysSinceEnd(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

function Figure({ value, label, wide = false }: { value: string; label: string; wide?: boolean }) {
  return (
    <div
      className={`rounded-[12px] border border-line bg-neutral-50 px-3 py-2.5 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}
    >
      <p className="num text-[18px] font-bold text-ink">{value}</p>
      <p className="text-[13px] text-neutral-700">{label}</p>
    </div>
  );
}
