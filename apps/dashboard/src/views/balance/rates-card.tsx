import { useTranslation } from 'react-i18next';
import { RateKey } from '@lytronix/validators';
import { formatDate } from '@/lib/dates';
import type { RateValue } from '@/types/balance';

/** RAT-06: each per-use rate with its unit in words, and when the current values took effect. */
export function RatesCard({ rates }: { rates: RateValue[] | undefined }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const byKey = new Map((rates ?? []).map((rate) => [rate.key, rate]));
  const value = (key: RateKey): string => byKey.get(key)?.value ?? '–';
  const since =
    rates && rates.length > 0 ? rates.map((rate) => rate.effectiveFrom).sort()[0] : null;

  const rows: {
    key: RateKey;
    label: string;
    unit: string | null;
    prefix: string;
    suffix: string;
  }[] = [
    {
      key: RateKey.SmsPerUnit,
      label: 'SMS',
      unit: t('balance.rates.perPart', { chars: value(RateKey.SmsUnitSizeChars) }),
      prefix: '৳',
      suffix: '',
    },
    {
      key: RateKey.AiReply,
      label: t('balance.rates.aiReply'),
      unit: null,
      prefix: '৳',
      suffix: '',
    },
    {
      key: RateKey.FraudCheck,
      label: t('balance.rates.fraudCheck'),
      unit: null,
      prefix: '৳',
      suffix: '',
    },
    {
      key: RateKey.PaygOrderFeePct,
      label: t('balance.rates.paygOrderFee'),
      unit: t('balance.rates.paygOrderFeeMin', { min: value(RateKey.PaygOrderFeeMin) }),
      prefix: '',
      suffix: '%',
    },
    {
      key: RateKey.PaygProductFee,
      label: t('balance.rates.paygProductFee'),
      unit: null,
      prefix: '৳',
      suffix: '',
    },
  ];

  return (
    <section>
      <h2 className="mb-2 text-[17px] font-bold text-ink">{t('balance.rates.title')}</h2>
      <div className="rounded-card border border-line bg-white shadow-card">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-start justify-between gap-3 border-t border-line px-4 py-2.5 text-[15px] first:border-t-0"
          >
            <span>
              {row.label}
              {row.unit ? (
                <small className="block text-[12px] text-neutral-700">{row.unit}</small>
              ) : null}
            </span>
            <b className="num text-ink">
              {row.prefix}
              {value(row.key)}
              {row.suffix}
            </b>
          </div>
        ))}
        <p className="border-t border-line px-4 py-2.5 text-[13px] text-neutral-700">
          {since
            ? t('balance.rates.since', { date: formatDate(since, i18n.language) })
            : t('common.loading')}
        </p>
      </div>
    </section>
  );
}
