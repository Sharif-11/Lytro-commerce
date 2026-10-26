import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RateKey } from '@lytronix/validators';
import { formatTakaExact } from '@lytronix/ui';
import { Card } from '@/components/ui/card';
import { Kv } from '@/components/ui/kv';
import { formatDayMonthYear } from '@/lib/dates';
import type { RateValue } from '@/types/balance';

// What the balance pays per use (RAT-06), in the sketch's order; the rest join with their phases.
const SHOWN: readonly { key: RateKey; word: 'rateSms' | 'rateFraud' | 'rateAi' }[] = [
  { key: RateKey.SmsPerUnit, word: 'rateSms' },
  { key: RateKey.FraudCheck, word: 'rateFraud' },
  { key: RateKey.AiReply, word: 'rateAi' },
];

/** Current rates (TENANT-DASHBOARD-DESIGN §7.11, RAT-06): each per-use rate and when the newest took effect. */
export const RatesCard = forwardRef<HTMLDivElement, { rates: RateValue[] }>(function RatesCard(
  { rates },
  ref,
) {
  const { t } = useTranslation('money');
  const valueOf = (key: RateKey): string | undefined =>
    rates.find((rate) => rate.key === key)?.value;
  const newest = rates
    .map((rate) => rate.effectiveFrom)
    .sort()
    .at(-1);
  const chars = valueOf(RateKey.SmsUnitSizeChars);
  return (
    <div ref={ref} className="scroll-mt-4">
      <Card>
        <h3 className="mb-1 text-[17px] font-semibold">{t('rates')}</h3>
        <div className="mt-1">
          {SHOWN.flatMap(({ key, word }) => {
            const value = valueOf(key);
            if (value === undefined) return [];
            return [
              <Kv
                key={key}
                label={t(word, { chars: chars ? Number(chars) : 70 })}
                value={formatTakaExact(value)}
              />,
            ];
          })}
        </div>
        {newest ? (
          <p className="mt-2 text-[14px] text-fg-muted">
            {t('effective', { date: formatDayMonthYear(newest) })}
          </p>
        ) : null}
      </Card>
    </div>
  );
});
