import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  AttributeDataType,
  CallOutcome,
  cancelOrderSchema,
  CancelReason,
  createOrderSchema,
  DeliveryMode,
  FulfillmentStatus,
  FulfilmentType,
  logCallSchema,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  overrideOrderSchema,
  PaymentPolicy,
  StatusOverride,
  StockUnit,
  updateOrderSchema,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateOrderDto extends createZodDto(createOrderSchema) {}
export class UpdateOrderDto extends createZodDto(updateOrderSchema) {}
export class LogCallDto extends createZodDto(logCallSchema) {}
export class CancelOrderDto extends createZodDto(cancelOrderSchema) {}
export class OverrideOrderDto extends createZodDto(overrideOrderSchema) {}

// --- Responses. Dates coerce, since a created order's reply is replayed from the idempotency store's JSON (D4-8). ---

const bilingualSchema = z.object({ en: z.string(), bn: z.string() });
const personSchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();
const zoneSchema = z
  .object({ id: z.string(), name: bilingualSchema, charge: z.string() })
  .nullable();

const warningSchema = z.object({
  code: z.enum(['zone_no_delivery', 'product_not_delivered_here']),
  zone: bilingualSchema,
  productName: z.string().nullable(),
});

const orderItemSchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  variantId: z.string().nullable(),
  productName: z.string(),
  sku: z.string().nullable(),
  attributes: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      dataType: z.nativeEnum(AttributeDataType),
      unitKind: z.string().nullable(),
      variantDefining: z.boolean(),
    }),
  ),
  captured: z.array(z.object({ attributeId: z.string(), name: z.string(), value: z.string() })),
  thumbnail: z.object({ mediaId: z.string(), url: z.string() }).nullable(),
  stockUnit: z.nativeEnum(StockUnit),
  listPrice: z.string(),
  unitPrice: z.string(),
  quantity: z.string(),
  packAmount: z.string().nullable(),
  itemDiscount: z.string(),
  itemTotal: z.string(),
  weightKg: z.string().nullable(),
  ownDeliveryCharge: z.string().nullable(),
  deliveryMode: z.nativeEnum(DeliveryMode),
  deliveryCharge: z.string(),
  paymentPolicy: z.nativeEnum(PaymentPolicy),
  advance: z.string(),
});

const orderViewSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  trackingId: z.string(),
  source: z.nativeEnum(OrderSource),
  status: z.nativeEnum(OrderStatus),
  paymentStatus: z.nativeEnum(OrderPaymentStatus),
  fulfillmentStatus: z.nativeEnum(FulfillmentStatus),
  override: z.nativeEnum(StatusOverride).nullable(),
  holdUntil: z.coerce.date().nullable(),
  confirmedAt: z.coerce.date().nullable(),
  confirmedBy: personSchema,
  fulfilmentType: z.nativeEnum(FulfilmentType),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  location: z
    .object({
      id: z.number(),
      nameEn: z.string(),
      nameBn: z.string(),
      cityCode: z.string().nullable(),
      zillaId: z.number(),
    })
    .nullable(),
  deliveryAddress: z.string().nullable(),
  tableRef: z.string().nullable(),
  deliveryZone: zoneSchema,
  extraChargePerKg: z.string(),
  cancelReason: z.nativeEnum(CancelReason).nullable(),
  cancelNote: z.string().nullable(),
  cancelledAt: z.coerce.date().nullable(),
  subtotal: z.string(),
  deliveryCharge: z.string(),
  deliveryChargeByHand: z.boolean(),
  discount: z.string(),
  grandTotal: z.string(),
  advanceDue: z.string(),
  codAmount: z.string(),
  due: z.string(),
  courierName: z.string().nullable(),
  trackingCode: z.string().nullable(),
  trackingLink: z.string().nullable(),
  shippedAt: z.coerce.date().nullable(),
  deliveredAt: z.coerce.date().nullable(),
  handledAt: z.coerce.date().nullable(),
  notes: z.string().nullable(),
  shopperNote: z.string().nullable(),
  createdBy: personSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  items: z.array(orderItemSchema),
  calls: z.array(
    z.object({
      id: z.string(),
      outcome: z.nativeEnum(CallOutcome),
      callBackAt: z.coerce.date().nullable(),
      note: z.string().nullable(),
      by: personSchema,
      at: z.coerce.date(),
    }),
  ),
  unansweredCalls: z.number(),
  history: z.array(
    z.object({
      field: z.nativeEnum(OrderHistoryField),
      from: z.string().nullable(),
      to: z.string().nullable(),
      note: z.string().nullable(),
      by: personSchema,
      at: z.coerce.date(),
    }),
  ),
  warnings: z.array(warningSchema),
});
export class OrderViewDto extends createZodDto(orderViewSchema) {}

const orderPageSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string(),
      orderNumber: z.string(),
      status: z.nativeEnum(OrderStatus),
      paymentStatus: z.nativeEnum(OrderPaymentStatus),
      fulfillmentStatus: z.nativeEnum(FulfillmentStatus),
      source: z.nativeEnum(OrderSource),
      fulfilmentType: z.nativeEnum(FulfilmentType),
      customerName: z.string().nullable(),
      customerPhone: z.string().nullable(),
      tableRef: z.string().nullable(),
      items: z.number(),
      grandTotal: z.string(),
      codAmount: z.string(),
      cancelReason: z.nativeEnum(CancelReason).nullable(),
      holdUntil: z.coerce.date().nullable(),
      createdAt: z.coerce.date(),
    }),
  ),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class OrderPageDto extends createZodDto(orderPageSchema) {}

const orderQuoteSchema = z.object({
  items: z.array(
    z.object({
      variantId: z.string(),
      productName: z.string(),
      listPrice: z.string(),
      unitPrice: z.string(),
      quantity: z.string(),
      itemTotal: z.string(),
      deliveryCharge: z.string(),
      advance: z.string(),
    }),
  ),
  deliveryZone: zoneSchema,
  subtotal: z.string(),
  deliveryCharge: z.string(),
  discount: z.string(),
  grandTotal: z.string(),
  advanceDue: z.string(),
  codAmount: z.string(),
  warnings: z.array(warningSchema),
});
export class OrderQuoteDto extends createZodDto(orderQuoteSchema) {}
