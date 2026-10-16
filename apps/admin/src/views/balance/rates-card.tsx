import { useTranslation } from 'react-i18next';
import { RateKey } from '@lytronix/validators';
import type { RateValue } from '@/types/balance';

interface RatesCardProps {
  rates: RateValue[] | undefined;
  isLoading: boolean;
}

const RATE_LABEL_KEYS: Record<RateKey, string> = {
  [RateKey.SmsPerUnit]: 'balance.rate.smsPerUnit',
  [RateKey.AiReply]: 'balance.rate.aiReply',
  [RateKey.FraudCheck]: 'balance.rate.fraudCheck',
  [RateKey.PaygOrderFeeMin]: 'balance.rate.paygOrderFeeMin',
  [RateKey.PaygOrderFeePct]: 'balance.rate.paygOrderFeePct',
  [RateKey.PaygProductFee]: 'balance.rate.paygProductFee',
  [RateKey.SmsUnitSizeChars]: 'balance.rate.smsUnitSizeChars',
};

/** Presentational, read-only (RAT-06): a tenant only ever sees the current value, never edits one --
    that's the operator console's job (slice 8's own operator-side scope). */
export function RatesCard({ rates, isLoading }: RatesCardProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (isLoading || !rates || rates.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">{t('balance.ratesTitle')}</h2>
      <dl className="mt-3 space-y-2">
        {rates.map((rate) => (
          <div key={rate.key} className="flex items-center justify-between text-sm">
            <dt className="text-slate-600">{t(RATE_LABEL_KEYS[rate.key])}</dt>
            <dd className="text-right text-slate-900">
              {rate.value}
              <span className="ml-2 text-xs text-slate-400">
                {t('balance.ratesEffectiveFrom', {
                  date: new Date(rate.effectiveFrom).toLocaleDateString(),
                })}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
