import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  PURCHASE_HISTORY_PAGE_SIZE,
  PURCHASE_LINES_MAX,
  PURCHASE_REASON_MAX_LENGTH,
  STOCK_NOTE_MAX_LENGTH,
} from '../../common/limits';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema, priceField, quantityField } from '../catalogue/catalogue-common';
import { newBatchField, oneBatchChoice, serialsField } from '../inventory/stock';

const reasonField = z.string().trim().min(1).max(PURCHASE_REASON_MAX_LENGTH);

// PUR-04: what arrived for one item of a purchase. Rejected units never enter stock and leave the item outstanding, so
// a rejection needs a reason. `unitCost` is what each accepted unit actually cost; left out, it is the cost on the item,
// and null means it is not known. The accepted units may land in a batch (INV-12) and carry their serials (INV-14), as
// stock added does. Whether a whole-unit product allows a fraction, and how much is still to come, are the server's
// checks (UOM-03).
const receiptItemSchema = z
  .object({
    itemId: catalogueIdSchema,
    accepted: quantityField,
    rejected: quantityField.default(0),
    rejectReason: reasonField.optional(),
    unitCost: priceField.nullable().optional(),
    batch: newBatchField.optional(),
    batchId: catalogueIdSchema.optional(),
    serials: serialsField.optional(),
  })
  .superRefine((value, ctx) => {
    oneBatchChoice(value, ctx);
    if (value.accepted === 0 && value.rejected === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['accepted'],
        message: 'Accept or reject at least one.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
    if (value.rejected > 0 && value.rejectReason === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['rejectReason'],
        message: 'Say why they were rejected.',
        params: { problem: FieldProblemCode.Required },
      });
    }
    if (value.rejected === 0 && value.rejectReason !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['rejectReason'],
        message: 'Only rejected units need a reason.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
  });

// POST purchase-orders/:id/receipts (PUR-04): one delivery against a placed purchase, item by item, each item once.
// Saved, a receipt never changes (PUR-08); a mistake is put right with a stock edit.
export const receivePurchaseSchema = z.object({
  items: z
    .array(receiptItemSchema)
    .min(1)
    .max(PURCHASE_LINES_MAX)
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.itemId)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'itemId'],
            message: 'Listed twice.',
            params: { problem: FieldProblemCode.NotAllowed },
          });
        }
        seen.add(item.itemId);
      });
    }),
  note: z.string().trim().min(1).max(STOCK_NOTE_MAX_LENGTH).optional(),
});
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;

// POST purchase-orders/:id/close (PUR-06): a partly received purchase closed short, dropping what is still to come.
// Stock is not touched.
export const closePurchaseSchema = z.object({ reason: reasonField });
export type ClosePurchaseInput = z.infer<typeof closePurchaseSchema>;

// GET products/:id/variants/:variantId/purchases (PUR-09): newest first.
export const purchaseHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(PURCHASE_HISTORY_PAGE_SIZE),
});
export type PurchaseHistoryQuery = z.infer<typeof purchaseHistoryQuerySchema>;
