import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  PURCHASE_LINES_MAX,
  PURCHASE_NOTES_MAX_LENGTH,
  PURCHASE_PAGE_SIZE,
} from '../../common/limits';
import { calendarDayField } from '../../common/dates';
import { PurchaseStatus } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import {
  catalogueIdSchema,
  positiveQuantityField,
  priceField,
} from '../catalogue/catalogue-common';
import { optionalTextField } from './supplier';

// PUR-02: one variant bought, in the product's stock unit, at an optional unit cost in taka. A product sharing its stock
// is bought by its shared stock (INV-24). Whether a whole-unit product allows a fraction is the server's and the
// database's check (UOM-03).
const purchaseItemSchema = z.object({
  variantId: catalogueIdSchema,
  quantity: positiveQuantityField,
  unitCost: priceField.nullable().optional(),
});

// A purchase buys each variant on one line (its `items`).
const purchaseItemsField = z
  .array(purchaseItemSchema)
  .min(1)
  .max(PURCHASE_LINES_MAX)
  .superRefine((lines, ctx) => {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (seen.has(line.variantId)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'variantId'],
          message: 'Listed twice.',
          params: { problem: FieldProblemCode.NotAllowed },
        });
      }
      seen.add(line.variantId);
    });
  });

const purchaseDetails = {
  supplierId: catalogueIdSchema.nullable().optional(),
  expectedOn: calendarDayField.nullable().optional(),
  notes: optionalTextField(PURCHASE_NOTES_MAX_LENGTH).optional(),
};

// POST purchase-orders (PUR-02): a draft, with no number until it is placed. The supplier is optional, and must be one
// of the shop's live suppliers.
export const createPurchaseOrderSchema = z.object({
  ...purchaseDetails,
  items: purchaseItemsField,
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

// PATCH purchase-orders/:id (PUR-02): any of the details, and `items`, the whole list as it should now be (a line kept
// is matched by its variant). The items change only until the first delivery is received.
export const updatePurchaseOrderSchema = z.object({
  ...purchaseDetails,
  items: purchaseItemsField.optional(),
});
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

// GET purchase-orders: newest first, optionally of one status or one supplier.
export const purchaseOrderListQuerySchema = z.object({
  status: z.nativeEnum(PurchaseStatus).optional(),
  supplierId: catalogueIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(PURCHASE_PAGE_SIZE),
});
export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;
