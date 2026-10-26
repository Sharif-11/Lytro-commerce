import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import { limitFigure } from '@/lib/limits';
import type { Plan } from '@/types/billing';
import type { PaygFees } from './payg-fees';

/** The new amount when the server refused the one the seller saw (BIL-09's AmountChanged), else null. */
export function changedAmount(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.code !== 'conflict') return null;
  const amount = error.details.amount;
  return typeof amount === 'string' ? amount : null;
}

/** A plan's four limits as its card lists them: products, orders a month, seats, storage. */
export function useLimitLines(): (plan: Plan | undefined) => string[] {
  const { t } = useTranslation('money');
  return (plan) => {
    if (!plan) return [];
    const lines: string[] = [];
    const add = (key: 'lProducts' | 'lOrders' | 'lSeats' | 'lStorage', value: string | null) => {
      if (value !== null) lines.push(t(key, { n: value }));
    };
    add('lProducts', limitFigure('products', plan.limits.products));
    add('lOrders', limitFigure('orders_handled_monthly', plan.limits.orders_handled_monthly));
    add('lSeats', limitFigure('staff', plan.limits.staff));
    add('lStorage', limitFigure('storage_mb', plan.limits.storage_mb));
    return lines;
  };
}

/** Pay-as-you-go's card lines (the prototype's dashed card): its fees, its products and its seats. */
export function usePaygLines(fees: PaygFees): (plan: Plan) => string[] {
  const { t } = useTranslation('money');
  return (plan) => {
    const lines = [t('paygFees', { ...fees })];
    const products = limitFigure('products', plan.limits.products);
    const seats = limitFigure('staff', plan.limits.staff);
    if (products !== null) lines.push(t('lProducts', { n: products }));
    if (seats !== null) lines.push(t('lSeats', { n: seats }));
    return lines;
  };
}

/** A price as the plan cards and buttons write it: whole taka, "৳449". */
export function taka(amount: string | number): string {
  return formatTaka(amount);
}
