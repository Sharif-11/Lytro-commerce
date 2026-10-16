import { useTranslation } from 'react-i18next';
import type { ScheduledPlanChange } from '@/types/billing';
import type { Plan } from '@/types/billing-admin';

interface ScheduledDowngradeBannerProps {
  change: ScheduledPlanChange;
  plans: Plan[];
  onCancel: () => void;
  pending: boolean;
}

/** DWN-02: the owner's own banner data, read straight off `GET /billing/downgrade` (null when nothing is
    scheduled, so the container only renders this when there's something to show). */
export function ScheduledDowngradeBanner({
  change,
  plans,
  onCancel,
  pending,
}: ScheduledDowngradeBannerProps): React.JSX.Element {
  const { t } = useTranslation();
  const targetPlan = plans.find((plan) => plan.id === change.targetPlanId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p>
        {t('billing.scheduledDowngradeNotice', {
          name: targetPlan?.name ?? change.targetPlanId,
          date: new Date(change.effectiveAt).toLocaleDateString(),
        })}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className="font-medium text-amber-900 underline disabled:opacity-60"
      >
        {t('billing.cancelScheduledDowngrade')}
      </button>
    </div>
  );
}
