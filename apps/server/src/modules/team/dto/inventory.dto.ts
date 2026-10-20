import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  addStockSchema,
  recordStockCheckSchema,
  setStockSchema,
  StockReason,
  StockState,
  StockTracking,
  StockUnit,
  variantCostSchema,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class SetStockDto extends createZodDto(setStockSchema) {}
export class AddStockDto extends createZodDto(addStockSchema) {}
export class VariantCostDto extends createZodDto(variantCostSchema) {}
export class RecordStockCheckDto extends createZodDto(recordStockCheckSchema) {}

// --- Responses. Cost fields are present only for a caller who may see cost (D3-9). ---

const actorSchema = z.object({ userId: z.string(), name: z.string().nullable() });

export const productStockViewSchema = z.object({
  productId: z.string(),
  stockTracking: z.nativeEnum(StockTracking),
  stockUnit: z.nativeEnum(StockUnit),
  lowStockThreshold: z.string(),
  state: z.nativeEnum(StockState),
  // INV-24: the stock the variants share, held by the product's stock holder; null when each holds its own.
  shared: z
    .object({
      variantId: z.string(),
      onHand: z.string(),
      reserved: z.string(),
      available: z.string(),
      state: z.nativeEnum(StockState),
      avgCost: z.string().nullable().optional(),
    })
    .nullable(),
  variants: z.array(
    z.object({
      variantId: z.string(),
      optionIds: z.array(z.string()),
      sku: z.string().nullable(),
      retired: z.boolean(),
      onHand: z.string().nullable(),
      reserved: z.string().nullable(),
      available: z.string(),
      packAmount: z.string().nullable(),
      state: z.nativeEnum(StockState),
      avgCost: z.string().nullable().optional(),
    }),
  ),
});
export class ProductStockViewDto extends createZodDto(productStockViewSchema) {}

export const stockHistoryPageSchema = z.object({
  movements: z.array(
    z.object({
      id: z.number(),
      delta: z.string(),
      onHandAfter: z.string(),
      reason: z.nativeEnum(StockReason),
      unitCost: z.string().nullable().optional(),
      reference: z.object({ type: z.string(), id: z.string() }).nullable(),
      note: z.string().nullable(),
      actor: actorSchema.nullable(),
      createdAt: z.date(),
    }),
  ),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class StockHistoryPageDto extends createZodDto(stockHistoryPageSchema) {}

// INV-07: values and costs are present only for a caller who may see cost (D3-9).
const stockCheckTotalsSchema = z.object({
  lines: z.number(),
  changed: z.number(),
  valueGained: z.string().optional(),
  valueLost: z.string().optional(),
  unknownCost: z.number().optional(),
});

const stockCheckSummarySchema = z.object({
  id: z.string(),
  note: z.string().nullable(),
  actor: actorSchema.nullable(),
  createdAt: z.date(),
  totals: stockCheckTotalsSchema,
});

export const stockCheckViewSchema = stockCheckSummarySchema.extend({
  lines: z.array(
    z.object({
      productId: z.string(),
      variantId: z.string(),
      productName: z.string().nullable(),
      optionIds: z.array(z.string()),
      expected: z.string(),
      counted: z.string(),
      difference: z.string(),
      unitCost: z.string().nullable().optional(),
      value: z.string().nullable().optional(),
    }),
  ),
});
export class StockCheckViewDto extends createZodDto(stockCheckViewSchema) {}

export const stockCheckPageSchema = z.object({
  checks: z.array(stockCheckSummarySchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class StockCheckPageDto extends createZodDto(stockCheckPageSchema) {}

// INV-18: every figure is a value to the paisa, with what had no cost to count.
const movedFigureSchema = z.object({
  value: z.string(),
  movements: z.number(),
  unknownCost: z.number(),
});

export const inventoryFiguresSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  stockValue: z.object({ value: z.string(), unknownCost: z.number() }),
  costOfGoodsSold: movedFigureSchema,
  losses: movedFigureSchema.extend({
    byReason: z.array(movedFigureSchema.extend({ reason: z.nativeEnum(StockReason) })),
  }),
});
export class InventoryFiguresDto extends createZodDto(inventoryFiguresSchema) {}
