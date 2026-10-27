import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  addSerialsSchema,
  addStockSchema,
  checkSerialsSchema,
  correctSerialSchema,
  SerialStatus,
  BatchState,
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
export class AddSerialsDto extends createZodDto(addSerialsSchema) {}
export class CorrectSerialDto extends createZodDto(correctSerialSchema) {}
export class CheckSerialsDto extends createZodDto(checkSerialsSchema) {}
export class VariantCostDto extends createZodDto(variantCostSchema) {}
export class RecordStockCheckDto extends createZodDto(recordStockCheckSchema) {}

// --- Responses. Cost fields are present only for a caller who may see cost (D3-9). ---

const actorSchema = z.object({ userId: z.string(), name: z.string().nullable() });
// INV-12: a batch named on a movement or a counted line.
const movedBatchSchema = z.object({
  id: z.string(),
  batchCode: z.string().nullable(),
  expiresOn: z.string().nullable(),
});

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
      unsellable: z.string(),
      // INV-13, INV-15: units held for orders that expiry left with nothing sellable under them.
      reservedExpired: z.string(),
      available: z.string(),
      // PUR-05: ordered and not yet received on placed, open purchases; never available.
      incoming: z.string(),
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
      unsellable: z.string().nullable(),
      reservedExpired: z.string().nullable(),
      available: z.string(),
      missingSerials: z.number().nullable(),
      incoming: z.string().nullable(),
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
      batch: movedBatchSchema.nullable(),
      serials: z.array(z.string()),
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
      batch: movedBatchSchema.nullable(),
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

// UOM-01: an amount of stock in one unit.
export const unitQuantitySchema = z.object({ unit: z.nativeEnum(StockUnit), quantity: z.string() });

export const inventoryFiguresSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  // D3-9: the whole, its amounts by unit, and the same by top-level category (null: products in none).
  stockValue: z.object({
    value: z.string(),
    unknownCost: z.number(),
    units: z.array(unitQuantitySchema),
    byCategory: z.array(
      z.object({
        categoryId: z.string().nullable(),
        name: z.string().nullable(),
        value: z.string(),
        unknownCost: z.number(),
        units: z.array(unitQuantitySchema),
      }),
    ),
  }),
  costOfGoodsSold: movedFigureSchema,
  losses: movedFigureSchema.extend({
    byReason: z.array(
      movedFigureSchema.extend({
        reason: z.nativeEnum(StockReason),
        units: z.array(unitQuantitySchema),
      }),
    ),
  }),
});
export class InventoryFiguresDto extends createZodDto(inventoryFiguresSchema) {}

// INV-12, INV-13: open batches holding stock, each with where it stands against its expiry.
const batchViewSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  optionIds: z.array(z.string()),
  batchCode: z.string().nullable(),
  expiresOn: z.string().nullable(),
  noExpiry: z.boolean(),
  quantity: z.string(),
  receivedAt: z.date(),
  state: z.nativeEnum(BatchState),
});

export const productBatchesSchema = z.object({
  productId: z.string(),
  batches: z.array(batchViewSchema),
});
export class ProductBatchesDto extends createZodDto(productBatchesSchema) {}

export const shopBatchPageSchema = z.object({
  batches: z.array(batchViewSchema.extend({ productId: z.string(), productName: z.string() })),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class ShopBatchPageDto extends createZodDto(shopBatchPageSchema) {}

// INV-14: one serial-numbered unit, and a page of them.
export const serialViewSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  serial: z.string(),
  status: z.nativeEnum(SerialStatus),
  receivedMovementId: z.number().nullable(),
  leftMovementId: z.number().nullable(),
  createdAt: z.date(),
});
export class SerialViewDto extends createZodDto(serialViewSchema) {}

export const serialPageSchema = z.object({
  serials: z.array(serialViewSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class SerialPageDto extends createZodDto(serialPageSchema) {}

// INV-23: the entered serials a unit the shop holds already has, as stored.
export const serialCheckSchema = z.object({ taken: z.array(z.string()) });
export class SerialCheckDto extends createZodDto(serialCheckSchema) {}
