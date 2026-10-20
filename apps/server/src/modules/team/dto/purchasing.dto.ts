import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  closePurchaseSchema,
  createPurchaseOrderSchema,
  createSupplierSchema,
  PurchaseStatus,
  receivePurchaseSchema,
  StockUnit,
  updatePurchaseOrderSchema,
  updateSupplierSchema,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateSupplierDto extends createZodDto(createSupplierSchema) {}
export class UpdateSupplierDto extends createZodDto(updateSupplierSchema) {}
export class CreatePurchaseOrderDto extends createZodDto(createPurchaseOrderSchema) {}
export class UpdatePurchaseOrderDto extends createZodDto(updatePurchaseOrderSchema) {}
export class ReceivePurchaseDto extends createZodDto(receivePurchaseSchema) {}
export class ClosePurchaseDto extends createZodDto(closePurchaseSchema) {}

// --- Responses. Cost fields are present only for a caller who may see cost (D3-9). ---

const supplierViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  postalAddress: z.string().nullable(),
  notes: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export class SupplierViewDto extends createZodDto(supplierViewSchema) {}

const supplierPageSchema = z.object({
  suppliers: z.array(supplierViewSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class SupplierPageDto extends createZodDto(supplierPageSchema) {}

const purchaseSupplierSchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();

const purchaseOrderViewSchema = z.object({
  id: z.string(),
  number: z.number().nullable(),
  status: z.nativeEnum(PurchaseStatus),
  supplier: purchaseSupplierSchema,
  expectedOn: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  orderedAt: z.date().nullable(),
  closeReason: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      variantId: z.string(),
      productName: z.string().nullable(),
      optionIds: z.array(z.string()),
      sharedStock: z.boolean(),
      stockUnit: z.nativeEnum(StockUnit).nullable(),
      quantityOrdered: z.string(),
      quantityReceived: z.string(),
      outstanding: z.string(),
      unitCost: z.string().nullable().optional(),
      total: z.string().nullable().optional(),
    }),
  ),
  // PUR-04, PUR-08: its deliveries, oldest first, as saved.
  receipts: z.array(
    z.object({
      id: z.string(),
      receivedAt: z.date(),
      actor: z.object({ userId: z.string(), name: z.string().nullable() }).nullable(),
      note: z.string().nullable(),
      items: z.array(
        z.object({
          itemId: z.string(),
          accepted: z.string(),
          rejected: z.string(),
          rejectReason: z.string().nullable(),
          unitCost: z.string().nullable().optional(),
          batch: z
            .object({
              id: z.string(),
              batchCode: z.string().nullable(),
              expiresOn: z.string().nullable(),
            })
            .nullable(),
        }),
      ),
    }),
  ),
  total: z.string().optional(),
  unknownCost: z.number().optional(),
});
export class PurchaseOrderViewDto extends createZodDto(purchaseOrderViewSchema) {}

const purchaseOrderPageSchema = z.object({
  purchaseOrders: z.array(
    z.object({
      id: z.string(),
      number: z.number().nullable(),
      status: z.nativeEnum(PurchaseStatus),
      supplier: purchaseSupplierSchema,
      expectedOn: z.string().nullable(),
      createdAt: z.date(),
      orderedAt: z.date().nullable(),
      items: z.number(),
      total: z.string().optional(),
      unknownCost: z.number().optional(),
    }),
  ),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class PurchaseOrderPageDto extends createZodDto(purchaseOrderPageSchema) {}

// PUR-09: a variant's deliveries, newest first.
const purchaseHistoryPageSchema = z.object({
  purchases: z.array(
    z.object({
      receiptId: z.string(),
      purchaseOrderId: z.string(),
      number: z.number().nullable(),
      supplier: purchaseSupplierSchema,
      receivedAt: z.date(),
      accepted: z.string(),
      rejected: z.string(),
      rejectReason: z.string().nullable(),
      unitCost: z.string().nullable().optional(),
    }),
  ),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class PurchaseHistoryPageDto extends createZodDto(purchaseHistoryPageSchema) {}
