import { z } from 'zod';
import { REQUEST_ERROR_KEEP_DAYS } from '../../common/request-id';
import { queryFlag } from '../catalogue/catalogue-common';
import { listenerReceiptsQuerySchema } from '../listener/listener';

/** ADM-03: the shop page counts the server faults of the last 24 hours. */
export const SHOP_ERRORS_COUNT_HOURS = 24;

/**
 * D8-25: how far back the shop page's problems reach: the failed SMS and courier calls it counts, and every list behind
 * a figure. As far back as server faults are kept, so each list covers the same days.
 */
export const SHOP_PROBLEM_DAYS = REQUEST_ERROR_KEEP_DAYS;

/** D8-25: the most rows one of the shop page's problem lists returns at once. */
export const SHOP_PROBLEM_PAGE = 20;

// SEC-11, ADM-03 (D8-26): a shop's courier key log, paged as before; `failed=true` keeps the calls that failed or the
// courier refused, the shop page's failed courier calls.
export const courierCredentialUsesQuerySchema = listenerReceiptsQuerySchema
  .pick({ page: true, limit: true })
  .extend({ failed: queryFlag });
export type CourierCredentialUsesQuery = z.infer<typeof courierCredentialUsesQuerySchema>;

// ADM-03: a page of the server faults kept for a shop, newest first; `before` is the last one's id already seen.
export const shopErrorsQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(SHOP_PROBLEM_PAGE),
});
export type ShopErrorsQuery = z.infer<typeof shopErrorsQuerySchema>;

// ADM-03, D8-30: the SMS that didn't go, each list paged on its own; `shopBefore` and `lytroBefore` are the last ids seen.
export const shopFailedSmsQuerySchema = z.object({
  shopBefore: z.coerce.number().int().positive().optional(),
  lytroBefore: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(SHOP_PROBLEM_PAGE),
});
export type ShopFailedSmsQuery = z.infer<typeof shopFailedSmsQuerySchema>;
