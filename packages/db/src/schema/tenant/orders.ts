import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  CALL_NOTE_MAX_LENGTH,
  CallOutcome,
  CANCEL_NOTE_MAX_LENGTH,
  CancelReason,
  COURIER_NAME_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  enumTuple,
  FulfillmentStatus,
  FulfilmentType,
  ORDER_ADDRESS_MAX_LENGTH,
  ORDER_NOTES_MAX_LENGTH,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderSource,
  PaymentMethod,
  PRODUCT_NAME_MAX_LENGTH,
  SHOPPER_NOTE_MAX_LENGTH,
  SKU_MAX_LENGTH,
  StatusOverride,
  TABLE_REF_MAX_LENGTH,
  TRACKING_CODE_MAX_LENGTH,
  TRACKING_LINK_MAX_LENGTH,
  type AttributeDataType,
  TAX_CLASS_NAME_MAX_LENGTH,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { deliveryMode, paymentPolicy, stockUnit } from './catalogue';
import { customers } from './customers';

// DATABASE-SCHEMA §3.3 (orders, ORD), Phase 4 Slice 4.1. Every table sits behind the tenant_isolation policy. Money is
// numeric(12,2) (DAT-05) and quantities numeric(14,3) (UOM-03).

export const orderPaymentStatus = tenant.enum(
  'payment_status',
  enumTuple(Object.values(OrderPaymentStatus)),
);
export const fulfillmentStatus = tenant.enum(
  'fulfillment_status',
  enumTuple(Object.values(FulfillmentStatus)),
);
export const statusOverride = tenant.enum(
  'status_override',
  enumTuple(Object.values(StatusOverride)),
);
export const fulfilmentType = tenant.enum(
  'fulfilment_type',
  enumTuple(Object.values(FulfilmentType)),
);
export const orderSource = tenant.enum('order_source', enumTuple(Object.values(OrderSource)));
export const paymentMethod = tenant.enum('payment_method', enumTuple(Object.values(PaymentMethod)));
export const callOutcome = tenant.enum('call_outcome', enumTuple(Object.values(CallOutcome)));
export const cancelReason = tenant.enum('cancel_reason', enumTuple(Object.values(CancelReason)));
export const orderHistoryField = tenant.enum(
  'order_history_field',
  enumTuple(Object.values(OrderHistoryField)),
);

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

// ORD-04 (D4-4): the last number a shop gave on one day in Asia/Dhaka, one row per shop and day, locked by the
// statement that takes the next one, so a day's numbers run 0001, 0002, ... with no gap or repeat; a rollback gives the
// number back, and a deleted order's number is never given again.
export const orderCounters = tenant.table(
  'order_counters',
  {
    tenantId: uuid('tenant_id').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.day] })],
);

// ORD-01 to ORD-16, ORD-40, ORD-41, ORD-51, ORD-52, MNU-04, PRD-08: one order. The visible status is never stored: it is
// worked out from the two axes, the confirming call and a manual override (`visibleOrderStatus`). The delivery zone,
// its charge and the shop's extra charge per kg are held as they were when the order was made, so later changes to the
// zones never move it (DLV-04, RAT-14).
export const orders = tenant.table(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    // ORD-04: YYMMDD-NNNN, the day in Asia/Dhaka and that day's sequence. Given last in the order's own transaction, so
    // the day's counter is held only briefly; a deferred check refuses an order still without one when it commits.
    orderNumber: varchar('order_number', { length: 16 }),
    // ORD-05: eight characters from an alphabet without 0, O, 1 or I, unique across the platform.
    trackingId: varchar('tracking_id', { length: 8 }).notNull(),
    source: orderSource('source').notNull().default(OrderSource.Dashboard),
    fulfilmentType: fulfilmentType('fulfilment_type').notNull().default(FulfilmentType.Delivery),
    // CUS-01: the customer the phone names; none for a dine-in order without a phone.
    customerId: uuid('customer_id'),
    customerName: varchar('customer_name', { length: CUSTOMER_NAME_MAX_LENGTH }),
    customerPhone: varchar('customer_phone', { length: 15 }),
    // CUS-08: the thana delivered to, by value (control.locations, no cross-schema key).
    locationId: integer('location_id'),
    deliveryAddress: varchar('delivery_address', { length: ORDER_ADDRESS_MAX_LENGTH }),
    // MNU-04: a dine-in order's table.
    tableRef: varchar('table_ref', { length: TABLE_REF_MAX_LENGTH }),
    // DLV-02: the zone the thana fell in, held by value with its name in both languages and its charge.
    deliveryZoneId: uuid('delivery_zone_id'),
    deliveryZoneName: jsonb('delivery_zone_name').$type<{ en: string; bn: string }>(),
    zoneCharge: money('zone_charge'),
    // RAT-14: the shop's extra charge per kg over a zone's charge, as it stood.
    extraChargePerKg: money('extra_charge_per_kg').notNull().default('0'),
    paymentStatus: orderPaymentStatus('payment_status')
      .notNull()
      .default(OrderPaymentStatus.Unverified),
    fulfillmentStatus: fulfillmentStatus('fulfillment_status')
      .notNull()
      .default(FulfillmentStatus.Unfulfilled),
    statusOverride: statusOverride('status_override'),
    // ORD-51: a call back later holds the order until this time, or until the next call.
    holdUntil: timestamp('hold_until', { withTimezone: true }),
    // ORD-51: when a call confirmed it, and who made the call.
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by'),
    // ORD-52.
    cancelReason: cancelReason('cancel_reason'),
    cancelNote: varchar('cancel_note', { length: CANCEL_NOTE_MAX_LENGTH }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    // ORD-06: what the items come to after their own discounts.
    subtotal: money('subtotal').notNull(),
    deliveryCharge: money('delivery_charge').notNull(),
    // ORD-06: the delivery charge was set by hand rather than worked out.
    deliveryChargeByHand: boolean('delivery_charge_by_hand').notNull().default(false),
    discount: money('discount').notNull().default('0'),
    grandTotal: money('grand_total').notNull(),
    // PRD-08, ORD-16: what must be paid before delivery, and what is collected on delivery.
    advanceDue: money('advance_due').notNull().default('0'),
    codAmount: money('cod_amount').notNull(),
    // ORD-06: what is still owed once verified payments are taken off (Slice 4.3).
    due: money('due').notNull(),
    // D4-7, ORD-09: the courier and its tracking, entered by hand when marked shipped (Slice 4.3).
    courierName: varchar('courier_name', { length: COURIER_NAME_MAX_LENGTH }),
    trackingCode: varchar('tracking_code', { length: TRACKING_CODE_MAX_LENGTH }),
    trackingLink: varchar('tracking_link', { length: TRACKING_LINK_MAX_LENGTH }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    // QTA-01, QTA-05, QTA-07: the only column the handling counters read; creating an order never sets it.
    handledAt: timestamp('handled_at', { withTimezone: true }),
    notes: varchar('notes', { length: ORDER_NOTES_MAX_LENGTH }),
    // LND-07 (agreed 2026-10-30): what the shopper wrote for the shop as they ordered; set once, never edited by staff.
    shopperNote: varchar('shopper_note', { length: SHOPPER_NOTE_MAX_LENGTH }),
    // CUS-09 (Slice 4.4a): when its customer was deleted at a privacy request. The name, phone, address and shopper's
    // note are gone from then on; the totals, items and thana stay.
    customerErasedAt: timestamp('customer_erased_at', { withTimezone: true }),
    // ORD-01: the staff member who entered it; null for an order a shopper placed (ORD-02).
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('orders_tenant_id_key').on(t.tenantId, t.id),
    unique('orders_tenant_number_key').on(t.tenantId, t.orderNumber),
    unique('orders_tracking_id_key').on(t.trackingId),
    foreignKey({
      name: 'orders_customer_fk',
      columns: [t.tenantId, t.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    // MNU-04: a delivery has its customer, thana and address; a takeaway its customer and no address; a dine-in its
    // table. Only a delivery has a zone or a delivery charge. CUS-09: once its customer is erased, the name, phone and
    // address are gone.
    check(
      'orders_fulfilment_check',
      sql`CASE ${t.fulfilmentType}
        WHEN 'delivery' THEN (${t.customerErasedAt} IS NOT NULL OR (${t.customerName} IS NOT NULL
          AND ${t.customerPhone} IS NOT NULL AND ${t.deliveryAddress} IS NOT NULL))
          AND ${t.locationId} IS NOT NULL AND ${t.tableRef} IS NULL
        WHEN 'takeaway' THEN (${t.customerErasedAt} IS NOT NULL OR (${t.customerName} IS NOT NULL
          AND ${t.customerPhone} IS NOT NULL))
          AND ${t.locationId} IS NULL AND ${t.deliveryAddress} IS NULL AND ${t.tableRef} IS NULL
        ELSE ${t.tableRef} IS NOT NULL AND ${t.locationId} IS NULL AND ${t.deliveryAddress} IS NULL
      END`,
    ),
    check(
      'orders_erased_check',
      sql`${t.customerErasedAt} IS NULL OR (${t.customerName} IS NULL AND ${t.customerPhone} IS NULL
        AND ${t.deliveryAddress} IS NULL AND ${t.shopperNote} IS NULL)`,
    ),
    check(
      'orders_delivery_charge_check',
      sql`${t.fulfilmentType} = 'delivery' OR (${t.deliveryCharge} = 0 AND ${t.zoneCharge} IS NULL)`,
    ),
    check(
      'orders_cancel_check',
      sql`(${t.statusOverride} IS NOT DISTINCT FROM 'cancelled') = (${t.cancelReason} IS NOT NULL)
        AND (${t.cancelReason} IS NOT NULL) = (${t.cancelledAt} IS NOT NULL)`,
    ),
    check(
      'orders_hold_check',
      sql`${t.holdUntil} IS NULL OR ${t.statusOverride} IS NOT DISTINCT FROM 'hold'`,
    ),
    check(
      'orders_money_check',
      sql`${t.subtotal} >= 0 AND ${t.deliveryCharge} >= 0 AND ${t.discount} >= 0 AND ${t.grandTotal} >= 0
        AND ${t.advanceDue} >= 0 AND ${t.codAmount} >= 0 AND ${t.advanceDue} + ${t.codAmount} = ${t.grandTotal}`,
    ),
    index('orders_tenant_created_idx').on(t.tenantId, t.createdAt.desc(), t.id.desc()),
    index('orders_handled_idx')
      .on(t.tenantId, t.handledAt)
      .where(sql`${t.handledAt} IS NOT NULL`),
    index('orders_customer_idx').on(t.tenantId, t.customerId),
    // DAT-13, ORD-13: search by any part of the name, the phone (its last four digits) or the order number.
    index('orders_customer_name_trgm_idx').using('gin', t.customerName.op('gin_trgm_ops')),
    index('orders_customer_phone_trgm_idx').using('gin', t.customerPhone.op('gin_trgm_ops')),
    index('orders_number_trgm_idx').using('gin', t.orderNumber.op('gin_trgm_ops')),
  ],
);

/** ATR-09, ATL-06: one attribute value as the line shows it, as text, whatever later becomes of the attribute. */
export interface LineAttributeSnapshot {
  name: string;
  /** Its options as written, joined; a number in its unit kind's base unit (UOM-02); or `true` / `false`. */
  value: string;
  /** How the value reads: a client shows a number with its unit, and yes or no in the reader's language. */
  dataType: AttributeDataType;
  unitKind: string | null;
  /** Splits the product into variants (Size: L) rather than describing it (Material: cotton). */
  variantDefining: boolean;
}

/** ATR-08: what the customer asked for on an attribute captured at order time. */
export interface LineCapturedSnapshot {
  attributeId: string;
  name: string;
  value: string;
}

// ORD-46: one item ordered, a snapshot sufficient on its own: the names, attribute values, prices, weight and delivery
// as they were. The product and variant are held by value as a convenience link only, so an order outlives a product
// deleted for good (PRD-13); the thumbnail is best effort (ORD-47).
export const orderLines = tenant.table(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    orderId: uuid('order_id').notNull(),
    // Where the item sits on the order, as entered.
    position: integer('position').notNull(),
    productId: uuid('product_id'),
    variantId: uuid('variant_id'),
    productName: varchar('product_name', { length: PRODUCT_NAME_MAX_LENGTH }).notNull(),
    sku: varchar('sku', { length: SKU_MAX_LENGTH }),
    attributeValues: jsonb('attribute_values')
      .$type<LineAttributeSnapshot[]>()
      .notNull()
      .default([]),
    capturedValues: jsonb('captured_values').$type<LineCapturedSnapshot[]>().notNull().default([]),
    // MED-09, ORD-47: the photo shown at order time, so deleting it can say how many past orders lose it.
    thumbnailMediaId: uuid('thumbnail_media_id'),
    thumbnailUrl: text('thumbnail_url'),
    stockUnit: stockUnit('stock_unit').notNull(),
    // ATR-05: the variant's own price when ordered; `unit_price` differs when staff set one by hand (ORD-06).
    listPrice: money('list_price').notNull(),
    unitPrice: money('unit_price').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
    // ORD-10, INV-17 (Slice 4.3): how much of it came back after shipping, sellable or damaged.
    returnedQuantity: numeric('returned_quantity', { precision: 14, scale: 3 })
      .notNull()
      .default('0'),
    // INV-24: how much of a shared stock one unit used, so a return restores the same; null otherwise.
    packAmount: numeric('pack_amount', { precision: 14, scale: 3 }),
    itemDiscount: money('item_discount').notNull().default('0'),
    itemTotal: money('item_total').notNull(),
    // ATR-13, ORD-06a: the effective weight per unit, the variant's or product's own delivery charge (null: a zone
    // line), the mode it is worked out by, and what this line itself adds to the delivery charge.
    weightKg: numeric('weight_kg', { precision: 10, scale: 3 }),
    ownDeliveryCharge: money('own_delivery_charge'),
    deliveryMode: deliveryMode('delivery_mode').notNull(),
    deliveryCharge: money('delivery_charge').notNull(),
    // PRD-08: the policy the line was ordered under and the advance it asks.
    paymentPolicy: paymentPolicy('payment_policy').notNull(),
    // The partial advance the policy asked, as it stood, so an edited quantity works the line's advance out again.
    policyAdvance: money('policy_advance'),
    advance: money('advance').notNull().default('0'),
    // TAX-02, TAX-03 (Slice 4.6a): the tax class and rate it was ordered under, as they stood, and the tax its total
    // includes -- prices include tax, so this is the share of the line that is tax, never added on top.
    taxClassName: varchar('tax_class_name', { length: TAX_CLASS_NAME_MAX_LENGTH }),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }),
    taxAmount: money('tax_amount').notNull().default('0'),
  },
  (t) => [
    unique('order_lines_tenant_id_key').on(t.tenantId, t.id),
    foreignKey({
      name: 'order_lines_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }).onDelete('cascade'),
    check('order_lines_quantity_check', sql`${t.quantity} > 0`),
    check(
      'order_lines_tax_check',
      sql`(${t.taxClassName} IS NULL) = (${t.taxRate} IS NULL) AND ${t.taxAmount} >= 0`,
    ),
    check(
      'order_lines_returned_check',
      sql`${t.returnedQuantity} >= 0 AND ${t.returnedQuantity} <= ${t.quantity}`,
    ),
    check('order_lines_pack_check', sql`${t.packAmount} > 0`),
    // UOM-04, INV-24: a fraction only of a measured unit, and only whole packs of a shared stock.
    check(
      'order_lines_whole_units_check',
      sql`${t.quantity} = trunc(${t.quantity})
        OR (${t.packAmount} IS NULL AND ${t.stockUnit} IN ('kg', 'g', 'liter', 'ml'))`,
    ),
    check(
      'order_lines_money_check',
      sql`${t.listPrice} >= 0 AND ${t.unitPrice} >= 0 AND ${t.itemDiscount} >= 0 AND ${t.itemTotal} >= 0
        AND ${t.deliveryCharge} >= 0 AND ${t.ownDeliveryCharge} >= 0 AND ${t.advance} >= 0`,
    ),
    index('order_lines_order_idx').on(t.tenantId, t.orderId, t.position),
    index('order_lines_product_idx').on(t.tenantId, t.productId),
    index('order_lines_thumbnail_idx')
      .on(t.tenantId, t.thumbnailMediaId)
      .where(sql`${t.thumbnailMediaId} IS NOT NULL`),
  ],
);

// CMB-03, CMB-04: a combo line's components as ordered -- each variant of each part, its name and options copied at
// order time, and its units in one combo (a choice part picked M-Red, M-Red, L-Black: M-Red 2 and L-Black 1), each in
// its place on the line: the parts in order, a choice's variants as first picked. The variant is a convenience link
// like the line's own; the line's reservations and stock movements are per variant.
export const orderLineComponents = tenant.table(
  'order_line_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    orderLineId: uuid('order_line_id').notNull(),
    position: integer('position').notNull(),
    partPosition: integer('part_position').notNull(),
    productId: uuid('product_id'),
    variantId: uuid('variant_id'),
    productName: varchar('product_name', { length: PRODUCT_NAME_MAX_LENGTH }).notNull(),
    attributeValues: jsonb('attribute_values')
      .$type<LineAttributeSnapshot[]>()
      .notNull()
      .default([]),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'order_line_components_line_fk',
      columns: [t.tenantId, t.orderLineId],
      foreignColumns: [orderLines.tenantId, orderLines.id],
    }).onDelete('cascade'),
    unique('order_line_components_position_key').on(t.orderLineId, t.position),
    check('order_line_components_position_check', sql`${t.position} > 0`),
    check('order_line_components_quantity_check', sql`${t.quantity} > 0`),
    index('order_line_components_line_idx').on(t.tenantId, t.orderLineId),
    index('order_line_components_variant_idx').on(t.tenantId, t.variantId),
  ],
);

// ORD-08, ORD-14: what happened to an order and when -- its making, a confirming call, a status set or cleared, a
// price or delivery charge set by hand -- with who did it. Never changed; it goes with its order.
export const orderStatusHistory = tenant.table(
  'order_status_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    orderId: uuid('order_id').notNull(),
    field: orderHistoryField('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    note: varchar('note', { length: CANCEL_NOTE_MAX_LENGTH }),
    changedBy: uuid('changed_by'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'order_status_history_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }).onDelete('cascade'),
    index('order_status_history_order_idx').on(t.tenantId, t.orderId, t.changedAt, t.id),
  ],
);

// ORD-51: one call to an order's customer, how it ended, and who made it. Never changed; it goes with its order.
export const orderCalls = tenant.table(
  'order_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    orderId: uuid('order_id').notNull(),
    outcome: callOutcome('outcome').notNull(),
    callBackAt: timestamp('call_back_at', { withTimezone: true }),
    note: varchar('note', { length: CALL_NOTE_MAX_LENGTH }),
    calledBy: uuid('called_by'),
    calledAt: timestamp('called_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'order_calls_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }).onDelete('cascade'),
    check(
      'order_calls_call_back_check',
      sql`(${t.outcome} = 'call_back_later') = (${t.callBackAt} IS NOT NULL)`,
    ),
    index('order_calls_order_idx').on(t.tenantId, t.orderId, t.calledAt),
  ],
);

// ORD-15, ORD-22, D4-6 (Slice 4.3): money that came in for an order, verified as it is recorded -- by staff, or the cash on
// delivery collected when the order was delivered or handed over (agreed 2026-10-30). Cash on delivery and cash at the
// counter carry no transaction ID; a wallet or bank payment carries one, unique across the platform (Slice 4.3b,
// control.used_transaction_ids). It changes only by being voided, once (migration 0088's grant and guard); it goes with
// its order. Phase 5 adds payment sessions, their verification levels and refunds on this table (DATABASE-SCHEMA §3.4).
export const orderPayments = tenant.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    orderId: uuid('order_id').notNull(),
    method: paymentMethod('method').notNull(),
    amount: money('amount').notNull(),
    senderNumber: varchar('sender_number', { length: 15 }),
    transactionId: text('transaction_id'),
    verifiedBy: uuid('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    // Slice 4.3b (agreed 2026-10-30): a payment recorded by mistake is voided with its reason, never deleted or changed;
    // it no longer counts toward what the order has been paid.
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by'),
    voidReason: varchar('void_reason', { length: CALL_NOTE_MAX_LENGTH }),
  },
  (t) => [
    foreignKey({
      name: 'payments_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }).onDelete('cascade'),
    check('payments_amount_check', sql`${t.amount} > 0`),
    check(
      'payments_reference_check',
      sql`(${t.method} IN ('cash_on_delivery', 'cash')) = (${t.transactionId} IS NULL)`,
    ),
    check('payments_void_check', sql`(${t.voidedAt} IS NULL) = (${t.voidReason} IS NULL)`),
    index('payments_order_idx').on(t.tenantId, t.orderId, t.verifiedAt),
    // ORD-15: within a shop, one live payment per transaction ID; across shops, control.used_transaction_ids.
    uniqueIndex('payments_live_transaction_key')
      .on(t.tenantId, t.transactionId)
      .where(sql`${t.transactionId} IS NOT NULL AND ${t.voidedAt} IS NULL`),
  ],
);

export type SelectOrder = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type SelectOrderLine = typeof orderLines.$inferSelect;
export type InsertOrderLine = typeof orderLines.$inferInsert;
export type SelectOrderLineComponent = typeof orderLineComponents.$inferSelect;
export type InsertOrderLineComponent = typeof orderLineComponents.$inferInsert;
export type SelectOrderHistory = typeof orderStatusHistory.$inferSelect;
export type SelectOrderCall = typeof orderCalls.$inferSelect;
export type SelectOrderPayment = typeof orderPayments.$inferSelect;
export type InsertOrderPayment = typeof orderPayments.$inferInsert;
