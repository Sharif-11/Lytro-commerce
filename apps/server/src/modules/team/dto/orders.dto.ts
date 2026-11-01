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
  orderPaymentSchema,
  paymentLinkSchema,
  refundPaymentSchema,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  overrideOrderSchema,
  handOverOrderSchema,
  PaymentMethod,
  PaymentPolicy,
  quoteOrderSchema,
  returnOrderSchema,
  shipOrderSchema,
  StatusOverride,
  StockUnit,
  updateOrderSchema,
  VerificationLevel,
  voidPaymentSchema,
  ProductKind,
  SerialFormat,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateOrderDto extends createZodDto(createOrderSchema) {}
export class QuoteOrderDto extends createZodDto(quoteOrderSchema) {}
export class UpdateOrderDto extends createZodDto(updateOrderSchema) {}
export class LogCallDto extends createZodDto(logCallSchema) {}
export class CancelOrderDto extends createZodDto(cancelOrderSchema) {}
export class OverrideOrderDto extends createZodDto(overrideOrderSchema) {}
export class ShipOrderDto extends createZodDto(shipOrderSchema) {}
export class HandOverOrderDto extends createZodDto(handOverOrderSchema) {}
export class ReturnOrderDto extends createZodDto(returnOrderSchema) {}
export class OrderPaymentDto extends createZodDto(orderPaymentSchema) {}
export class VoidPaymentDto extends createZodDto(voidPaymentSchema) {}
export class PaymentLinkDto extends createZodDto(paymentLinkSchema) {}
export class RefundPaymentDto extends createZodDto(refundPaymentSchema) {}

// --- Responses. Dates coerce, since a created order's reply is replayed from the idempotency store's JSON (D4-8). ---

const bilingualSchema = z.object({ en: z.string(), bn: z.string() });
const personSchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();
const zoneSchema = z
  .object({ id: z.string(), name: bilingualSchema, charge: z.string() })
  .nullable();

// MNU-02: one modifier option chosen on a line, as it stood.
export const modifierSnapshotSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
  optionId: z.string(),
  optionName: z.string(),
  priceChange: z.string(),
});

// TAX-03: one class's tax an order's total includes.
export const taxLineSchema = z.object({ name: z.string(), rate: z.string(), amount: z.string() });
// PAY-01, PAY-24 (Phase 5 Slice 5.2): an order's payment page -- its address, the amount and when it runs out -- as
// checkout, tracking and a staff link return it.
export const openedPaymentSchema = z.object({
  paymentUrl: z.string(),
  amount: z.string(),
  expiresAt: z.coerce.date(),
});
export class OpenedPaymentDto extends createZodDto(openedPaymentSchema) {}

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
  taxClassName: z.string().nullable(),
  taxRate: z.string().nullable(),
  taxAmount: z.string(),
  modifiers: z.array(modifierSnapshotSchema),
  // ORD-10 (Slice 4.8a): the units back; a combo line counts its combos.
  returnedQuantity: z.string(),
  // CMB-04: a combo line's components as ordered; empty for any other line.
  components: z.array(
    z.object({
      partPosition: z.number(),
      productId: z.string().nullable(),
      variantId: z.string().nullable(),
      productName: z.string(),
      attributes: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          dataType: z.nativeEnum(AttributeDataType),
          unitKind: z.string().nullable(),
          variantDefining: z.boolean(),
        }),
      ),
      quantity: z.string(),
    }),
  ),
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
  customerOrders: z.number().nullable(),
  customerErased: z.boolean(),
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
  taxes: z.array(taxLineSchema),
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
  payments: z.array(
    z.object({
      id: z.string(),
      method: z.nativeEnum(PaymentMethod),
      amount: z.string(),
      senderNumber: z.string().nullable(),
      transactionId: z.string().nullable(),
      verifiedBy: personSchema,
      verifiedAt: z.coerce.date(),
      voided: z.object({ by: personSchema, at: z.coerce.date(), reason: z.string() }).nullable(),
      refunded: z.object({ by: personSchema, at: z.coerce.date(), note: z.string() }).nullable(),
      verificationLevel: z.nativeEnum(VerificationLevel),
      sessionId: z.string().nullable(),
    }),
  ),
  warnings: z.array(warningSchema),
  limitPrompt: z.object({ metric: z.literal('orders_monthly'), limit: z.number() }).nullable(),
});
export class OrderViewDto extends createZodDto(orderViewSchema) {}

// ORD-09 (Slice 4.8a): the couriers the shop has shipped with, the most recent first.
export class RecentCouriersDto extends createZodDto(z.object({ couriers: z.array(z.string()) })) {}

// Slice 4.8a: New order's Add an item -- products found, with the units each has on sale.
export const orderPickerQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export class OrderPickerQueryDto extends createZodDto(orderPickerQuerySchema) {}

export class OrderPickerPageDto extends createZodDto(
  z.object({
    products: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.nativeEnum(ProductKind),
        minPrice: z.string(),
        maxPrice: z.string(),
        active: z.boolean(),
        image: z.string().nullable(),
        variantCount: z.number(),
        available: z.string().nullable(),
      }),
    ),
    page: z.number(),
    pages: z.number(),
    total: z.number(),
  }),
) {}

// Slice 4.8a: one product to add -- its variants and their units, a combo's parts, its add-on groups.
export class OrderPickerProductDto extends createZodDto(
  z.object({
    id: z.string(),
    name: z.string(),
    kind: z.nativeEnum(ProductKind),
    active: z.boolean(),
    variants: z.array(
      z.object({
        variantId: z.string(),
        label: z.string(),
        price: z.string(),
        available: z.string().nullable(),
      }),
    ),
    parts: z.array(
      z.object({
        position: z.number(),
        quantity: z.string(),
        variants: z.array(
          z.object({
            variantId: z.string(),
            productName: z.string(),
            label: z.string(),
            onSale: z.boolean(),
            available: z.string().nullable(),
          }),
        ),
      }),
    ),
    modifierGroups: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        minSelect: z.number(),
        maxSelect: z.number(),
        options: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            priceChange: z.string(),
            isDefault: z.boolean(),
          }),
        ),
      }),
    ),
  }),
) {}

// INV-14 (Slice 4.8a): an order's serial-numbered units, for its ship, hand-over and return sheets.
export class OrderSerialsDto extends createZodDto(
  z.object({
    items: z.array(
      z.object({
        lineId: z.string(),
        variantId: z.string(),
        productName: z.string(),
        quantity: z.string(),
        serialFormat: z.nativeEnum(SerialFormat),
        inStock: z.array(z.string()),
        sent: z.array(z.string()),
      }),
    ),
  }),
) {}

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
      customerErased: z.boolean(),
      tableRef: z.string().nullable(),
      items: z.number(),
      grandTotal: z.string(),
      codAmount: z.string(),
      cancelReason: z.nativeEnum(CancelReason).nullable(),
      holdUntil: z.coerce.date().nullable(),
      createdAt: z.coerce.date(),
      // Slice 4.8a: where it goes, and the calls that went unanswered.
      area: z
        .object({
          thana: z.object({ id: z.number(), nameEn: z.string(), nameBn: z.string() }),
          zilla: z.object({ id: z.number(), nameEn: z.string(), nameBn: z.string() }),
        })
        .nullable(),
      unansweredCalls: z.number(),
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
      modifiers: z.array(modifierSnapshotSchema),
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
  taxes: z.array(taxLineSchema),
  warnings: z.array(warningSchema),
});
export class OrderQuoteDto extends createZodDto(orderQuoteSchema) {}
