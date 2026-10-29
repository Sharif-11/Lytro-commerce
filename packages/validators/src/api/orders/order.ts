import { z } from 'zod';
import { calendarDayField } from '../../common/dates';
import {
  ATTRIBUTES_PER_PRODUCT_MAX,
  CALL_NOTE_MAX_LENGTH,
  CANCEL_NOTE_MAX_LENGTH,
  CAPTURED_VALUE_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  LIST_PAGE_SIZE_MAX,
  ORDER_ADDRESS_MAX_LENGTH,
  ORDER_LINES_MAX,
  ORDER_NOTES_MAX_LENGTH,
  ORDER_PAGE_SIZE,
  TABLE_REF_MAX_LENGTH,
} from '../../common/limits';
import { bdMobileNumber } from '../../common/phone';
import {
  CallOutcome,
  CancelReason,
  FulfillmentStatus,
  FulfilmentType,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  StatusOverride,
} from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import {
  catalogueIdSchema,
  positiveQuantityField,
  priceField,
} from '../catalogue/catalogue-common';

type Ctx = z.RefinementCtx;

function refuse(ctx: Ctx, path: (string | number)[], problem: FieldProblemCode, message: string) {
  ctx.addIssue({ code: 'custom', path, message, params: { problem } });
}

function textField(max: number) {
  return z.string().trim().min(1).max(max);
}

// ORD-01: a Bangladeshi mobile number, kept in its local form (01XXXXXXXXX).
const orderPhoneField = z
  .string()
  .max(30)
  .transform((value, ctx) => {
    const local = bdMobileNumber(value);
    if (local === null) {
      refuse(ctx, [], FieldProblemCode.InvalidFormat, 'Not a Bangladeshi mobile number.');
      return z.NEVER;
    }
    return local;
  });

// ATR-08: what the customer asked for on an attribute captured at order time ("Name on the cake: Rafi").
const capturedInputSchema = z.object({
  attributeId: catalogueIdSchema,
  value: textField(CAPTURED_VALUE_MAX_LENGTH),
});

// ORD-01, ORD-06: one variant ordered. The price is the variant's own unless staff set one by hand; any amount a client
// sends as a total is never read.
const orderItemSchema = z.object({
  variantId: catalogueIdSchema,
  // UOM-04: a fraction only for a measured unit, and whole packs of a shared stock -- the server's check.
  quantity: positiveQuantityField,
  unitPrice: priceField.optional(),
  itemDiscount: priceField.optional(),
  captured: z.array(capturedInputSchema).max(ATTRIBUTES_PER_PRODUCT_MAX).optional(),
});

/** An attribute is answered once per item. */
function capturedOnce(items: { captured?: { attributeId: string }[] }[], ctx: Ctx): void {
  items.forEach((item, index) => {
    const seen = new Set<string>();
    (item.captured ?? []).forEach((entry, position) => {
      if (seen.has(entry.attributeId)) {
        refuse(
          ctx,
          [index, 'captured', position, 'attributeId'],
          FieldProblemCode.NotAllowed,
          'Answered twice.',
        );
      }
      seen.add(entry.attributeId);
    });
  });
}

const orderItemsField = z
  .array(orderItemSchema)
  .min(1)
  .max(ORDER_LINES_MAX)
  .superRefine(capturedOnce);

// ORD-11: an item as edited: an existing one named by its `lineId` (keeping the price and delivery it was ordered at
// unless set again), or a new one without.
const editedItemsField = z
  .array(orderItemSchema.extend({ lineId: catalogueIdSchema.optional() }))
  .min(1)
  .max(ORDER_LINES_MAX)
  .superRefine((items, ctx) => {
    capturedOnce(items, ctx);
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (item.lineId === undefined) return;
      if (seen.has(item.lineId)) {
        refuse(ctx, [index, 'lineId'], FieldProblemCode.NotAllowed, 'Listed twice.');
      }
      seen.add(item.lineId);
    });
  });

const orderDetails = {
  customerName: textField(CUSTOMER_NAME_MAX_LENGTH).nullable().optional(),
  phone: orderPhoneField.nullable().optional(),
  // MNU-04: delivery unless said otherwise.
  fulfilmentType: z.nativeEnum(FulfilmentType).optional(),
  // CUS-08: the thana delivered to; its zone sets the delivery charge (DLV-02).
  locationId: z.number().int().positive().nullable().optional(),
  deliveryAddress: textField(ORDER_ADDRESS_MAX_LENGTH).nullable().optional(),
  tableRef: textField(TABLE_REF_MAX_LENGTH).nullable().optional(),
  // ORD-06: the order's delivery charge set by hand in place of the worked-out one; null works it out again.
  deliveryCharge: priceField.nullable().optional(),
  discount: priceField.optional(),
  notes: textField(ORDER_NOTES_MAX_LENGTH).nullable().optional(),
};

type OrderDetails = {
  customerName?: string | null;
  phone?: string | null;
  fulfilmentType?: FulfilmentType;
  locationId?: number | null;
  deliveryAddress?: string | null;
  tableRef?: string | null;
  deliveryCharge?: number | null;
};

/**
 * MNU-04, amended 2026-10-29: a delivery needs the customer's name, phone, thana and address; a takeaway the name and
 * phone, with no address or delivery charge; a dine-in only its table, the name and phone optional. Checked on what
 * the order holds once the request is applied, so an edit is checked like a new order.
 */
export function fulfilmentProblems(
  order: Required<Omit<OrderDetails, 'deliveryCharge'>> & { deliveryCharge: number | null },
): { field: keyof OrderDetails; problem: FieldProblemCode }[] {
  const problems: { field: keyof OrderDetails; problem: FieldProblemCode }[] = [];
  const need = (field: keyof OrderDetails, present: boolean) => {
    if (!present) problems.push({ field, problem: FieldProblemCode.Required });
  };
  const refuseHere = (field: keyof OrderDetails, present: boolean) => {
    if (present) problems.push({ field, problem: FieldProblemCode.NotAllowed });
  };
  const type = order.fulfilmentType;
  if (type !== FulfilmentType.DineIn) {
    need('customerName', order.customerName !== null);
    need('phone', order.phone !== null);
    refuseHere('tableRef', order.tableRef !== null);
  } else {
    need('tableRef', order.tableRef !== null);
  }
  if (type === FulfilmentType.Delivery) {
    need('locationId', order.locationId !== null);
    need('deliveryAddress', order.deliveryAddress !== null);
  } else {
    refuseHere('locationId', order.locationId !== null);
    refuseHere('deliveryAddress', order.deliveryAddress !== null);
    refuseHere('deliveryCharge', order.deliveryCharge !== null);
  }
  return problems;
}

// POST orders (ORD-01, ORD-07): an order entered by staff. It starts pending, waiting for the confirming call, or
// confirmed when the customer confirmed as it was entered.
export const createOrderSchema = z
  .object({
    ...orderDetails,
    status: z.enum([OrderStatus.Pending, OrderStatus.Confirmed]).optional(),
    items: orderItemsField,
  })
  .superRefine((value, ctx) => {
    for (const { field, problem } of fulfilmentProblems({
      customerName: value.customerName ?? null,
      phone: value.phone ?? null,
      fulfilmentType: value.fulfilmentType ?? FulfilmentType.Delivery,
      locationId: value.locationId ?? null,
      deliveryAddress: value.deliveryAddress ?? null,
      tableRef: value.tableRef ?? null,
      deliveryCharge: value.deliveryCharge ?? null,
    })) {
      refuse(
        ctx,
        [field],
        problem,
        problem === FieldProblemCode.Required ? 'Required.' : 'Not for this order type.',
      );
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// PATCH orders/:id (ORD-11): any of the details, and `items`, the whole list as it should now be. Until the order ships.
export const updateOrderSchema = z
  .object({ ...orderDetails, items: editedItemsField.optional() })
  // A key left out is absent from the parsed value, so an empty edit has no keys at all.
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to change.',
    params: { problem: FieldProblemCode.NothingToChange },
  });
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

// POST orders/:id/calls (ORD-51): one call to the customer and how it ended. Call back later needs its time; a call
// that cancels the order needs its reason (ORD-52), and "other" a note.
export const logCallSchema = z
  .object({
    outcome: z.nativeEnum(CallOutcome),
    callBackAt: z.coerce.date().optional(),
    reason: z.nativeEnum(CancelReason).optional(),
    note: textField(CALL_NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((value, ctx) => {
    const backLater = value.outcome === CallOutcome.CallBackLater;
    if (backLater && value.callBackAt === undefined) {
      refuse(ctx, ['callBackAt'], FieldProblemCode.Required, 'Required.');
    }
    if (!backLater && value.callBackAt !== undefined) {
      refuse(ctx, ['callBackAt'], FieldProblemCode.NotAllowed, 'Only for a call back later.');
    }
    const cancels = value.outcome === CallOutcome.Cancelled;
    if (cancels && value.reason === undefined) {
      refuse(ctx, ['reason'], FieldProblemCode.Required, 'Required.');
    }
    if (!cancels && value.reason !== undefined) {
      refuse(ctx, ['reason'], FieldProblemCode.NotAllowed, 'Only for a cancelling call.');
    }
    if (value.reason === CancelReason.Other && value.note === undefined) {
      refuse(ctx, ['note'], FieldProblemCode.Required, 'Required.');
    }
  });
export type LogCallInput = z.infer<typeof logCallSchema>;

// POST orders/:id/cancel (ORD-52): why, from the fixed list; "other" needs a note.
export const cancelOrderSchema = z
  .object({
    reason: z.nativeEnum(CancelReason),
    note: textField(CANCEL_NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === CancelReason.Other && value.note === undefined) {
      refuse(ctx, ['note'], FieldProblemCode.Required, 'Required.');
    }
  });
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// POST orders/:id/override (ORD-41): hold the order or put it in review, or (null) clear either. Cancelling has its own
// route, with its reason.
export const overrideOrderSchema = z.object({
  override: z.enum([StatusOverride.Hold, StatusOverride.InReview]).nullable(),
  note: textField(CALL_NOTE_MAX_LENGTH).optional(),
});
export type OverrideOrderInput = z.infer<typeof overrideOrderSchema>;

// POST /v1/delivery-estimate (SFT-20, LND-08): a cart's items, and the thana they would go to once it is chosen. Priced
// by the same function an order is (ORD-06a); before a thana is known the answer is a range across the shop's zones.
export const deliveryEstimateSchema = z.object({
  locationId: z.number().int().positive().optional(),
  items: z
    .array(z.object({ variantId: catalogueIdSchema, quantity: positiveQuantityField }))
    .min(1)
    .max(ORDER_LINES_MAX),
});
export type DeliveryEstimateInput = z.infer<typeof deliveryEstimateSchema>;

// GET orders (ORD-13, ORD-45, ORD-52): newest first, 20 a page; by the status shown, either axis, where it came from,
// why it was cancelled, the days it was made (Asia/Dhaka), and a name, phone or order number.
export const orderListQuerySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  paymentStatus: z.nativeEnum(OrderPaymentStatus).optional(),
  fulfillmentStatus: z.nativeEnum(FulfillmentStatus).optional(),
  source: z.nativeEnum(OrderSource).optional(),
  cancelReason: z.nativeEnum(CancelReason).optional(),
  dateFrom: calendarDayField.optional(),
  dateTo: calendarDayField.optional(),
  q: z.string().trim().min(1).max(CUSTOMER_NAME_MAX_LENGTH).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(ORDER_PAGE_SIZE),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
