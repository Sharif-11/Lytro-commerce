import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/error-banner';
import type { OverLimitItem } from '@/types/billing';
import type { Plan } from '@/types/billing-admin';

interface DowngradePanelProps {
  targetPlan: Plan;
  overLimitItems: OverLimitItem[] | undefined;
  previewLoading: boolean;
  onSchedule: () => void;
  onCancel: () => void;
  schedulePending: boolean;
  error: string | null;
}

/** DWN-03: shows whatever the preview found over the target plan's limits before letting the owner commit
    — scheduling is still allowed even when over a limit (DWN-03 is a warning, not a hard block; the server
    itself doesn't refuse the schedule call for this), so the warning is informational, not disabling. */
export function DowngradePanel({
  targetPlan,
  overLimitItems,
  previewLoading,
  onSchedule,
  onCancel,
  schedulePending,
  error,
}: DowngradePanelProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">
        {t('billing.downgradeTitle', { name: targetPlan.name })}
      </h2>

      {previewLoading ? <p className="text-sm text-slate-500">{t('common.loading')}</p> : null}
      {!previewLoading && overLimitItems && overLimitItems.length > 0 ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">{t('billing.downgradeOverLimitWarning')}</p>
          <ul className="mt-1 list-inside list-disc">
            {overLimitItems.map((item) => (
              <li key={item.key}>
                {t(`billing.limit.${item.key}`, { defaultValue: item.key })}: {item.used} /{' '}
                {item.limit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}

      <div className="flex gap-2">
        <Button type="button" loading={schedulePending} onClick={onSchedule} className="w-auto!">
          {t('billing.scheduleDowngrade')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="w-auto!">
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
