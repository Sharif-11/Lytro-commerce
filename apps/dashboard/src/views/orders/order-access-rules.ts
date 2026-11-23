import { formatTaka } from '@lytronix/ui';
import { OrderAccess } from '@lytronix/validators';
import { useShell } from '@/shell/shell-context';
import type { MeFairUse } from '@/types/me';
import type { Order } from '@/types/orders';

/** PAYG-FAIR-USE-PLAN: the three prices an order from Lytro names, as the shop's /me says them. */
export function useUnlockPrices(): { phone: string; confirm: string; total: string } {
  const { tenant } = useShell();
  const fair: MeFairUse | undefined = tenant.fairUse;
  const phone = Number(fair?.unlockPhone ?? '7');
  const confirm = Number(fair?.unlockConfirm ?? '3');
  return {
    phone: formatTaka(phone),
    confirm: formatTaka(confirm),
    total: formatTaka(phone + confirm),
  };
}

/** Whether the order is still being opened: locked (step 0) or with only its phone shown (step 1). */
export const opening = (order: Pick<Order, 'access'>): boolean =>
  order.access === OrderAccess.Locked || order.access === OrderAccess.Phone;
