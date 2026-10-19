import { useTranslation } from 'react-i18next';
import { ScheduledPlanChangeKind, TenantState } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dates';
import { daysUntil } from '@/lib/money';
import type { ScheduledPlanChange } from '@/types/billing';
import type { MeTenant } from '@/types/me';

interface PlanBannersProps {
  tenant: MeTenant;
  scheduled: ScheduledPlanChange | null;
  scheduledPlanName: string | null;
  cancelledAt: string | null;
  canManage: boolean;
  cancelScheduledPending: boolean;
  undoPending: boolean;
  onCancelScheduled: () => void;
  onUndoCancellation: () => void;
}

/** What needs attention, one banner at a time: a scheduled change (DWN-02, PYG-10), a pending cancellation,
    or a locked or archived shop with the day count and the way back (LIF-15). */
export function PlanBanners({
  tenant,
  scheduled,
  scheduledPlanName,
  cancelledAt,
  canManage,
  cancelScheduledPending,
  undoPending,
  onCancelScheduled,
  onUndoCancellation,
}: PlanBannersProps): React.JSX.Element | null {
  const { t, i18n } = useTranslation();

  if (scheduled) {
    const date = formatDate(scheduled.effectiveAt, i18n.language);
    return (
      <Banner tone="warning">
        <div>
          <b className="block text-[15px]">
            {scheduled.kind === ScheduledPlanChangeKind.PayAsYouGoSwitch
              ? t('plan.banner.paygOn', { date })
              : t('plan.banner.downgradeOn', { plan: scheduledPlanName ?? '', date })}
          </b>
          <span className="text-[13px]">{t('plan.banner.nothingBefore')}</span>
        </div>
        {canManage ? (
          <Button
            type="button"
            tone="outline"
            fit
            className="min-h-10! text-[14px]!"
            loading={cancelScheduledPending}
            onClick={onCancelScheduled}
          >
            {t('plan.banner.keepCurrent', { plan: tenant.planName ?? '' })}
          </Button>
        ) : null}
      </Banner>
    );
  }

  if (cancelledAt && tenant.periodEnd) {
    return (
      <Banner tone="danger">
        <div>
          <b className="block text-[15px]">
            {t('plan.banner.endsOn', { date: formatDate(tenant.periodEnd, i18n.language) })}
          </b>
          <span className="text-[13px]">{t('plan.banner.afterEnd')}</span>
        </div>
        {canManage ? (
          <Button
            type="button"
            tone="outline"
            fit
            className="min-h-10! text-[14px]!"
            loading={undoPending}
            onClick={onUndoCancellation}
          >
            {t('plan.banner.undo')}
          </Button>
        ) : null}
      </Banner>
    );
  }

  if (tenant.state === TenantState.Locked || tenant.state === TenantState.Archived) {
    const since = tenant.periodEnd ? daysSince(tenant.periodEnd) : null;
    return (
      <Banner tone="danger">
        <div>
          <b className="block text-[15px]">
            {tenant.state === TenantState.Locked
              ? t('plan.banner.locked', { days: since ?? 0 })
              : t('plan.banner.archived', { days: since ?? 0 })}
          </b>
          <span className="text-[13px]">{t('plan.banner.reopens')}</span>
        </div>
      </Banner>
    );
  }

  return null;
}

function daysSince(iso: string): number {
  const ahead = daysUntil(iso);
  if (ahead !== null && ahead > 0) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

function Banner({
  tone,
  children,
}: {
  tone: 'warning' | 'danger';
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`flex flex-col gap-2 rounded-card border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        tone === 'warning'
          ? 'border-warning/30 bg-warning-soft text-ink'
          : 'border-danger/30 bg-danger-soft text-ink'
      }`}
    >
      {children}
    </div>
  );
}
