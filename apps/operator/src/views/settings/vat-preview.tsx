import { useTranslation } from 'react-i18next';
import { PlatformSettingKey } from '@lytronix/validators';
import { StatusChip } from '@/components/ui/status-chip';
import { isUnset, VAT_KEYS } from '@/lib/setting-shapes';
import { formatSessionTime } from '@/lib/session-time';
import { includedVat } from '@/lib/vat-words';
import type { PlatformSetting } from '@/types/operator';

const TEXT = 'text-[14px] leading-[1.5] text-neutral-700';
const LINE =
  'flex justify-between gap-3 border-t border-dashed border-line py-1.5 text-[14px] text-ink first:border-t-0';
// The sketch's own example: a ৳449 plan bought by a shop in Dhaka, issued one morning.
const SAMPLE_PAISA = 44_900;
const SAMPLE_RATE = 15;
const SAMPLE_ISSUED = '2026-11-20T09:31:00+06:00';
const SAMPLE_BUYER = 'Megh Fashion · Rumana';
const SAMPLE_BUYER_ADDRESS = 'Shop 12, Rapa Plaza, Dhanmondi, Dhaka';

/**
 * D9-7, LEG-03 (Slice 9.9): above the VAT group's four rows -- when invoices show VAT, how many of the four are set, and
 * how a plan's invoice will read once they are, in the Mushak-6.3 form.
 */
export function VatPreview({ rows }: { rows: readonly PlatformSetting[] }): React.JSX.Element {
  const { t } = useTranslation();
  const value = (key: string): string => {
    const setting = rows.find((each) => each.key === key);
    return setting && !isUnset(setting.value) ? String(setting.value) : '';
  };
  const set = VAT_KEYS.filter((key) => value(key) !== '').length;
  const on = set === VAT_KEYS.length;
  const rate = on ? Number(value(PlatformSettingKey.VatRate)) : SAMPLE_RATE;
  return (
    <div className="flex flex-col gap-2.5">
      <div className={TEXT}>{t('settings.vat.note')}</div>
      <div>
        <StatusChip tone={on ? 'ok' : 'warn'}>
          {on ? t('settings.vat.on') : t('settings.vat.off', { n: set })}
        </StatusChip>
      </div>
      <div className="max-w-[440px] rounded-card border border-line bg-surface px-3.5 py-3">
        <div className={`${TEXT} mb-1.5`}>{t('settings.vat.preview')}</div>
        <div className="mb-1 text-[15px] font-semibold text-ink">{t('settings.vat.mushak')}</div>
        <div className={LINE}>
          <span className="text-neutral-700">INV-000214 · {t('settings.vat.issued')}</span>
          <span className="text-right">{formatSessionTime(SAMPLE_ISSUED)}</span>
        </div>
        <div className={LINE}>
          <span className="text-neutral-700">{t('settings.vat.seller')}</span>
          <span className="min-w-0 text-right [overflow-wrap:anywhere]">
            {on ? (
              <>
                {value(PlatformSettingKey.VatSellerName)} · BIN{' '}
                <span className="mono">{value(PlatformSettingKey.VatBin)}</span>
                <br />
                {value(PlatformSettingKey.VatSellerAddress)}
              </>
            ) : (
              t('settings.vat.unset')
            )}
          </span>
        </div>
        <div className={LINE}>
          <span className="text-neutral-700">{t('settings.vat.buyer')}</span>
          <span className="min-w-0 text-right [overflow-wrap:anywhere]">
            {SAMPLE_BUYER}
            <br />
            {SAMPLE_BUYER_ADDRESS}
          </span>
        </div>
        <div className={LINE}>
          <span className="text-neutral-700">{t('settings.vat.samplePlan')}</span>
          <span className="tabular-nums">৳449.00</span>
        </div>
        <div className={LINE}>
          <span className="text-neutral-700">{t('settings.vat.included', { r: rate })}</span>
          <span className="tabular-nums">৳{includedVat(SAMPLE_PAISA, rate)}</span>
        </div>
        <div className={`${LINE} border-t border-solid border-ink font-semibold`}>
          <span>{t('settings.vat.total')}</span>
          <span className="tabular-nums">৳449.00</span>
        </div>
        <div className={`${TEXT} mt-2`}>{t('settings.vat.plain')}</div>
      </div>
    </div>
  );
}
