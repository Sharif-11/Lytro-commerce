import { useTranslation } from 'react-i18next';
import { RateKey, TenantState } from '@lytronix/validators';
import { useCurrentRates } from '@/api/balance';
import { Button, formatRate, formatTaka, Tag } from '@lytronix/ui';
import type { PricingTable } from '@/lib/pricing-table';
import type { Plan } from '@/types/billing';

interface PlanCardsProps {
  table: PricingTable;
  termId: string;
  currentPlan: Plan | null;
  state: TenantState | null;
  scheduledTargetId: string | null;
  canManage: boolean;
  paygPending: boolean;
  onPurchase: (plan: Plan) => void;
  onUpgrade: (plan: Plan) => void;
  onDowngrade: (plan: Plan) => void;
  onPayg: () => void;
}

const HEADLINE_LIMITS: (keyof Plan['limits'])[] = ['products', 'staff', 'essential_sms_monthly'];

/**
 * A snap row of plan cards on phones, a grid from 900 px (TRM-12, BIL-01): price, the monthly equivalent
 * for longer terms, three limits, and the one action the plan's rank allows with its consequence on the
 * button. The pay-as-you-go card is dashed and quotes the fee rates (PYG-01).
 */
export function PlanCards({
  table,
  termId,
  currentPlan,
  state,
  scheduledTargetId,
  canManage,
  paygPending,
  onPurchase,
  onUpgrade,
  onDowngrade,
  onPayg,
}: PlanCardsProps): React.JSX.Element {
  const { t } = useTranslation();
  const rates = useCurrentRates();
  const rate = (key: RateKey): string =>
    formatRate(rates.data?.find((r) => r.key === key)?.value ?? null);
  const active = state === TenantState.Active;
  const trialOrPayg = state === TenantState.Trial || state === TenantState.PayAsYouGo;

  function action(
    plan: Plan,
  ): { label: string; tone: 'primary' | 'outline'; run: () => void } | null {
    if (!canManage) return null;
    if (currentPlan && plan.id === currentPlan.id) return null;
    if (scheduledTargetId === plan.id) return null;
    if (active && currentPlan) {
      if (plan.rank > currentPlan.rank) {
        return {
          label: t('plan.action.upgradeNow'),
          tone: 'primary',
          run: () => {
            onUpgrade(plan);
          },
        };
      }
      return {
        label: t('plan.action.downgradeAtEnd'),
        tone: 'outline',
        run: () => {
          onDowngrade(plan);
        },
      };
    }
    return {
      label: t('plan.action.take', { plan: plan.name }),
      tone: 'primary',
      run: () => {
        onPurchase(plan);
      },
    };
  }

  function limitValue(plan: Plan, key: keyof Plan['limits']): string {
    const value = plan.limits[key];
    if (value === undefined) return '—';
    if (value === null) return t('plan.unlimited');
    return value.toLocaleString('en-US');
  }

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
      {table.plans().map((plan) => {
        const option = table.option(plan.id, termId);
        const isCurrent = currentPlan?.id === plan.id;
        const act = action(plan);
        return (
          <article
            key={plan.id}
            className={`w-[min(82vw,300px)] shrink-0 snap-center rounded-card border bg-white p-4 shadow-card lg:w-auto ${
              isCurrent ? 'border-brand-300 bg-brand-50' : 'border-line'
            }`}
          >
            <h3 className="flex items-center justify-between gap-2 text-[18px] font-bold text-ink">
              {plan.name}
              {isCurrent ? <Tag tone="brand">{t('plan.current')}</Tag> : null}
              {scheduledTargetId === plan.id ? (
                <Tag tone="accent">{t('plan.scheduled')}</Tag>
              ) : null}
            </h3>
            <p className="num mt-2 text-[28px] leading-none font-bold tracking-tight text-ink">
              {option ? formatTaka(option.price) : '—'}
              <span className="ml-1 text-[13px] font-medium tracking-normal text-neutral-700">
                {option && option.term.months === 1
                  ? t('checkout.perMonth')
                  : option
                    ? t('checkout.perTerm', { months: option.term.months })
                    : ''}
              </span>
            </p>
            {option && option.term.months > 1 ? (
              <p className="num text-[13px] text-neutral-700">
                {t('checkout.monthlyEquivalent', { amount: formatTaka(option.monthly) })}
              </p>
            ) : null}
            {plan.description ? (
              <p className="mt-2 text-[14px] text-neutral-700">{plan.description}</p>
            ) : null}
            <ul className="mt-3 space-y-1 text-[14px]">
              {HEADLINE_LIMITS.map((key) => (
                <li key={key} className="flex justify-between gap-2">
                  <span className="text-neutral-700">{t(`plan.limit.${key}`)}</span>
                  <b className="num text-ink">{limitValue(plan, key)}</b>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              {isCurrent ? (
                <Button type="button" tone="outline" disabled>
                  {t('plan.youAreHere')}
                </Button>
              ) : act && option ? (
                <Button type="button" tone={act.tone} onClick={act.run}>
                  {act.label}
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}

      <article
        className={`w-[min(82vw,300px)] shrink-0 snap-center rounded-card border border-dashed bg-white p-4 shadow-card lg:w-auto ${
          state === TenantState.PayAsYouGo ? 'border-brand-300 bg-brand-50' : 'border-line-strong'
        }`}
      >
        <h3 className="flex items-center justify-between gap-2 text-[18px] font-bold text-ink">
          {t('plan.state.pay_as_you_go')}
          {state === TenantState.PayAsYouGo ? <Tag tone="brand">{t('plan.current')}</Tag> : null}
        </h3>
        <p className="num mt-2 text-[28px] leading-none font-bold tracking-tight text-ink">
          ৳0
          <span className="ml-1 text-[13px] font-medium tracking-normal text-neutral-700">
            {t('checkout.perMonth')}
          </span>
        </p>
        <p className="num mt-2 text-[14px] text-neutral-700">
          {t('plan.paygFees', {
            pct: rate(RateKey.PaygOrderFeePct),
            min: rate(RateKey.PaygOrderFeeMin),
            product: rate(RateKey.PaygProductFee),
          })}
        </p>
        <p className="mt-2 text-[13px] text-neutral-700">{t('plan.paygLimitsNote')}</p>
        <div className="mt-4">
          {state === TenantState.PayAsYouGo ? (
            <Button type="button" tone="outline" disabled>
              {t('plan.youAreHere')}
            </Button>
          ) : canManage && scheduledTargetId === null ? (
            <Button type="button" tone="outline" loading={paygPending} onClick={onPayg}>
              {trialOrPayg ? t('plan.action.choosePayg') : t('plan.action.switchPaygAtEnd')}
            </Button>
          ) : null}
        </div>
      </article>
    </div>
  );
}
