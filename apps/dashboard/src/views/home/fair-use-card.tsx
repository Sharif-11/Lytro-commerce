import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { TenantState } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { buttonClass } from '@/components/ui/classes';
import { formatDayMonth } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';

const DAY_MS = 86_400_000;

/**
 * PYG-25 (PAYG-FAIR-USE-PLAN PF-13, PF-35, the sketch's `pf-home`, `pf-day25` and `pf-day29`): on the home, a pay-as-you-go
 * shop whose storefront is paused is asked for its one ৳10 top-up -- the sheet opens on it -- or a plan; a trial is told
 * five days before it ends, then on its last day. Nothing with fair use off.
 */
export function FairUseCard(): React.JSX.Element | null {
  const { t } = useTranslation('home');
  const { tenant, slug } = useShell();
  const fair = tenant.fairUse;
  if (fair?.on !== true) return null;
  const amount = formatTaka(fair.activationTopUp);
  const topUp = (
    <Link
      to="/$shop/balance"
      params={{ shop: slug }}
      search={{ topup: 1, amount: fair.activationTopUp }}
      className={buttonClass('primary', 'md')}
    >
      {t('fairTopUp', { amount })}
    </Link>
  );
  const plans = (
    <Link to="/$shop/plan" params={{ shop: slug }} className={buttonClass('outline', 'md')}>
      {t('fairPlans')}
    </Link>
  );
  if (fair.paused) {
    return (
      <div className="rounded-card border border-line bg-warning-soft px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 flex-none items-center justify-center rounded-[12px] bg-surface text-warning">
            <Icon name="shop" size={24} />
          </span>
          <h3 className="text-[18px] font-bold">{t('fairPausedT')}</h3>
        </div>
        <p className="mt-3 text-[15px] leading-[1.6]">{t('fairPausedB', { amount })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {topUp}
          {plans}
        </div>
        <p className="mt-3 flex items-start gap-2 text-[14px] text-fg-muted">
          <Icon name="check" size={16} />
          <span>{t('fairPausedFine')}</span>
        </p>
      </div>
    );
  }
  if (tenant.state !== TenantState.Trial || tenant.periodEnd === null) return null;
  const end = new Date(tenant.periodEnd);
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / DAY_MS);
  if (daysLeft > 5 || daysLeft < 0) return null;
  if (daysLeft <= 1) {
    return (
      <div className="rounded-card border border-line bg-danger-soft px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 flex-none items-center justify-center rounded-[12px] bg-surface text-danger-text">
            <Icon name="alert" size={24} />
          </span>
          <h3 className="text-[18px] font-bold">{t('fairLastDayT')}</h3>
        </div>
        <p className="mt-3 text-[15px] leading-[1.6]">{t('fairLastDayB', { amount })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {topUp}
          {plans}
        </div>
      </div>
    );
  }
  return (
    <Banner
      tone="warn"
      icon="clock"
      action={
        <Link
          to="/$shop/balance"
          params={{ shop: slug }}
          search={{ topup: 1, amount: fair.activationTopUp }}
        >
          {t('fairTopUpShort')}
        </Link>
      }
    >
      <b>{t('fairDaysT', { count: daysLeft })}</b>{' '}
      {t('fairDaysB', { day: formatDayMonth(tenant.periodEnd), amount })}
    </Banner>
  );
}
