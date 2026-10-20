import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  STOCK_CHECK_LINES_MAX,
  STOCK_CHECK_PAGE_SIZE,
  STOCK_NOTE_MAX_LENGTH,
} from '../../common/limits';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema, quantityField } from '../catalogue/catalogue-common';

// POST stock-checks (INV-07): what the shop counted, for any set of variants. Each difference from the stock held is
// recorded as one recount movement; whether a variant's unit allows a fraction is the server's check (UOM-03).
export const recordStockCheckSchema = z
  .object({
    lines: z
      .array(z.object({ variantId: catalogueIdSchema, counted: quantityField }))
      .min(1)
      .max(STOCK_CHECK_LINES_MAX),
    note: z.string().trim().min(1).max(STOCK_NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.variantId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'variantId'],
          message: 'Listed twice.',
          params: { problem: FieldProblemCode.NotAllowed },
        });
      }
      seen.add(line.variantId);
    });
  });
export type RecordStockCheckInput = z.infer<typeof recordStockCheckSchema>;

// GET stock-checks: newest first.
export const stockCheckListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(STOCK_CHECK_PAGE_SIZE),
});
export type StockCheckListQuery = z.infer<typeof stockCheckListQuerySchema>;

// A calendar day in Asia/Dhaka, as YYYY-MM-DD.
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use YYYY-MM-DD.' })
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), {
    message: 'Not a real date.',
    params: { problem: FieldProblemCode.InvalidDate },
  });

// GET inventory/figures (INV-18): a period of whole Asia/Dhaka days, both ends included. Left out, it runs from the
// first of this month to today.
export const inventoryFiguresQuerySchema = z
  .object({
    dateFrom: calendarDay.optional(),
    dateTo: calendarDay.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateTo'],
        message: 'Choose a day on or after the start date.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
  });
export type InventoryFiguresQuery = z.infer<typeof inventoryFiguresQuerySchema>;
