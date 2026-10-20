import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  STOCK_HISTORY_PAGE_SIZE,
  STOCK_NOTE_MAX_LENGTH,
} from '../../common/limits';
import { StockEditReason } from '../../db/enums';
import { positiveQuantityField, priceField, quantityField } from '../catalogue/catalogue-common';

// PUT products/:id/variants/:variantId/stock (INV-06): the tenant types the stock they now have; the server records
// the difference as one movement, with the one-tap reason (other when skipped).
export const setStockSchema = z.object({
  onHand: quantityField,
  reason: z.nativeEnum(StockEditReason).optional(),
  note: z.string().trim().min(1).max(STOCK_NOTE_MAX_LENGTH).optional(),
});
export type SetStockInput = z.infer<typeof setStockSchema>;

// POST products/:id/variants/:variantId/stock-additions (INV-06, INV-24): stock that arrived, added to what is held.
// On a variant of a product sharing its stock it is a whole number of that variant's packs (UOM-04); on the shared
// stock itself it is in the product's unit; on any other variant, units. Recorded as new stock (a manual adjustment
// until purchasing, Slice 4).
export const addStockSchema = z.object({
  quantity: positiveQuantityField,
  note: z.string().trim().min(1).max(STOCK_NOTE_MAX_LENGTH).optional(),
});
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
