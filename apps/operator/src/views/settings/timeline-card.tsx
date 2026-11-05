import { useTranslation } from 'react-i18next';
import { ConsoleCard } from '@/components/ui/console-page';

/**
 * LIF-26: what the stage lengths do to a shop whose paid period ends on day 0, drawn from what is on screen: a length
 * being changed counts here before it is saved, so a change can be checked against its effect.
 */
export function TimelineCard({
  grace,
  readOnly,
  locked,
  archived,
}: {
  grace: number;
  readOnly: number;
  locked: number;
  archived: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  const readOnlyEnd = grace + readOnly;
  const lockedEnd = readOnlyEnd + locked;
  const archivedEnd = lockedEnd + archived;
  const steps = [
    { title: `0 · ${t('settings.tlEnd')}` },
    {
      title: `0–${String(grace)} · ${t('settingNames.grace_days')}`,
      detail: t('settings.tlGrace'),
    },
    {
      title: `${String(grace)}–${String(readOnlyEnd)} · ${t('settingNames.read_only_days')}`,
      detail: t('settings.tlReadOnly'),
    },
    {
      title: `${String(readOnlyEnd)}–${String(lockedEnd)} · ${t('settingNames.locked_days')}`,
      detail: t('settings.tlLocked'),
    },
    {
      title: `${String(lockedEnd)}–${String(archivedEnd)} · ${t('settingNames.archived_days')}`,
      detail: t('settings.tlArchived'),
    },
  ];
  const dot = 'absolute top-[5px] -left-[18px] size-3 rounded-full border-2';
  return (
    <ConsoleCard>
      <h3 className="mb-1 text-[16px] font-semibold">{t('settings.timeline')}</h3>
      <div className="mb-3 text-[13px] text-fg-muted">{t('settings.timelineHint')}</div>
      <div className="relative flex flex-col pl-[18px] before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-0.5 before:bg-line">
        {steps.map((step) => (
          <div key={step.title} className="relative pb-3.5">
            <span className={`${dot} border-primary bg-surface`} />
            <div className="text-[14px] font-semibold">{step.title}</div>
            {step.detail ? <div className="text-[13px] text-fg-muted">{step.detail}</div> : null}
          </div>
        ))}
        <div className="relative">
          <span className={`${dot} border-danger bg-danger`} />
          <div className="text-[14px] font-semibold">
            {t('settings.tlDelete', { n: archivedEnd })}
          </div>
        </div>
      </div>
    </ConsoleCard>
  );
}
