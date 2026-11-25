import { z } from 'zod';
import { CancelReason, OrderSource } from '@lytronix/validators';
import { ALL_TABS, type OrderFilter } from '@/api/orders';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The list's tab, search, dates and cancel reason, in the address of the list and of an order beside it. */
export const ordersSearch = z.object({
  tab: z.enum(ALL_TABS).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  from: z.string().regex(DAY).optional().catch(undefined),
  to: z.string().regex(DAY).optional().catch(undefined),
  reason: z.enum(CancelReason).optional().catch(undefined),
  holding: z.string().min(1).optional().catch(undefined),
  holdingName: z.string().optional().catch(undefined),
  product: z.string().min(1).optional().catch(undefined),
  productName: z.string().optional().catch(undefined),
  source: z.enum(OrderSource).optional().catch(undefined),
  // PYG-22 (PF-25): only the locked pay-as-you-go orders, the লক করা chip.
  locked: z.literal('1').optional().catch(undefined),
  // INV-25 (ORDERS-BEYOND-STOCK OB-11): only the orders still waiting for stock, the স্টক কম chip.
  short: z.literal('1').optional().catch(undefined),
  // OB-10: the orders a fill notice names, comma-separated.
  ids: z
    .string()
    .regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,49}$/)
    .optional()
    .catch(undefined),
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
    holding: filter.holding,
    holdingName: filter.holding ? filter.holdingName : undefined,
    product: filter.product,
    productName: filter.product ? filter.productName : undefined,
    source: filter.source,
    locked: filter.locked ? '1' : undefined,
    short: filter.short ? '1' : undefined,
    ids: filter.ids && filter.ids.length > 0 ? filter.ids.join(',') : undefined,
  };
}

/** The screen's filter from its address: To confirm when no tab is given. */
export function filterOf(search: OrdersSearch): OrderFilter {
  return {
    // OB-10: the orders a fill notice names, whatever their status.
    tab: search.tab ?? (search.ids ? 'all' : 'pending'),
    q: search.q,
    from: search.from,
    to: search.to,
    reason: search.reason,
    holding: search.holding,
    holdingName: search.holdingName,
    product: search.product,
    productName: search.productName,
    source: search.source,
    locked: search.locked === '1',
    short: search.short === '1',
    ids: search.ids ? search.ids.split(',') : undefined,
  };
}
