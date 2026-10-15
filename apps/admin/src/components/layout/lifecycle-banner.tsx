import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import type { MeResponse } from '@/types/me';

interface LifecycleBannerProps {
  tenant: MeResponse['tenant'];
}

function daysUntil(periodEnd: string | null): number | null {
  if (!periodEnd) return null;
  const ms = new Date(periodEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** LIF-05/06/11/12: one banner per lapsed/trial state, mounted once in DashboardShell rather than per-page.
    Grace shows an exact day countdown (TRL-08's own pattern, reused here) because that only needs `/me`'s
    own `periodEnd` — read_only/locked/archived don't get one: the grace/read-only/locked day-lengths that
    would be needed to compute "days left in *this* stage" are operator-configurable settings
    (LifecycleService.stageLengths) with no route exposing them to the tenant dashboard, so those three stay
    qualitative rather than guessing a number. PayAsYouGo and Active render nothing — Active's own downgrade
    banner lives on the billing page instead (ScheduledDowngradeBanner), not here. */
export function LifecycleBanner({ tenant }: LifecycleBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!tenant) return null;

  switch (tenant.state) {
    case TenantState.Trial: {
      const days = daysUntil(tenant.periodEnd);
      return (
        <Banner tone="info">
          {days === null
            ? t('lifecycle.trialNoEnd')
            : t('lifecycle.trialDaysLeft', { count: days })}{' '}
          <Link to="/dashboard/billing" className="font-semibold underline">
            {t('lifecycle.buyPlan')}
          </Link>
        </Banner>
      );
    }
    case TenantState.Grace: {
      const days = daysUntil(tenant.periodEnd);
      return (
        <Banner tone="warning">
          {t('lifecycle.graceNotice')}{' '}
          {days !== null ? t('lifecycle.renewByDays', { count: days }) : null}{' '}
          <Link to="/dashboard/billing" className="font-semibold underline">
            {t('lifecycle.renewNow')}
          </Link>
        </Banner>
      );
    }
    case TenantState.ReadOnly:
      return (
        <Banner tone="warning">
          {t('lifecycle.readOnlyNotice')}{' '}
          <Link to="/dashboard/billing" className="font-semibold underline">
            {t('lifecycle.renewNow')}
          </Link>
        </Banner>
      );
    case TenantState.Locked:
      return (
        <Banner tone="danger">
          {t('lifecycle.lockedNotice')}{' '}
          <Link to="/dashboard/billing" className="font-semibold underline">
            {t('lifecycle.renewNow')}
          </Link>
        </Banner>
      );
    case TenantState.Archived:
      return (
        <Banner tone="danger">
          {t('lifecycle.archivedNotice')}{' '}
          <Link to="/dashboard/billing" className="font-semibold underline">
            {t('lifecycle.buyPlan')}
          </Link>
        </Banner>
      );
    default:
      return null;
  }
}

function Banner({
  tone,
  children,
}: {
  tone: 'info' | 'warning' | 'danger';
  children: React.ReactNode;
}): React.JSX.Element {
  const toneClass = {
    info: 'bg-brand-50 text-brand-800',
    warning: 'bg-amber-50 text-amber-800',
    danger: 'bg-red-50 text-red-800',
  }[tone];
  return <div className={`px-4 py-3 text-center text-sm sm:px-6 ${toneClass}`}>{children}</div>;
}
