import { RateKey } from '@lytronix/validators';
import { taka } from '@/lib/format';

type RateUnit = 'taka' | 'orderPercent' | 'paymentPercent' | 'characters';

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
};

/** A rate as the list shows it: ৳0.4, 1.5%, 160. */
export function rateWords(key: RateKey, value: string): string {
  const unit = RATE_UNITS[key];
  if (unit === 'taka') return taka(value);
  if (unit === 'characters') return String(Number(value));
  return `${String(Number(value))}%`;
}
