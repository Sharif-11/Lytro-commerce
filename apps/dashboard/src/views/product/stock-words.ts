import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import {
  MEASURED_STOCK_UNITS,
  PaymentPolicy,
  ProductFormField,
  type StockUnit,
} from '@lytronix/validators';
import type { OpeningBatch } from '@/lib/opening';

/** PRD-08: a payment policy in the shop's words: its name, and a short line for a field ("Advance ৳200"). */
export function usePolicyWords() {
  const { t } = useTranslation('shop');
  const name = (policy: PaymentPolicy): string => {
    switch (policy) {
      case PaymentPolicy.None:
        return t('policyNone');
      case PaymentPolicy.DeliveryChargeOnly:
        return t('policyDelivery');
      case PaymentPolicy.PartialAdvance:
        return t('policyPartial');
      case PaymentPolicy.FullPrepayment:
        return t('policyFull');
    }
  };
  const short = (policy: PaymentPolicy, advance: string | null): string =>
    policy === PaymentPolicy.None
      ? t('cashOnDelivery')
      : policy === PaymentPolicy.PartialAdvance && advance
        ? t('advanceOf', { amount: formatTaka(advance).replace('৳', '') })
        : name(policy);
  return { name, short };
}

/** A batch as a field or a table cell shows it: how much, then its expiry's month or its code ("24 · exp 2027-08"). */
export function useBatchText(): (quantity: string, batch: OpeningBatch) => string {
  const { t } = useTranslation('shop');
  return (quantity, batch) =>
    [
      quantity.trim(),
      batch.expiresOn
        ? `${t('expShort')} ${batch.expiresOn.slice(0, 7)}`
        : batch.code.trim() || null,
    ]
      .filter(Boolean)
      .join(' · ');
}

/** UOM-03: a unit stock and orders may count in fractions of. */
export const isMeasured = (unit: StockUnit): boolean => MEASURED_STOCK_UNITS.includes(unit);

/** PST-05: an up-front field by name, as the "what this type sets" card and the defaults banner say it. */
export function useFieldNames(): Record<ProductFormField, string> {
  const { t } = useTranslation('shop');
  return {
    [ProductFormField.StockTracking]: t('whyStock'),
    [ProductFormField.BatchTracked]: t('whyBatches'),
    [ProductFormField.SerialTracked]: t('whySerials'),
    [ProductFormField.ItemCondition]: t('conditionL'),
    [ProductFormField.SizeChart]: t('sizeChart'),
    [ProductFormField.WeightKg]: t('weightKg'),
    [ProductFormField.LowStockThreshold]: t('whyLow'),
    [ProductFormField.DeliveryCharge]: t('deliveryCharge'),
    [ProductFormField.PaymentPolicy]: t('payPolicy'),
  };
}
