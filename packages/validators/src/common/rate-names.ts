import { RateKey } from '../db/enums';

/** What each rate's number counts. RAT-15, RAT-16: the verification fees are a percent of the payment, not an order. */
export type RateUnit = 'taka' | 'orderPercent' | 'paymentPercent' | 'characters';

/** RAT-01: each rate's unit, written once. */
export const RATE_UNITS: Readonly<Record<RateKey, RateUnit>> = {
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
};

/**
 * RAT-01, NTC-12: each rate's name in both languages, for words the server writes (a rate-change notice's template). The
 * same names as the operator console's own `rateNames`, which can read them from here when its screens are next changed.
 */
export const RATE_NAMES: Readonly<Record<RateKey, { bn: string; en: string }>> = {
  [RateKey.SmsPerUnit]: { bn: 'SMS, প্রতি পার্ট', en: 'SMS, per part' },
  [RateKey.AiReply]: { bn: 'চ্যাট AI উত্তর', en: 'Chat AI reply' },
  [RateKey.FraudCheck]: { bn: 'ফেক অর্ডার চেক', en: 'Fake-order check' },
  [RateKey.AiExtraction]: { bn: 'মেসেজ থেকে ঠিকানা পড়া', en: 'Address read from a message' },
  [RateKey.PaygOrderFeeMin]: {
    bn: 'পে-অ্যাজ-ইউ-গো অর্ডার ফি, ন্যূনতম',
    en: 'Pay-as-you-go order fee, minimum',
  },
  [RateKey.PaygOrderFeePct]: { bn: 'পে-অ্যাজ-ইউ-গো অর্ডার ফি', en: 'Pay-as-you-go order fee' },
  [RateKey.PaygProductFee]: { bn: 'পে-অ্যাজ-ইউ-গো প্রোডাক্ট ফি', en: 'Pay-as-you-go product fee' },
  [RateKey.SmsUnitSizeChars]: { bn: 'SMS পার্টের আকার', en: 'SMS part size' },
  [RateKey.ListenerVerificationPct]: {
    bn: 'লিসেনার ভেরিফিকেশন ফি',
    en: 'Listener verification fee',
  },
  [RateKey.GatewayVerificationPct]: { bn: 'গেটওয়ে ভেরিফিকেশন ফি', en: 'Gateway verification fee' },
};

/** A rate's value as words write it: ৳0.55, 1.5%, 160. */
export function rateValueWords(key: RateKey, value: string): string {
  const unit = RATE_UNITS[key];
  const figure = Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (unit === 'taka') return `৳${figure}`;
  if (unit === 'characters') return figure;
  return `${figure}%`;
}
