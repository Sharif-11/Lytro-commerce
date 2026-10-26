/**
 * GET /billing/payments' cache key (BIL-19), on its own so the balance's and the plan's payments both refresh it: the
 * banners and Billing read that list, never the browser's memory.
 */
export const PAYMENTS_QUERY_KEY = ['billing', 'payments'] as const;
