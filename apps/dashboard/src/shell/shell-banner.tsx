import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
import { daysUntil } from '@lytronix/ui';
import { Banner } from '@/components/ui/banner';
import { useOnline } from '@/hooks/use-online';
import { daysSince } from '@/lib/dates';
import { allows } from './hubs';
import { useShell } from './shell-context';

// TRL-08: inside its last days, the trial's banner turns from information to a warning.
const TRIAL_WARNING_DAYS = 3;

/**
 * TENANT-DASHBOARD-DESIGN §4.6 and §7.20: the one banner at the top of the page, the first that applies -- the
 * owner's bounced email (NTF-06), the shop's lifecycle (trial, grace, read-only), then being offline. The support view's
 * bar (ADM-05) joins with Phase 8; urgent notices scroll in their own band under the bars (NTC-04). Its way out goes to the plan, for whoever may see the plan.
 */
export function ShellBanner(): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const { slug, tenant, viewer, emailBounced } = useShell();
  const online = useOnline();

  const toPlans = (label: string): React.JSX.Element | undefined =>
    allows(viewer, [Permission.PaymentsRead]) ? (
      <Link to="/$shop/plan" params={{ shop: slug }} className="text-primary">
        {label}
      </Link>
    ) : undefined;

  // NTF-06, D7-38 (Part 37's `p37-bounced`): the owner's email bounces, so Lytro stopped emailing it, before anything else.
  if (emailBounced && viewer.isOwner) {
    return (
      <Banner
        tone="bad"
        action={
          <Link to="/$shop/account" params={{ shop: slug }} className="text-primary">
            {t('p37BounceFix')}
          </Link>
        }
      >
        {t('p37BounceB')}
      </Banner>
    );
  }
  if (tenant.state === TenantState.Trial) {
    const left = daysUntil(tenant.periodEnd);
    if (left !== null && left <= TRIAL_WARNING_DAYS) {
      return (
        <Banner tone="warn" action={toPlans(t('seePlans'))}>
          {t('bTrialSoon', { n: left })}
        </Banner>
      );
    }
    if (left !== null) {
      return (
        <Banner tone="info" action={toPlans(t('seePlans'))}>
          {t('bTrial', { n: left })}
        </Banner>
      );
    }
  }
  if (tenant.state === TenantState.Grace) {
    return (
      <Banner tone="warn" action={toPlans(t('renew'))}>
        {t('bGrace', { n: daysSince(tenant.periodEnd) ?? 0 })}
      </Banner>
    );
  }
  if (tenant.state === TenantState.ReadOnly) {
    return (
      <Banner tone="neutral" action={toPlans(t('renew'))}>
        {t('bReadonly')}
      </Banner>
    );
  }
  if (!online) return <Banner tone="neutral">{t('bOffline')}</Banner>;
  return null;
}
