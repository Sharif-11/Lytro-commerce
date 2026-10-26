import { RateKey } from '@lytronix/validators';
import { formatRate, formatTaka } from '@lytronix/ui';
import { useCurrentRates } from '@/api/balance';

/** Pay-as-you-go's fees as its lines write them: "৳20 or 1.5% per order · ৳10 per product" (RAT-01, PYG-01). */
export interface PaygFees {
  min: string;
  pct: string;
  product: string;
}

/** The platform's current fee rates, a dash for any it cannot read. */
export function usePaygFees(): PaygFees {
  const rates = useCurrentRates();
  const value = (key: RateKey): string | null =>
    rates.data?.find((rate) => rate.key === key)?.value ?? null;
  const money = (key: RateKey): string => {
    const found = value(key);
    return found === null ? '–' : formatTaka(found);
  };
  return {
    min: money(RateKey.PaygOrderFeeMin),
    pct: formatRate(value(RateKey.PaygOrderFeePct)),
    product: money(RateKey.PaygProductFee),
  };
}
