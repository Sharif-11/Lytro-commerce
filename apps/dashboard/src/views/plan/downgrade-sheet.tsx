import { useTranslation } from 'react-i18next';
import { useDowngradePreview, useScheduleDowngrade } from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Kv } from '@/components/ui/kv';
import { Eyebrow } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { sentenceCase } from '@/lib/limits';
import type { PlanPriceOption } from '@/types/billing';
import { overLimits } from './figures';
import { taka } from './words';

interface DowngradeSheetProps {
  option: PlanPriceOption;
  periodEnd: string | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Move down (TENANT-DASHBOARD-DESIGN §7.12, the prototype's `downgrade`, DWN-01, DWN-03): the date first, then what the
 * smaller plan would leave over its limits with the figures, one sentence for each consequence, the new price, and the
 * button named for the date. Nothing changes or is charged before it.
 */
export function DowngradeSheet({
  option,
  periodEnd,
  onClose,
  onDone,
}: DowngradeSheetProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const preview = useDowngradePreview(option.planId);
  const schedule = useScheduleDowngrade();
  const date = periodEnd ? formatDayMonth(periodEnd) : '';
  const over = overLimits(preview.data ?? []);
  const products = over.find((item) => item.key === 'products');
  const seats = over.find((item) => item.key === 'staff');

  return (
    <Sheet
      open
      title={t('dgTitle', { plan: option.planName })}
      onClose={onClose}
      footer={
        <Button
          busy={schedule.isPending}
          onClick={() => {
            schedule.mutate({ planId: option.planId }, { onSuccess: onDone });
          }}
        >
          {t('dgConfirm', { date })}
        </Button>
      }
    >
      <p className="text-[15px]">{t('dgWhen', { date })}</p>
      {preview.isError ? <Banner tone="bad">{errorText(preview.error)}</Banner> : null}
      {over.length > 0 ? (
        <>
          <Eyebrow>{t('dgOver')}</Eyebrow>
          <div className="rounded-card bg-warning-soft px-3 py-1">
            {over.map((item) => (
              <Kv
                key={item.key}
                label={sentenceCase(t(`lim.${item.key}`, { defaultValue: item.key }))}
                value={`${item.usedText} / ${item.limitText}`}
              />
            ))}
          </div>
          {products ? (
            <p className="text-[14px] text-fg-muted">
              {t('dgNote1', { limit: products.limitText })}
            </p>
          ) : null}
          {seats ? <p className="text-[14px] text-fg-muted">{t('dgNote2')}</p> : null}
        </>
      ) : null}
      <Kv label={t('dgPrice')} value={taka(option.price)} total />
      {schedule.isError ? <Banner tone="bad">{errorText(schedule.error)}</Banner> : null}
    </Sheet>
  );
}
