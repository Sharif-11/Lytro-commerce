import { z } from 'zod';
import { CancelReason } from '@lytronix/validators';
import { ALL_TABS, type OrderFilter } from '@/api/orders';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The list's tab, search, dates and cancel reason, in the address of the list and of an order beside it. */
export const ordersSearch = z.object({
  tab: z.enum(ALL_TABS).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  from: z.string().regex(DAY).optional().catch(undefined),
  to: z.string().regex(DAY).optional().catch(undefined),
  reason: z.nativeEnum(CancelReason).optional().catch(undefined),
});

export type OrdersSearch = z.infer<typeof ordersSearch>;

/** The list's place in the address, so Back from an order returns to the same tab and search. */
export function searchOf(filter: OrderFilter): Record<string, string | undefined> {
  return {
    tab: filter.tab === 'pending' ? undefined : filter.tab,
    q: filter.q?.trim() ? filter.q : undefined,
    from: filter.from,
    to: filter.to,
    reason: filter.tab === 'cancelled' ? filter.reason : undefined,
  };
}

/** The screen's filter from its address: To confirm when no tab is given. */
export function filterOf(search: OrdersSearch): OrderFilter {
  return {
    tab: search.tab ?? 'pending',
    q: search.q,
    from: search.from,
    to: search.to,
    reason: search.reason,
  };
}
