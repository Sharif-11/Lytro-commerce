import { RateKey } from '@lytronix/validators';
import { taka } from '@/lib/format';

type RateUnit = 'taka' | 'orderPercent' | 'paymentPercent' | 'characters' | 'perThousand';

/** What each rate's number counts. RAT-15, RAT-16: the verification fees are a percent of the payment, not an order. */
export const RATE_UNITS: Record<RateKey, RateUnit> = {
  [RateKey.SmsPerUnit]: 'taka',
  [RateKey.AiReply]: 'taka',
  [RateKey.FraudCheck]: 'taka',
  [RateKey.PaygOrderFeeMin]: 'taka',
  [RateKey.PaygOrderFeePct]: 'orderPercent',
  [RateKey.PaygProductFee]: 'taka',
  [RateKey.SmsUnitSizeChars]: 'characters',
  [RateKey.ListenerVerificationPct]: 'paymentPercent',
  [RateKey.GatewayVerificationPct]: 'paymentPercent',
  [RateKey.AiExtraction]: 'taka',
  // PAYG-FAIR-USE-PLAN PF-39 (RAT-17 to RAT-20): the steps of an order from Lytro, a manual booking, the API's 1,000s.
  [RateKey.PaygUnlockPhone]: 'taka',
  [RateKey.PaygUnlockConfirm]: 'taka',
  [RateKey.PaygBookingFee]: 'taka',
  [RateKey.PaygApiPerThousand]: 'perThousand',
};

/** A rate as the list shows it: ৳0.4, 1.5%, 160. */
export function rateWords(key: RateKey, value: string): string {
  const unit = RATE_UNITS[key];
  if (unit === 'taka' || unit === 'perThousand') return taka(value);
  if (unit === 'characters') return String(Number(value));
  return `${String(Number(value))}%`;
}
