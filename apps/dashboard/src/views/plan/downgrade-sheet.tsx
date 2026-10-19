import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDowngradePreview, useScheduleDowngrade } from '@/api/billing';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { Sheet } from '@/components/ui/sheet';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/money';
import type { Plan } from '@/types/billing';

interface DowngradeSheetProps {
  target: Plan | null;
  price: number | null;
  periodEnd: string | null;
  onClose: () => void;
  onScheduled: () => void;
}

/** DWN-01/03: the effective date in the first sentence, every over-limit item with its counts, one sentence
    per consequence (DWN-07/08), the new price, and the button named for the date. */
export function DowngradeSheet({
  target,
  price,
  periodEnd,
  onClose,
  onScheduled,
}: DowngradeSheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const preview = useDowngradePreview();
  const schedule = useScheduleDowngrade();
  const date = periodEnd ? formatDate(periodEnd, i18n.language) : '';

  const requestPreview = preview.mutate;
  useEffect(() => {
    if (target) requestPreview({ planId: target.id });
  }, [target, requestPreview]);

  function close(): void {
    onClose();
    preview.reset();
    schedule.reset();
  }

  const over = preview.data ?? [];

  return (
    <Sheet
      open={target !== null}
      title={target ? t('plan.downgradeTo', { plan: target.name }) : ''}
      onClose={close}
      footer={
        target ? (
          <div className="grid gap-2">
            <Button
              type="button"
              loading={schedule.isPending}
              onClick={() => {
                schedule.mutate({ planId: target.id }, { onSuccess: onScheduled });
              }}
            >
              {t('plan.downgradeOn', { date })}
            </Button>
            <Button type="button" tone="ghost" onClick={close}>
              {t('plan.keepCurrentPlan')}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] text-neutral-700">
          {t('plan.downgradeHappens', { plan: target?.name ?? '', date })}
        </p>
        {preview.isPending ? (
          <p className="text-[14px] text-neutral-700">{t('common.loading')}</p>
        ) : null}
        {preview.isError ? <ErrorBanner message={errorMessage(preview.error, t)} /> : null}
        {over.length > 0 ? (
          <>
            <p className="rounded-control border-l-[3px] border-accent-500 bg-accent-100 px-3.5 py-2.5 text-[14px] font-bold text-ink">
              {t('plan.overLimitCount', { count: over.length, plan: target?.name ?? '' })}
            </p>
            <ul className="space-y-1.5">
              {over.map((item) => (
                <li
                  key={item.key}
                  className="flex justify-between gap-3 rounded-control border border-accent-700/30 bg-accent-100 px-3 py-2 text-[14px]"
                >
                  <span>{t(`plan.limit.${item.key}`, { defaultValue: item.key })}</span>
                  <b className="num">
                    {item.used.toLocaleString('en-US')}{' '}
                    <span className="font-normal text-neutral-700">
                      / {item.limit.toLocaleString('en-US')}
                    </span>
                  </b>
                </li>
              ))}
            </ul>
            <p className="text-[14px] text-neutral-700">{t('plan.overLimitConsequence')}</p>
          </>
        ) : preview.data ? (
          <p className="text-[14px] text-neutral-700">{t('plan.nothingOver')}</p>
        ) : null}
        {schedule.isError ? <ErrorBanner message={errorMessage(schedule.error, t)} /> : null}
        {price !== null ? (
          <div className="flex justify-between gap-3 border-t border-line pt-3 text-[15px]">
            <span className="text-neutral-700">{t('plan.fromDate', { date })}</span>
            <b className="num text-ink">{formatTaka(price)}</b>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
