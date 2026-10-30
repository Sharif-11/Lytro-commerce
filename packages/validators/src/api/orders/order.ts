import { z } from 'zod';
import { calendarDayField } from '../../common/dates';
import {
  ATTRIBUTES_PER_PRODUCT_MAX,
  CALL_NOTE_MAX_LENGTH,
  CANCEL_NOTE_MAX_LENGTH,
  CAPTURED_VALUE_MAX_LENGTH,
  COURIER_NAME_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  LIST_PAGE_SIZE_MAX,
  ORDER_ADDRESS_MAX_LENGTH,
  COMBO_PART_QUANTITY_MAX,
  COMBO_PARTS_MAX,
  ORDER_LINES_MAX,
  ORDER_NOTES_MAX_LENGTH,
  ORDER_PAGE_SIZE,
  SHOPPER_NOTE_MAX_LENGTH,
  TABLE_REF_MAX_LENGTH,
  TRACKING_CODE_MAX_LENGTH,
  TRACKING_LINK_MAX_LENGTH,
  TRANSACTION_ID_MAX_LENGTH,
  MODIFIER_GROUPS_MAX,
  MODIFIER_OPTIONS_MAX,
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
  PaymentMethod,
  StatusOverride,
} from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import {
  catalogueIdSchema,
  positiveQuantityField,
  priceField,
  quantityField,
} from '../catalogue/catalogue-common';
import { serialsField } from '../inventory/stock';

type Ctx = z.RefinementCtx;

function refuse(ctx: Ctx, path: (string | number)[], problem: FieldProblemCode, message: string) {
  ctx.addIssue({ code: 'custom', path, message, params: { problem } });
}

export function textField(max: number) {
  return z.string().trim().min(1).max(max);
}

// ORD-01: a Bangladeshi mobile number, kept in its local form (01XXXXXXXXX).
export const orderPhoneField = z
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

// ORD-15, ORD-22, D4-6 (Slice 4.3b, agreed 2026-10-30): money staff received for an order. A wallet payment names the
// number it came from and its transaction ID; a bank payment its reference as the transaction ID; cash at the counter
// neither. Cash on delivery is never typed: it is collected when the order is delivered or handed over.
const WALLETS: readonly PaymentMethod[] = [
  PaymentMethod.Bkash,
  PaymentMethod.Nagad,
  PaymentMethod.Rocket,
  PaymentMethod.Upay,
];
export const orderPaymentSchema = z
  .object({
    method: z.enum([
      PaymentMethod.Cash,
      PaymentMethod.Bkash,
      PaymentMethod.Nagad,
      PaymentMethod.Rocket,
      PaymentMethod.Upay,
      PaymentMethod.Bank,
    ]),
    amount: priceField.refine((value) => value > 0, {
      message: 'More than zero.',
      params: { problem: FieldProblemCode.TooSmall },
    }),
    senderNumber: orderPhoneField.optional(),
    transactionId: textField(TRANSACTION_ID_MAX_LENGTH).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const wallet = WALLETS.includes(value.method);
    if (wallet && value.senderNumber === undefined) {
      refuse(ctx, ['senderNumber'], FieldProblemCode.Required, 'The number it came from.');
    }
    if (value.method === PaymentMethod.Cash && value.senderNumber !== undefined) {
      refuse(ctx, ['senderNumber'], FieldProblemCode.NotAllowed, 'Not for cash.');
    }
    if (value.method === PaymentMethod.Cash && value.transactionId !== undefined) {
      refuse(ctx, ['transactionId'], FieldProblemCode.NotAllowed, 'Not for cash.');
    }
    if (value.method !== PaymentMethod.Cash && value.transactionId === undefined) {
      refuse(ctx, ['transactionId'], FieldProblemCode.Required, 'The transaction ID.');
    }
  });
export type OrderPaymentInput = z.infer<typeof orderPaymentSchema>;

// POST orders/:id/payments/:paymentId/void (agreed 2026-10-30): a payment recorded by mistake, voided with its reason.
export const voidPaymentSchema = z.object({ reason: textField(CALL_NOTE_MAX_LENGTH) }).strict();
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

// ATR-08: what the customer asked for on an attribute captured at order time ("Name on the cake: Rafi").
const capturedInputSchema = z.object({
  attributeId: catalogueIdSchema,
  value: textField(CAPTURED_VALUE_MAX_LENGTH),
});

// CMB-03: for a combo, each choice part's variant for each unit, in order -- the combo's quantity times the part's
// quantity of them; a fixed part needs none. Which part (its position) and that each is allowed and on sale are the
// server's check.
const comboChoiceSchema = z.object({
  part: z.number().int().min(1).max(COMBO_PARTS_MAX),
  variantIds: z
    .array(catalogueIdSchema)
    .min(1)
    .max(COMBO_PART_QUANTITY_MAX * 100),
});

// ORD-01, ORD-06: one variant ordered. The price is the variant's own unless staff set one by hand; any amount a client
// sends as a total is never read.
// MNU-02 (Slice 4.6b): the options chosen in one of the product's modifier groups; a group left out takes its defaults.
const modifierChoiceSchema = z.object({
  groupId: catalogueIdSchema,
  optionIds: z.array(catalogueIdSchema).max(MODIFIER_OPTIONS_MAX),
});

const orderItemSchema = z.object({
  variantId: catalogueIdSchema,
  // UOM-04: a fraction only for a measured unit, and whole packs of a shared stock -- the server's check.
  quantity: positiveQuantityField,
  unitPrice: priceField.optional(),
  itemDiscount: priceField.optional(),
  captured: z.array(capturedInputSchema).max(ATTRIBUTES_PER_PRODUCT_MAX).optional(),
  choices: z.array(comboChoiceSchema).max(COMBO_PARTS_MAX).optional(),
  modifiers: z.array(modifierChoiceSchema).max(MODIFIER_GROUPS_MAX).optional(),
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
// confirmed when the customer confirmed as it was entered. ORD-22 (agreed 2026-10-30): a payment received as it was
// entered is saved with it, verified.
export const createOrderSchema = z
  .object({
    ...orderDetails,
    status: z.enum([OrderStatus.Pending, OrderStatus.Confirmed]).optional(),
    payment: orderPaymentSchema.optional(),
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

// POST /v1/orders (ORD-02, SFT-06, LND-07, D4-2): a shopper's order, delivered and paid in cash on delivery. Only what
// a shopper chooses: a price, discount, delivery charge or status is refused by name. `source` is the Lytro
// storefront's alone to say; any other key's order is the API's.
export const publicOrderSchema = z
  .object({
    customerName: textField(CUSTOMER_NAME_MAX_LENGTH),
    phone: orderPhoneField,
    locationId: z.number().int().positive(),
    deliveryAddress: textField(ORDER_ADDRESS_MAX_LENGTH),
    shopperNote: textField(SHOPPER_NOTE_MAX_LENGTH).optional(),
    source: z.enum([OrderSource.Storefront, OrderSource.LandingPage]).optional(),
    items: z
      .array(
        orderItemSchema
          .pick({ variantId: true, quantity: true, captured: true, choices: true, modifiers: true })
          .strict(),
      )
      .min(1)
      .max(ORDER_LINES_MAX)
      .superRefine(capturedOnce),
  })
  .strict();
export type PublicOrderInput = z.infer<typeof publicOrderSchema>;

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

// ORD-09: a courier's tracking page, http or https.
const trackingLinkField = z
  .string()
  .trim()
  .max(TRACKING_LINK_MAX_LENGTH)
  .refine(
    (value) => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    {
      message: 'Enter the tracking page address.',
      params: { problem: FieldProblemCode.InvalidUrl },
    },
  );

// INV-14, INV-23: the serials leaving with one item, one per unit, as written on the units. On a combo's line, the
// serial-tracked component they belong to (CMB-05).
const itemSerialsSchema = z.object({
  lineId: catalogueIdSchema,
  variantId: catalogueIdSchema.optional(),
  serials: serialsField,
});

/** Each item's serials (a combo's, each component's) are given once. */
function serialsOnce(
  items: { lineId: string; variantId?: string }[] | undefined,
  ctx: Ctx,
  path: string,
): void {
  const seen = new Set<string>();
  (items ?? []).forEach((item, index) => {
    const key = `${item.lineId} ${item.variantId ?? ''}`;
    if (seen.has(key)) {
      refuse(ctx, [path, index, 'lineId'], FieldProblemCode.NotAllowed, 'Listed twice.');
    }
    seen.add(key);
  });
}

// POST orders/:id/ship (ORD-09, D4-7, INV-14): a delivery order sent with a courier, the whole order at once -- the
// courier's name and its tracking code or link, and the serials of any serial-tracked item.
export const shipOrderSchema = z
  .object({
    courierName: textField(COURIER_NAME_MAX_LENGTH),
    trackingCode: textField(TRACKING_CODE_MAX_LENGTH).optional(),
    trackingLink: trackingLinkField.optional(),
    serials: z.array(itemSerialsSchema).max(ORDER_LINES_MAX).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.trackingCode === undefined && value.trackingLink === undefined) {
      refuse(ctx, ['trackingCode'], FieldProblemCode.Required, 'A tracking code or link.');
    }
    serialsOnce(value.serials, ctx, 'serials');
  });
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;

// POST orders/:id/hand-over (agreed 2026-10-30): a takeaway or dine-in order given to its customer -- shipped and
// delivered in one step -- with the serials of any serial-tracked item.
export const handOverOrderSchema = z
  .object({ serials: z.array(itemSerialsSchema).max(ORDER_LINES_MAX).optional() })
  .superRefine((value, ctx) => {
    serialsOnce(value.serials, ctx, 'serials');
  });
export type HandOverOrderInput = z.infer<typeof handOverOrderSchema>;

const returnedSerialsField = z
  .object({
    sellable: z.array(z.string().min(1)).max(1000),
    damaged: z.array(z.string().min(1)).max(1000),
  })
  .optional();

// CMB-05 (agreed 2026-10-30: whole combos only): a combo's component that came back damaged, in its own units, and its
// serials when it has them; every other unit of the returned combos is sellable again.
const returnedComponentSchema = z.object({
  variantId: catalogueIdSchema,
  damaged: quantityField,
  serials: returnedSerialsField,
});

// POST orders/:id/returns (ORD-10, INV-17): units of shipped items that came back, each sellable again or damaged, and
// for a serial-tracked item which serials. A combo comes back whole: `sellable` counts the combos and `damaged` stays
// 0, each damaged component named in `components` (CMB-05).
const returnedItemSchema = z
  .object({
    lineId: catalogueIdSchema,
    sellable: quantityField,
    damaged: quantityField,
    serials: returnedSerialsField,
    components: z
      .array(returnedComponentSchema)
      .max(COMBO_PARTS_MAX * 100)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sellable + value.damaged <= 0) {
      refuse(ctx, ['sellable'], FieldProblemCode.Required, 'At least one unit.');
    }
  });
export const returnOrderSchema = z
  .object({
    items: z.array(returnedItemSchema).min(1).max(ORDER_LINES_MAX),
    note: textField(CALL_NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((value, ctx) => {
    serialsOnce(value.items, ctx, 'items');
  });
export type ReturnOrderInput = z.infer<typeof returnOrderSchema>;

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
  // CUS-02 (Slice 4.4a): one customer's orders, their history on the customer's page.
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(ORDER_PAGE_SIZE),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
