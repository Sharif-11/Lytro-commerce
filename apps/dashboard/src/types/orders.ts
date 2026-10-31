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
  ProductKind,
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
  /** PAY-20 (Slice 5.3): marked refunded -- who, when and the note; it no longer counts. */
  refunded: { by: OrderPerson | null; at: string; note: string } | null;
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
  /** DLV-06, DLV-07: what staff were warned of as it was made or changed. */
  warnings: OrderWarning[];
}

/** New order's Add an item (GET /orders/picker): a product found, with the units it has on sale (null: made to order). */
export interface OrderPickerItem {
  id: string;
  name: string;
  kind: ProductKind;
  minPrice: string;
  maxPrice: string;
  active: boolean;
  image: string | null;
  variantCount: number;
  available: string | null;
}

export interface OrderPickerPage {
  products: OrderPickerItem[];
  page: number;
  pages: number;
  total: number;
}

/** MNU-01: one of a product's add-on groups, as GET /orders/picker/:productId gives it. */
export interface PickerModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; priceChange: string; isDefault: boolean }[];
}

/** GET /orders/picker/:productId: its variants and their units, a combo's parts, its add-on groups. */
export interface OrderPickerProduct {
  id: string;
  name: string;
  kind: ProductKind;
  active: boolean;
  variants: { variantId: string; label: string; price: string; available: string | null }[];
  parts: {
    position: number;
    quantity: string;
    variants: {
      variantId: string;
      productName: string;
      label: string;
      onSale: boolean;
      available: string | null;
    }[];
  }[];
  modifierGroups: PickerModifierGroup[];
}

/** DLV-06, DLV-07: where the shop does not deliver, or a product may not go; the order still saves. */
export interface OrderWarning {
  code: 'zone_no_delivery' | 'product_not_delivered_here';
  zone: Bilingual;
  productName: string | null;
}

/** POST /orders/quote (D4-9): the order priced as it is typed, nothing held. */
export interface OrderQuote {
  items: { variantId: string; unitPrice: string; quantity: string; itemTotal: string }[];
  deliveryZone: { id: string; name: Bilingual; charge: string } | null;
  subtotal: string;
  deliveryCharge: string;
  discount: string;
  grandTotal: string;
  advanceDue: string;
  codAmount: string;
  taxes: { name: string; rate: string; amount: string }[];
  warnings: OrderWarning[];
}

/** CUS-01, CUS-02 (GET /customers, GET /customers/:id): a customer as New order's known phone reads them. */
export interface KnownCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
}

/** GET /customers/:id: with where its latest delivery went. */
export interface KnownCustomerView extends KnownCustomer {
  lastAddress: { locationId: number; deliveryAddress: string } | null;
}
