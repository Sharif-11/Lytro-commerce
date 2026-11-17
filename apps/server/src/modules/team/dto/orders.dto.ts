import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  AttributeDataType,
  CallOutcome,
  cancelOrderSchema,
  CancelReason,
  CourierKey,
  CourierNewsSource,
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
  ParcelAttention,
  ParcelReading,
  ParcelState,
  handOverOrderSchema,
  PaymentMethod,
  PaymentPolicy,
  quoteOrderSchema,
  readAddressSchema,
  addressReadSchema,
  returnOrderSchema,
  shipOrderSchema,
  StatusOverride,
  StockUnit,
  updateOrderSchema,
  VerificationLevel,
  voidPaymentSchema,
  ProductKind,
  SerialFormat,
  coercedDateField,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateOrderDto extends createZodDto(createOrderSchema) {}
export class QuoteOrderDto extends createZodDto(quoteOrderSchema) {}
// ORD-30 to ORD-34 (Phase 7 Slice 7.6): a pasted message, and the delivery details read from it.
export class ReadAddressDto extends createZodDto(readAddressSchema) {}
export class AddressReadDto extends createZodDto(addressReadSchema) {}
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
  expiresAt: coercedDateField(),
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
      dataType: z.enum(AttributeDataType),
      unitKind: z.string().nullable(),
      variantDefining: z.boolean(),
      // ATR-19 (PD-9): a photo design's name, which the seller's screens and the parcel label show.
      design: z.literal(true).optional(),
    }),
  ),
  captured: z.array(z.object({ attributeId: z.string(), name: z.string(), value: z.string() })),
  thumbnail: z.object({ mediaId: z.string(), url: z.string(), largeUrl: z.string() }).nullable(),
  stockUnit: z.enum(StockUnit),
  listPrice: z.string(),
  unitPrice: z.string(),
  quantity: z.string(),
  packAmount: z.string().nullable(),
  itemDiscount: z.string(),
  itemTotal: z.string(),
  weightKg: z.string().nullable(),
  ownDeliveryCharge: z.string().nullable(),
  deliveryMode: z.enum(DeliveryMode),
  deliveryCharge: z.string(),
  paymentPolicy: z.enum(PaymentPolicy),
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
          dataType: z.enum(AttributeDataType),
          unitKind: z.string().nullable(),
          variantDefining: z.boolean(),
          design: z.literal(true).optional(),
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
  source: z.enum(OrderSource),
  status: z.enum(OrderStatus),
  paymentStatus: z.enum(OrderPaymentStatus),
  fulfillmentStatus: z.enum(FulfillmentStatus),
  override: z.enum(StatusOverride).nullable(),
  holdUntil: coercedDateField().nullable(),
  confirmedAt: coercedDateField().nullable(),
  confirmedBy: personSchema,
  fulfilmentType: z.enum(FulfilmentType),
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
  cancelReason: z.enum(CancelReason).nullable(),
  cancelNote: z.string().nullable(),
  cancelledAt: coercedDateField().nullable(),
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
  shippedAt: coercedDateField().nullable(),
  deliveredAt: coercedDateField().nullable(),
  handledAt: coercedDateField().nullable(),
  notes: z.string().nullable(),
  shopperNote: z.string().nullable(),
  createdBy: personSchema,
  createdAt: coercedDateField(),
  updatedAt: coercedDateField(),
  items: z.array(orderItemSchema),
  calls: z.array(
    z.object({
      id: z.string(),
      outcome: z.enum(CallOutcome),
      callBackAt: coercedDateField().nullable(),
      note: z.string().nullable(),
      by: personSchema,
      at: coercedDateField(),
    }),
  ),
  unansweredCalls: z.number(),
  history: z.array(
    z.object({
      field: z.enum(OrderHistoryField),
      from: z.string().nullable(),
      to: z.string().nullable(),
      note: z.string().nullable(),
      by: personSchema,
      at: coercedDateField(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      method: z.enum(PaymentMethod),
      amount: z.string(),
      senderNumber: z.string().nullable(),
      transactionId: z.string().nullable(),
      verifiedBy: personSchema,
      verifiedAt: coercedDateField(),
      voided: z.object({ by: personSchema, at: coercedDateField(), reason: z.string() }).nullable(),
      refunded: z.object({ by: personSchema, at: coercedDateField(), note: z.string() }).nullable(),
      verificationLevel: z.enum(VerificationLevel),
      sessionId: z.string().nullable(),
    }),
  ),
  warnings: z.array(warningSchema),
  parcel: z
    .object({
      courierKey: z.enum(CourierKey),
      state: z.enum(ParcelState),
      invoice: z.string(),
      consignmentId: z.string().nullable(),
      trackingCode: z.string().nullable(),
      courierStatus: z.string().nullable(),
      cod: z.string(),
      note: z.string().nullable(),
      weightKg: z.string().nullable(),
      areaCode: z.string().nullable(),
      deliveryCharge: z.string().nullable(),
      refusal: z.string().nullable(),
      settled: z.boolean(),
      settleProblem: z.string().nullable(),
      createdAt: coercedDateField(),
      reading: z.enum(ParcelReading).nullable(),
      cashCollected: z.string().nullable(),
      codAtCourier: z.string().nullable(),
      lastNewsAt: coercedDateField().nullable(),
      noNews: z.boolean(),
      attention: z.enum(ParcelAttention).nullable(),
      paidAt: coercedDateField().nullable(),
      payoutId: z.string().nullable(),
      news: z.array(
        z.object({
          source: z.enum(CourierNewsSource),
          rawStatus: z.string().nullable(),
          message: z.object({ en: z.string().nullable(), bn: z.string().nullable() }),
          at: coercedDateField(),
        }),
      ),
    })
    .nullable(),
  courierRecordUnchanged: z.boolean(),
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
        kind: z.enum(ProductKind),
        minPrice: z.string(),
        maxPrice: z.string(),
        active: z.boolean(),
        image: z.string().nullable(),
        variantCount: z.number(),
        optionNames: z.array(z.array(z.string())),
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
    kind: z.enum(ProductKind),
    active: z.boolean(),
    stockUnit: z.enum(StockUnit),
    variants: z.array(
      z.object({
        variantId: z.string(),
        label: z.string(),
        image: z.string().nullable(),
        // ATR-20 (PD-22): its design, and its other values without it, so staff pick a design by its photo.
        design: z.object({ id: z.string(), name: z.string() }).nullable(),
        restLabel: z.string(),
        price: z.string(),
        onSale: z.boolean(),
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
    asked: z.array(
      z.object({
        attributeId: z.string(),
        name: z.string(),
        dataType: z.enum(AttributeDataType),
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
        serialFormat: z.enum(SerialFormat),
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
      status: z.enum(OrderStatus),
      paymentStatus: z.enum(OrderPaymentStatus),
      fulfillmentStatus: z.enum(FulfillmentStatus),
      source: z.enum(OrderSource),
      fulfilmentType: z.enum(FulfilmentType),
      customerName: z.string().nullable(),
      customerPhone: z.string().nullable(),
      customerErased: z.boolean(),
      tableRef: z.string().nullable(),
      items: z.number(),
      grandTotal: z.string(),
      codAmount: z.string(),
      cancelReason: z.enum(CancelReason).nullable(),
      holdUntil: coercedDateField().nullable(),
      createdAt: coercedDateField(),
      // Slice 4.8a: where it goes, and the calls that went unanswered.
      area: z
        .object({
          thana: z.object({ id: z.number(), nameEn: z.string(), nameBn: z.string() }),
          zilla: z.object({ id: z.number(), nameEn: z.string(), nameBn: z.string() }),
        })
        .nullable(),
      unansweredCalls: z.number(),
      // Slice 6.7: where its live parcel stands, and what a courier reported that staff haven't marked seen.
      parcel: z
        .object({
          courierKey: z.enum(CourierKey),
          state: z.enum(ParcelState),
          reading: z.enum(ParcelReading).nullable(),
        })
        .nullable(),
      attention: z.enum(ParcelAttention).nullable(),
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
