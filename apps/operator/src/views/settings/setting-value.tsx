import { useTranslation } from 'react-i18next';
import { LARGE_VALUE } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { taka } from '@/lib/format';
import { isUnset, type SettingUnit } from '@/lib/setting-shapes';
import { hourWords, pricesWords } from '@/lib/setting-words';
import type { PlatformSetting } from '@/types/operator';

/** A setting's value as its row shows it, large with what it counts. */
export function SettingValue({
  setting,
  unit,
}: {
  setting: PlatformSetting;
  unit: SettingUnit;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { value } = setting;
  // D8-76: a help number or the alert's address not set yet, or cleared.
  if ((unit === 'phone' || unit === 'email') && isUnset(value)) {
    return <StatusChip tone="warn">{t('settings.notSet')}</StatusChip>;
  }
  if (unit === 'phone' || unit === 'email') {
    return <span className="mono font-semibold [overflow-wrap:anywhere]">{String(value)}</span>;
  }
  if (unit === 'hour' || unit === 'usd') {
    return (
      <span className={LARGE_VALUE}>
        {unit === 'hour' ? hourWords(Number(value)) : `$${String(value)}`}{' '}
        <span className="text-[13px] font-medium text-fg-muted">
          {t(unit === 'hour' ? 'settings.everyDay' : 'settings.aMonth')}
        </span>
      </span>
    );
  }
  if (unit === 'dayOfMonth') {
    return <span className="font-semibold">{t('settings.dayOfMonth', { n: String(value) })}</span>;
  }
  if (unit === 'prices') {
    return (
      <span className="text-[13px] font-medium whitespace-normal text-neutral-700">
        {pricesWords(value, t)}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap justify-end gap-1">
        {value.map((each) => (
          <span
            key={each}
            className="mono inline-flex h-[22px] items-center rounded-full bg-neutral-100 px-2 text-[12px] font-semibold text-neutral-700"
          >
            {each}
          </span>
        ))}
      </span>
    );
  }
  const plain = typeof value === 'string' ? value : JSON.stringify(value);
  if (unit === 'choice') {
    return (
      <span className="text-right font-semibold">
        {t(`settings.orderLimit.${plain}`, { defaultValue: plain })}
      </span>
    );
  }
  if (unit === 'ai') {
    return (
      <span className="font-semibold">
        {t(`settings.aiProviders.${plain}`, { defaultValue: plain })}
      </span>
    );
  }
  if (unit === 'model') {
    return <span className="mono font-semibold [overflow-wrap:anywhere]">{plain}</span>;
  }
  if (unit === 'version' || unit === 'text') {
    return <span className="mono font-semibold">{plain}</span>;
  }
  if (unit === 'taka') return <span className={LARGE_VALUE}>{taka(Number(value))}</span>;
  return (
    <span className={LARGE_VALUE}>
      {plain}{' '}
      <span className="text-[13px] font-medium text-fg-muted">{t(`settings.units.${unit}`)}</span>
    </span>
  );
}
