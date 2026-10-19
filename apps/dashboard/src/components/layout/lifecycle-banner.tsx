import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { daysUntil } from '@/lib/money';
import type { MeTenant } from '@/types/me';

interface LifecycleBannerProps {
  slug: string;
  tenant: MeTenant;
}

/** TRL-08 and LIF-05/06/11/12: one banner per lifecycle state, mounted once in the shell. The trial banner
    says what happens at day 30 (pay-as-you-go, nothing lost, TRL-07) and links to the plans. */
export function LifecycleBanner({ slug, tenant }: LifecycleBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const days = daysUntil(tenant.periodEnd);

  switch (tenant.state) {
    case TenantState.Trial:
      return (
        <Banner tone="info">
          <span>
            {days === null
              ? t('lifecycle.trialNoEnd')
              : t('lifecycle.trialDaysLeft', { count: days })}{' '}
            {t('lifecycle.trialWhatHappens')}
          </span>
          <PlansLink slug={slug} label={t('lifecycle.seePlans')} />
        </Banner>
      );
    case TenantState.Grace:
      return (
        <Banner tone="warning">
          <span>
            {t('lifecycle.graceNotice')}{' '}
            {days !== null ? t('lifecycle.renewByDays', { count: days }) : null}
          </span>
          <PlansLink slug={slug} label={t('lifecycle.renewNow')} />
        </Banner>
      );
    case TenantState.ReadOnly:
      return (
        <Banner tone="warning">
          <span>{t('lifecycle.readOnlyNotice')}</span>
          <PlansLink slug={slug} label={t('lifecycle.renewNow')} />
        </Banner>
      );
    case TenantState.Locked:
      return (
        <Banner tone="danger">
          <span>{t('lifecycle.lockedNotice')}</span>
          <PlansLink slug={slug} label={t('lifecycle.renewNow')} />
        </Banner>
      );
    case TenantState.Archived:
      return (
        <Banner tone="danger">
          <span>{t('lifecycle.archivedNotice')}</span>
          <PlansLink slug={slug} label={t('lifecycle.seePlans')} />
        </Banner>
      );
    default:
      return null;
  }
}

function PlansLink({ slug, label }: { slug: string; label: string }): React.JSX.Element {
  return (
    <Link
      to="/$shop/plan"
      params={{ shop: slug }}
      className="inline-flex min-h-9 shrink-0 items-center rounded-control border border-current/30 px-3 text-[13px] font-bold"
    >
      {label}
    </Link>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: 'info' | 'warning' | 'danger';
  children: React.ReactNode;
}): React.JSX.Element {
  const toneClass = {
    info: 'bg-brand-50 text-brand-900',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <div
      className={`flex flex-col gap-2 px-4 py-3 text-[14px] sm:flex-row sm:items-center sm:justify-between sm:px-6 ${toneClass}`}
    >
      {children}
    </div>
  );
}
