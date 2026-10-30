import { z } from 'zod';
import { calendarDayField, checkPeriod } from '../../common/dates';
import { BEST_SELLERS_DEFAULT, BEST_SELLERS_MAX } from '../../common/limits';
import { SalesBucket, SalesRanking } from '../../db/enums';
import { catalogueIdSchema } from '../catalogue/catalogue-common';

// GET sales (STA-01, STA-03, Phase 4 Slice 4.7): a period of whole Asia/Dhaka days, both ends included -- left out, the
// first of this month to today -- split into weeks (from Saturday), months, quarters or years; with a product, its trend.
export const salesQuerySchema = z
  .object({
    dateFrom: calendarDayField.optional(),
    dateTo: calendarDayField.optional(),
    bucket: z.nativeEnum(SalesBucket).default(SalesBucket.Week),
    productId: catalogueIdSchema.optional(),
  })
  .superRefine(checkPeriod);
export type SalesQuery = z.infer<typeof salesQuerySchema>;

// GET sales/best-sellers (STA-02): the products that sold most in a period, by units or by revenue.
export const bestSellersQuerySchema = z
  .object({
    dateFrom: calendarDayField.optional(),
    dateTo: calendarDayField.optional(),
    by: z.nativeEnum(SalesRanking).default(SalesRanking.Units),
    limit: z.coerce.number().int().min(1).max(BEST_SELLERS_MAX).default(BEST_SELLERS_DEFAULT),
  })
  .superRefine(checkPeriod);
export type BestSellersQuery = z.infer<typeof bestSellersQuerySchema>;
