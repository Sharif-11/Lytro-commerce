import { z } from 'zod';
import { calendarDayField } from '../../common/dates';

// MED-12, D8-17, D8-57 to D8-64 (Phase 8 Slice 8.6, read agreed 2026-11-10): what Cloudflare will bill Lytro for its
// media this month, held against a budget the operator sets, in US dollars because Cloudflare bills in them.

/**
 * D8-60: Cloudflare's prices the estimate uses, in US dollars, checked 2026-11-10 against its R2 and Workers pricing
 * pages. One platform setting, so the operator follows a price change with no deploy. "Free" and "included" are the
 * month's own allowances, in millions of operations or GB-months.
 */
export const cloudflarePricesSchema = z
  .object({
    r2ClassAPerMillion: z.number().finite().nonnegative().max(1000),
    r2ClassBPerMillion: z.number().finite().nonnegative().max(1000),
    r2StoragePerGbMonth: z.number().finite().nonnegative().max(1000),
    r2FreeClassAMillions: z.number().int().nonnegative().max(1_000_000),
    r2FreeClassBMillions: z.number().int().nonnegative().max(1_000_000),
    r2FreeStorageGbMonths: z.number().int().nonnegative().max(1_000_000),
    workersMonthly: z.number().finite().nonnegative().max(1000),
    workersIncludedMillions: z.number().int().nonnegative().max(1_000_000),
    workersPerMillion: z.number().finite().nonnegative().max(1000),
  })
  .strict();
export type CloudflarePrices = z.infer<typeof cloudflarePricesSchema>;

export const DEFAULT_CLOUDFLARE_PRICES: CloudflarePrices = {
  r2ClassAPerMillion: 4.5,
  r2ClassBPerMillion: 0.36,
  r2StoragePerGbMonth: 0.015,
  r2FreeClassAMillions: 1,
  r2FreeClassBMillions: 10,
  r2FreeStorageGbMonths: 10,
  workersMonthly: 5,
  workersIncludedMillions: 10,
  workersPerMillion: 0.3,
};

/** D8-58 (the owner's pick): the month's budget, in whole US dollars, until the operator sets another. */
export const DEFAULT_MEDIA_BUDGET_USD = 10;
/** MED-12: the share of the budget that emails the alert address, once a period. */
export const DEFAULT_MEDIA_BUDGET_ALERT_PERCENT = 80;
/** D8-61: the day of the month Cloudflare's invoice period starts on. Up to the 28th, so every month has it. */
export const DEFAULT_CLOUDFLARE_BILLING_DAY = 1;
export const CLOUDFLARE_BILLING_DAY_MAX = 28;

// GET /operator/media-costs: the period holding `period` (any day in it), or the one running now.
export const mediaCostsQuerySchema = z
  .object({
    period: calendarDayField.optional(),
  })
  .strict();
export type MediaCostsQuery = z.infer<typeof mediaCostsQuerySchema>;
