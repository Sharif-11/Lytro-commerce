import { useTranslation } from 'react-i18next';
import { useCancelSubscription } from '@/api/billing';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import type { LapseStages } from '@/types/me';
import { lapseDays } from './figures';

interface StopSheetProps {
  shopName: string;
  periodEnd: string;
  stages: LapseStages;
  onClose: () => void;
  onDone: () => void;
}

/** One step of a lapse, its dot coloured by how bad it is (the prototype's `.lapse-tl`). */
function Step({ tone, children }: { tone: 'warn' | 'bad'; children: string }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[18px_1fr] items-start gap-2.5 py-1 text-[14px]">
      <i
        className={[
          'relative mt-1.5 ml-1 size-2.5 rounded-full',
          "after:absolute after:top-3 after:left-1 after:h-[22px] after:w-0.5 after:bg-neutral-200 after:content-['']",
          '[div:last-child>&]:after:hidden',
          tone === 'warn' ? 'bg-warning' : 'bg-danger',
        ].join(' ')}
      />
      <span>{children}</span>
    </div>
  );
}

/**
 * Stop the subscription (TENANT-DASHBOARD-DESIGN §7.12, the prototype's `sh-cancel`, LIF-01): everything runs until the
 * period's end, then the dated steps of the lapse, on the days the shop's own schedule sets (LIF-26), and the line that
 * it can be undone any time before.
 */
export function StopSheet({
  shopName,
  periodEnd,
  stages,
  onClose,
  onDone,
}: StopSheetProps): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const cancel = useCancelSubscription();
  const date = formatDayMonth(periodEnd);
  const days = lapseDays(stages);

  return (
    <Sheet
      open
      title={t('cnTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('keep')}
          </Button>
          <Button
            tone="danger"
            busy={cancel.isPending}
            onClick={() => {
              cancel.mutate(undefined, { onSuccess: onDone });
            }}
          >
            {t('cnBtn', { date })}
          </Button>
        </>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('cnShop', { shop: shopName, date })}</p>
      <div className="mt-2 flex flex-col">
        <Step tone="warn">{t('cnStep1', { date, count: days.grace })}</Step>
        <Step tone="warn">{t('cnStep2', { day: days.viewOnly })}</Step>
        <Step tone="bad">{t('cnStep3', { day: days.locked })}</Step>
        <Step tone="bad">{t('cnStep4', { day: days.deleted })}</Step>
      </div>
      <p className="mt-2.5 text-[14px] text-fg-muted">{t('cnUndo', { date })}</p>
      {cancel.isError ? <Banner tone="bad">{errorText(cancel.error)}</Banner> : null}
    </Sheet>
  );
}
