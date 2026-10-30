import type {
  LineAttributeSnapshot,
  LineCapturedSnapshot,
  NewOrderLine,
  OrderRow,
  OrderSummaryRow,
  SelectOrder,
  SelectOrderCall,
  SelectOrderHistory,
  SelectOrderLine,
  SelectOrderPayment,
} from '@lytronix/db';
import type {
  CallOutcome,
  CancelReason,
  DeliveryMode,
  FulfillmentStatus,
  FulfilmentType,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentPolicy,
  StatusOverride,
  StockUnit,
} from '@lytronix/validators';
import type { Bilingual, ThanaView } from '../../delivery/types/delivery';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type OrderRecord = OrderRow;
/** ORD-04: an order inside the transaction making it, before it takes its number. */
export type UnnumberedOrder = SelectOrder;
export type OrderLineRecord = SelectOrderLine;
export type OrderHistoryRecord = SelectOrderHistory;
export type OrderCallRecord = SelectOrderCall;
export type OrderPaymentRecord = SelectOrderPayment;
export type { LineAttributeSnapshot, LineCapturedSnapshot, NewOrderLine, OrderSummaryRow };

/** A staff member named on an order (who made a call, who confirmed it), or null where the row has gone. */
export interface OrderPerson {
  id: string;
  name: string | null;
}

/**
 * DLV-06, DLV-07: what staff are told when an order goes where the shop does not deliver, or holds a product limited to
 * other zones. A staff order still saves; a public one is refused (Slice 4.2).
 */
export interface OrderWarning {
  code: 'zone_no_delivery' | 'product_not_delivered_here';
  zone: Bilingual;
  productName: string | null;
}

/** ORD-46: one item as the order shows it, from its own snapshot. */
export interface OrderItemView {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  sku: string | null;
  attributes: LineAttributeSnapshot[];
  captured: LineCapturedSnapshot[];
  thumbnail: { mediaId: string; url: string } | null;
  stockUnit: StockUnit;
  /** ATR-05: the variant's price when ordered, and the price charged; they differ when set by hand (ORD-06). */
  listPrice: string;
  unitPrice: string;
  quantity: string;
  packAmount: string | null;
  itemDiscount: string;
  itemTotal: string;
  weightKg: string | null;
  ownDeliveryCharge: string | null;
  deliveryMode: DeliveryMode;
  deliveryCharge: string;
  paymentPolicy: PaymentPolicy;
  advance: string;
}

/** ORD-51: one call to the customer. */
export interface OrderCallView {
  id: string;
  outcome: CallOutcome;
  callBackAt: Date | null;
  note: string | null;
  by: OrderPerson | null;
  at: Date;
}

/** ORD-08, ORD-14: one entry of the order's history. */
export interface OrderHistoryView {
  field: OrderHistoryField;
  from: string | null;
  to: string | null;
  note: string | null;
  by: OrderPerson | null;
  at: Date;
}

/** ORD-14: everything the order detail shows. */
export interface OrderView {
  id: string;
  orderNumber: string;
  trackingId: string;
  source: OrderSource;
  /** ORD-41: worked out, never stored. */
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  override: StatusOverride | null;
  holdUntil: Date | null;
  confirmedAt: Date | null;
  confirmedBy: OrderPerson | null;
  fulfilmentType: FulfilmentType;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  location: (ThanaView & { zillaId: number }) | null;
  deliveryAddress: string | null;
  tableRef: string | null;
  deliveryZone: { id: string; name: Bilingual; charge: string } | null;
  extraChargePerKg: string;
  cancelReason: CancelReason | null;
  cancelNote: string | null;
  cancelledAt: Date | null;
  subtotal: string;
  deliveryCharge: string;
  deliveryChargeByHand: boolean;
  discount: string;
  grandTotal: string;
  advanceDue: string;
  codAmount: string;
  due: string;
  courierName: string | null;
  trackingCode: string | null;
  trackingLink: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  handledAt: Date | null;
  notes: string | null;
  /** LND-07: what the shopper wrote for the shop as they ordered; staff read it, never change it. */
  shopperNote: string | null;
  createdBy: OrderPerson | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemView[];
  calls: OrderCallView[];
  /** ORD-51: how many calls went unanswered. */
  unansweredCalls: number;
  history: OrderHistoryView[];
  /** ORD-15, ORD-22 (Slice 4.3): money recorded for it, oldest first. */
  payments: OrderPaymentView[];
  /** DLV-06, DLV-07: said when the order is entered or changed; empty when it is only read. */
  warnings: OrderWarning[];
  /**
   * QTA-03 (Slice 4.3): said when the order was just shipped or handed over past the period's handling limit, which
   * the operator's mode let through, so the owner is prompted to upgrade; null otherwise.
   */
  limitPrompt: { metric: 'orders_monthly'; limit: number } | null;
}

/** ORD-15, ORD-22: money that came in for an order, and who recorded it. */
export interface OrderPaymentView {
  id: string;
  method: PaymentMethod;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: OrderPerson | null;
  verifiedAt: Date;
}

/** ORD-13: one order as the list shows it. */
export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  source: OrderSource;
  fulfilmentType: FulfilmentType;
  customerName: string | null;
  customerPhone: string | null;
  tableRef: string | null;
  items: number;
  grandTotal: string;
  codAmount: string;
  cancelReason: CancelReason | null;
  holdUntil: Date | null;
  createdAt: Date;
}

/** API-17: one page of orders, with how many match in all. */
export interface OrderPage {
  orders: OrderListItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** D4-9: an order priced before it is made -- the New order screen's totals. */
export interface OrderQuote {
  items: {
    variantId: string;
    productName: string;
    listPrice: string;
    unitPrice: string;
    quantity: string;
    itemTotal: string;
    deliveryCharge: string;
    advance: string;
  }[];
  deliveryZone: { id: string; name: Bilingual; charge: string } | null;
  subtotal: string;
  deliveryCharge: string;
  discount: string;
  grandTotal: string;
  advanceDue: string;
  codAmount: string;
  warnings: OrderWarning[];
}

/** D4-8: an order made, or the reply stored for the same key earlier, replayed. */
export type OrderCreated =
  { replayed: false; order: OrderView } | { replayed: true; body: unknown };

/** ORD-17, LND-11: an item as the shopper sees it -- what it is and what it came to, never the shop's own figures. */
export interface ShopperItemView {
  variantId: string | null;
  productName: string;
  /** ATR-09: the values that make the variant (Size: L). */
  attributes: LineAttributeSnapshot[];
  quantity: string;
  stockUnit: StockUnit;
  unitPrice: string;
  itemTotal: string;
}

/** The totals a shopper is shown, in TK. */
export interface ShopperTotals {
  subtotal: string;
  deliveryCharge: string;
  discount: string;
  grandTotal: string;
  /** PRD-08: what is paid on delivery. */
  codAmount: string;
}

/**
 * ORD-02, LND-11, SFT-06: a shopper's order as placed: its number and tracking ID for the confirmation, and the ID of
 * Meta's `Purchase` event, which the browser sends with the same ID so Meta counts the purchase once (LND-16).
 */
export interface PlacedOrderView extends ShopperTotals {
  orderNumber: string;
  trackingId: string;
  status: OrderStatus;
  createdAt: Date;
  items: ShopperItemView[];
  purchaseEventId: string;
}

/** ORD-17 (agreed 2026-10-30): the steps a shopper is shown; calls, a hold and a review stay the shop's own. */
export type TrackingStepName = 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export interface TrackingStep {
  step: TrackingStepName;
  at: Date;
}

/**
 * ORD-17, SFT-08 (amended 2026-10-30, the storefront sketch's courier line): an order by its tracking ID: its status,
 * timeline, items and totals, and once it ships its courier and tracking link -- never its customer's address or phone.
 */
export interface TrackedOrderView extends ShopperTotals {
  orderNumber: string;
  trackingId: string;
  status: OrderStatus;
  timeline: TrackingStep[];
  items: ShopperItemView[];
  due: string;
  courier: { name: string | null; trackingCode: string | null; trackingLink: string | null } | null;
}
