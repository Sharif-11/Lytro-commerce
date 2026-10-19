import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  setStockSchema,
  StockReason,
  StockState,
  StockTracking,
  StockUnit,
  variantCostSchema,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class SetStockDto extends createZodDto(setStockSchema) {}
export class VariantCostDto extends createZodDto(variantCostSchema) {}

// --- Responses. Cost fields are present only for a caller who may see cost (D3-9). ---

export const productStockViewSchema = z.object({
  productId: z.string(),
  stockTracking: z.nativeEnum(StockTracking),
  stockUnit: z.nativeEnum(StockUnit),
  lowStockThreshold: z.string(),
  state: z.nativeEnum(StockState),
  variants: z.array(
    z.object({
      variantId: z.string(),
      optionIds: z.array(z.string()),
      sku: z.string().nullable(),
      retired: z.boolean(),
      onHand: z.string(),
      reserved: z.string(),
      available: z.string(),
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
      actor: z.object({ userId: z.string(), name: z.string().nullable() }).nullable(),
      createdAt: z.date(),
    }),
  ),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class StockHistoryPageDto extends createZodDto(stockHistoryPageSchema) {}
