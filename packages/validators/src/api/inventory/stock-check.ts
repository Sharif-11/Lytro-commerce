import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  STOCK_CHECK_LINES_MAX,
  STOCK_CHECK_PAGE_SIZE,
  STOCK_NOTE_MAX_LENGTH,
} from '../../common/limits';
import { calendarDayField, checkPeriod } from '../../common/dates';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema, quantityField } from '../catalogue/catalogue-common';
import { serialsField } from './stock';

// POST stock-checks (INV-07): what the shop counted, for any set of variants. Each difference from the stock held is
// recorded as one recount movement; whether a variant's unit allows a fraction is the server's check (UOM-03). A line
// of a batch-tracked product may count one batch (INV-12); a variant is counted as a whole or batch by batch, never
// both in one check.
export const recordStockCheckSchema = z
  .object({
    lines: z
      .array(
        z.object({
          variantId: catalogueIdSchema,
          batchId: catalogueIdSchema.optional(),
          counted: quantityField,
          // INV-14: on a serial-numbered product, the serials of the units found missing; written off with the count.
          missingSerials: serialsField.optional(),
        }),
      )
      .min(1)
      .max(STOCK_CHECK_LINES_MAX),
    note: z.string().trim().min(1).max(STOCK_NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    const whole = new Set(
      value.lines.filter((line) => !line.batchId).map((line) => line.variantId),
    );
    value.lines.forEach((line, index) => {
      const key = `${line.variantId}/${line.batchId ?? ''}`;
      if (seen.has(key) || (line.batchId && whole.has(line.variantId))) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, line.batchId ? 'batchId' : 'variantId'],
          message: 'Listed twice.',
          params: { problem: FieldProblemCode.NotAllowed },
        });
      }
      seen.add(key);
    });
  });
export type RecordStockCheckInput = z.infer<typeof recordStockCheckSchema>;

// GET stock-checks: newest first.
export const stockCheckListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(STOCK_CHECK_PAGE_SIZE),
});
export type StockCheckListQuery = z.infer<typeof stockCheckListQuerySchema>;

// GET inventory/figures (INV-18): a period of whole Asia/Dhaka days, both ends included. Left out, it runs from the
// first of this month to today.
export const inventoryFiguresQuerySchema = z
  .object({
    dateFrom: calendarDayField.optional(),
    dateTo: calendarDayField.optional(),
  })
  .superRefine(checkPeriod);
export type InventoryFiguresQuery = z.infer<typeof inventoryFiguresQuerySchema>;
