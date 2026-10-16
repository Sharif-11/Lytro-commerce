import { useTranslation } from 'react-i18next';
import type { SeatUsage } from '@/types/staff';
import type { Plan } from '@/types/billing-admin';

interface UpsellBannerProps {
  seats: SeatUsage;
  threshold: number;
  plans: Plan[];
  currentPlan: Plan;
  onUpgrade: (plan: Plan) => void;
}

/** D2-12: "the dashboard surfaces a prompt when the tenant is near a plan limit... suggesting the plan
    that would raise that specific limit" — staff seats is the one metric this can check today (products/
    orders/storage usage don't exist until Phase 3/4). Renders nothing below the threshold, or when no
    higher-ranked for-sale plan would actually raise the seat limit. */
export function UpsellBanner({
  seats,
  threshold,
  plans,
  currentPlan,
  onUpgrade,
}: UpsellBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (seats.total === 0 || seats.used / seats.total < threshold) return null;

  const currentSeatLimit = currentPlan.limits.staff ?? 0;
  const next = plans
    .filter((plan) => plan.forSale && plan.rank > currentPlan.rank)
    .filter((plan) => (plan.limits.staff ?? 0) > currentSeatLimit)
    .sort((a, b) => a.rank - b.rank)[0];
  if (!next) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p>{t('billing.upsellSeats', { used: seats.used, total: seats.total, plan: next.name })}</p>
      <button
        type="button"
        onClick={() => {
          onUpgrade(next);
        }}
        className="font-medium text-amber-900 underline"
      >
        {t('billing.upgrade')}
      </button>
    </div>
  );
}
