import { z } from 'zod';
import { calendarDayField } from '../../common/dates';
import {
  LIST_PAGE_SIZE_MAX,
  SERIAL_MAX_LENGTH,
  SERIAL_PAGE_SIZE,
  SERIALS_PER_ENTRY_MAX,
  STOCK_BATCH_CODE_MAX_LENGTH,
  STOCK_BATCH_PAGE_SIZE,
  STOCK_HISTORY_PAGE_SIZE,
  STOCK_NOTE_MAX_LENGTH,
} from '../../common/limits';
import { BatchState, SerialStatus, StockEditReason } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import {
  catalogueIdSchema,
  positiveQuantityField,
  priceField,
  quantityField,
} from '../catalogue/catalogue-common';

// INV-12: a new batch of stock arriving, with an optional lot code and expiry date (its last sellable day). Neither
// is ever required: stock with no expiry goes into the variant's "no expiry" batch (INV-22).
export const newBatchField = z.object({
  batchCode: z.string().trim().min(1).max(STOCK_BATCH_CODE_MAX_LENGTH).optional(),
  expiresOn: calendarDayField.optional(),
});

// INV-14, INV-23: serials as entered, one per unit. Whether each is an IMEI with its check digit, and whether it is
// already held, depend on the product and the shop, so the server checks them and names the line that is wrong.
const serialField = z
  .string()
  .min(1)
  .max(SERIAL_MAX_LENGTH * 2);
export const serialsField = z.array(serialField).min(1).max(SERIALS_PER_ENTRY_MAX);

/** A stock change names the batch it lands in or leaves (`batchId`) or describes a new one (`batch`), never both. */
function oneBatchChoice(value: { batch?: unknown; batchId?: string }, ctx: z.RefinementCtx): void {
  if (value.batch !== undefined && value.batchId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['batch'],
      message: 'Name a batch or describe a new one, not both.',
      params: { problem: FieldProblemCode.NotAllowed },
    });
  }
}

// PUT products/:id/variants/:variantId/stock (INV-06): the tenant types the stock they now have; the server records
// the difference as one movement, with the one-tap reason (other when skipped). On a batch-tracked product (INV-12) a
// rise may describe its new batch or name one, and a fall may name the batch it leaves; otherwise a rise goes into the
// "no expiry" batch and a fall leaves by first expiry.
export const setStockSchema = z
  .object({
    onHand: quantityField,
    reason: z.nativeEnum(StockEditReason).optional(),
    note: z.string().trim().min(1).max(STOCK_NOTE_MAX_LENGTH).optional(),
    batch: newBatchField.optional(),
    batchId: catalogueIdSchema.optional(),
    // INV-14: on a serial-numbered product, the serials of the units arriving, or of the units leaving.
    serials: serialsField.optional(),
  })
  .superRefine(oneBatchChoice);
export type SetStockInput = z.infer<typeof setStockSchema>;

// POST products/:id/variants/:variantId/stock-additions (INV-06, INV-24): stock that arrived, added to what is held.
// On a variant of a product sharing its stock it is a whole number of that variant's packs (UOM-04); on the shared
// stock itself it is in the product's unit; on any other variant, units. Recorded as new stock (a manual adjustment
// until purchasing, Slice 4).
export const addStockSchema = z
  .object({
    quantity: positiveQuantityField,
    note: z.string().trim().min(1).max(STOCK_NOTE_MAX_LENGTH).optional(),
    // INV-12: the batch it arrived as, or the batch it joins.
    batch: newBatchField.optional(),
    batchId: catalogueIdSchema.optional(),
    // INV-14: the serials of the units arriving, one per unit; fewer leaves the rest to add later.
    serials: serialsField.optional(),
  })
  .superRefine(oneBatchChoice);
export type AddStockInput = z.infer<typeof addStockSchema>;

// PUT products/:id/variants/:variantId/cost (INV-10): the average unit cost entered by hand, before any purchase
// receipt sets it; null clears it to unknown. Never required, never public.
export const variantCostSchema = z.object({
  avgCost: priceField.nullable(),
});
export type VariantCostInput = z.infer<typeof variantCostSchema>;

// GET products/:id/variants/:variantId/stock-history (INV-09): newest first.
export const stockHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(STOCK_HISTORY_PAGE_SIZE),
});
export type StockHistoryQuery = z.infer<typeof stockHistoryQuerySchema>;

// GET batches (INV-13): the shop's batches that are expiring soon or have expired, soonest first.
export const batchListQuerySchema = z.object({
  state: z.enum([BatchState.Expiring, BatchState.Expired]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(STOCK_BATCH_PAGE_SIZE),
});
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;

// POST products/:id/variants/:variantId/serials (INV-14): serials for units already held that have none yet.
export const addSerialsSchema = z.object({ serials: serialsField });
export type AddSerialsInput = z.infer<typeof addSerialsSchema>;

// PATCH products/:id/serials/:serialId (INV-14): a serial typed wrong, corrected while its unit is in stock.
export const correctSerialSchema = z.object({ serial: serialField });
export type CorrectSerialInput = z.infer<typeof correctSerialSchema>;

// GET products/:id/variants/:variantId/serials: a variant's serials, the ones it holds by default.
export const serialListQuerySchema = z.object({
  status: z.nativeEnum(SerialStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(SERIAL_PAGE_SIZE),
});
export type SerialListQuery = z.infer<typeof serialListQuerySchema>;
