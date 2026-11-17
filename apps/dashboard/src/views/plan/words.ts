import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import { limitFigure } from '@/lib/limits';
import type { Plan } from '@/types/billing';

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

/** A price as the plan cards and buttons write it: whole taka, "৳449". */
export function taka(amount: string | number): string {
  return formatTaka(amount);
}
