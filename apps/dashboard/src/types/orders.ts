import type {
  AttributeDataType,
  CallOutcome,
  CancelReason,
  FulfillmentStatus,
  FulfilmentType,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  SerialFormat,
  StatusOverride,
  StockUnit,
} from '@lytronix/validators';
import type { Bilingual } from './onboarding';

// Mirrors apps/server/src/modules/orders/types/orders.ts (GET /orders, GET /orders/:id; ORD-01 to ORD-52). Times are
// ISO strings, amounts decimal strings in taka.

/** Who did something on an order; the name is gone once the person was removed. */
export interface OrderPerson {
  id: string;
  name: string | null;
}

/** Where a delivery order goes, as GET /orders names it (Slice 4.8a). */
export interface OrderArea {
  thana: { id: number; nameEn: string; nameBn: string };
  zilla: { id: number; nameEn: string; nameBn: string };
}

/** Mirrors `OrderListItem`: an order as the list shows it. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  source: OrderSource;
  fulfilmentType: FulfilmentType;
  customerName: string | null;
  customerPhone: string | null;
  /** Its customer was deleted at a privacy request (CUS-09): the name and phone are gone. */
  customerErased: boolean;
  tableRef: string | null;
  /** How many items. */
  items: number;
  grandTotal: string;
  codAmount: string;
  cancelReason: CancelReason | null;
  holdUntil: string | null;
  createdAt: string;
  area: OrderArea | null;
  /** ORD-51: the calls that went unanswered. */
  unansweredCalls: number;
}

/** GET /orders: newest first, a page at a time. */
export interface OrderPage {
  orders: OrderSummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** ORD-46: an attribute of the item as it was ordered. */
export interface LineAttribute {
  name: string;
  value: string;
  dataType: AttributeDataType;
  unitKind: string | null;
  variantDefining: boolean;
}

/** MNU-02: a modifier option chosen, already in the item's unit price. */
export interface LineModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceChange: string;
}

/** CMB-04: one item inside a combo line, its units in one combo. */
export interface OrderComponent {
  partPosition: number;
  productId: string | null;
  variantId: string | null;
  productName: string;
  attributes: LineAttribute[];
  quantity: string;
}

/** Mirrors `OrderItemView`: an item as ordered (ORD-46). */
export interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  sku: string | null;
  attributes: LineAttribute[];
  captured: { attributeId: string; name: string; value: string }[];
  thumbnail: { mediaId: string; url: string } | null;
  stockUnit: StockUnit;
  listPrice: string;
  unitPrice: string;
  quantity: string;
  packAmount: string | null;
  itemDiscount: string;
  itemTotal: string;
  weightKg: string | null;
  modifiers: LineModifier[];
  taxClassName: string | null;
  taxRate: string | null;
  taxAmount: string;
  components: OrderComponent[];
  /** ORD-10: the units back; a combo line counts its combos. */
  returnedQuantity: string;
}

/** INV-14: one serial-numbered part of an order (GET /orders/:id/serials), a line or a combo's component. */
export interface OrderSerialItem {
  lineId: string;
  variantId: string;
  productName: string;
  quantity: string;
  serialFormat: SerialFormat;
  /** While the order waits: the serials it can be sent with. */
  inStock: string[];
  /** Once it has gone: the serials it was sent with, not back yet. */
  sent: string[];
}

/** Mirrors `OrderCallView` (ORD-51). */
export interface OrderCall {
  id: string;
  outcome: CallOutcome;
  callBackAt: string | null;
  note: string | null;
  by: OrderPerson | null;
  at: string;
}

/** Mirrors `OrderHistoryView`: one change, oldest first. */
export interface OrderHistory {
  field: OrderHistoryField;
  from: string | null;
  to: string | null;
  note: string | null;
  by: OrderPerson | null;
  at: string;
}

/** Mirrors `OrderPaymentView` (ORD-15, ORD-22). */
export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: OrderPerson | null;
  verifiedAt: string;
  voided: { by: OrderPerson | null; at: string; reason: string } | null;
}

/** Mirrors `OrderView` (GET /orders/:id, ORD-14). */
export interface Order {
  id: string;
  orderNumber: string;
  trackingId: string;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  override: StatusOverride | null;
  holdUntil: string | null;
  confirmedAt: string | null;
  confirmedBy: OrderPerson | null;
  fulfilmentType: FulfilmentType;
  customerId: string | null;
  /** CUS-01: how many orders its customer has; null with none or once erased. */
  customerOrders: number | null;
  customerErased: boolean;
  customerName: string | null;
  customerPhone: string | null;
  location: { id: number; nameEn: string; nameBn: string; zillaId: number } | null;
  deliveryAddress: string | null;
  tableRef: string | null;
  deliveryZone: { id: string; name: Bilingual; charge: string } | null;
  cancelReason: CancelReason | null;
  cancelNote: string | null;
  cancelledAt: string | null;
  subtotal: string;
  deliveryCharge: string;
  deliveryChargeByHand: boolean;
  discount: string;
  grandTotal: string;
  advanceDue: string;
  codAmount: string;
  due: string;
  /** TAX-03: what the grand total includes, per class. */
  taxes: { name: string; rate: string; amount: string }[];
  courierName: string | null;
  trackingCode: string | null;
  trackingLink: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  /** What the shopper wrote at checkout, read-only. */
  shopperNote: string | null;
  createdBy: OrderPerson | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  calls: OrderCall[];
  unansweredCalls: number;
  history: OrderHistory[];
  payments: OrderPayment[];
  /** QTA-03: in the reply of the ship or hand-over that passed the period's limit. */
  limitPrompt: { metric: 'orders_monthly'; limit: number } | null;
}
