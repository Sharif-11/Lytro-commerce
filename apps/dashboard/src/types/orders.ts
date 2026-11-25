import type {
  AttributeDataType,
  CallOutcome,
  CancelReason,
  FulfillmentStatus,
  FulfilmentType,
  OrderAccess,
  OrderHistoryField,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  ProductKind,
  SerialFormat,
  StatusOverride,
  StockUnit,
  ParcelAttention,
  VerificationLevel,
} from '@lytronix/validators';
import type { OrderListParcel, OrderParcel } from './couriers';
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
  /** Null on a locked order, which names its zilla alone (PAYG-FAIR-USE-PLAN PF-21). */
  thana: { id: number; nameEn: string; nameBn: string } | null;
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
  /** PYG-22: how much of a pay-as-you-go order from Lytro the shop has opened; open for every other. */
  access: OrderAccess;
  area: OrderArea | null;
  /** ORD-51: the calls that went unanswered. */
  unansweredCalls: number;
  /** Slice 6.7: where its live parcel stands, for the row's courier line. */
  parcel: OrderListParcel | null;
  /** Slice 6.7: what a courier reported that staff haven't marked seen (Needs a look). */
  attention: ParcelAttention | null;
  /** OB-20: the delivery address line; null at the counter and on a locked order (PF-21). */
  deliveryAddress: string | null;
  /** INV-25 (OB-11): how many units its lines still wait for; "0.000" when none. */
  short: string;
  /** OB-20: the photos its first three lines were ordered with, in line order. */
  thumbs: string[];
}

/** GET /orders: newest first, a page at a time. */
export interface OrderPage {
  orders: OrderSummary[];
  /** PYG-22 (PF-25): how many of the shop's orders are still locked, whatever the filter. */
  locked: number;
  /** INV-25 (OB-11): how many of the shop's orders still wait for stock, for the "স্টক কম" chip. */
  short: number;
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
  /** ATR-20 (PD-9): the design the shopper chose, by its name for the seller. */
  design?: true;
}

/** ATR-20 (PD-9): whether an item is a design product's, so the seller's screens name its design and SKU. */
export const hasDesign = (item: { attributes: readonly LineAttribute[] }): boolean =>
  item.attributes.some((attribute) => attribute.design === true);

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
  /** The owner, 2026-11-19: its SKU, unit and photo as ordered, or its variant's current ones on older orders. */
  sku: string | null;
  stockUnit: StockUnit;
  thumbnail: { mediaId: string; url: string; largeUrl: string } | null;
}

/** Mirrors `OrderItemView`: an item as ordered (ORD-46). */
export interface OrderItem {
  id: string;
  /** INV-25 (OB-11): how many of it the line still waits for; "0.000" when none. */
  short: string;
  /** OB-12: what older orders wait for on the same stock, which gets it first; null when none. */
  ahead: { orders: number; quantity: string } | null;
  productId: string | null;
  variantId: string | null;
  productName: string;
  sku: string | null;
  attributes: LineAttribute[];
  captured: { attributeId: string; name: string; value: string }[];
  /** ORD-47: the picture as ordered; `largeUrl` (the fixes PR, 2026-11-14) is its large rendition for the lightbox. */
  thumbnail: { mediaId: string; url: string; largeUrl?: string } | null;
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
  /** VER-02: how it was verified; only a manual one can be voided (the fixes PR, 2026-11-14). */
  verificationLevel: VerificationLevel;
}

/** Mirrors `OrderView` (GET /orders/:id, ORD-14). */
export interface Order {
  id: string;
  orderNumber: string;
  trackingId: string;
  source: OrderSource;
  /** PYG-22: open, or locked / phone shown / confirmed for a pay-as-you-go order from Lytro. */
  access: OrderAccess;
  /** PYG-22 (PF-21): the district it goes to, which even a locked order shows; null at the counter. */
  district: { id: number; nameEn: string; nameBn: string } | null;
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
  /** PYG-02: when it was first handled (shipped, booked or handed over), the order fee taken then; null before. */
  handledAt: string | null;
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
  /** INV-25 (OB-11): how many units its lines still wait for; above zero it can't leave (OB-9). */
  short: string;
  calls: OrderCall[];
  unansweredCalls: number;
  history: OrderHistory[];
  payments: OrderPayment[];
  /** QTA-03: in the reply of the ship or hand-over that passed the period's limit. */
  limitPrompt: { metric: 'orders_monthly'; limit: number } | null;
  /** DLV-06, DLV-07: what staff were warned of as it was made or changed. */
  warnings: OrderWarning[];
  /** CRR-06 (Phase 6): its courier booking, live or the last one. */
  parcel: OrderParcel | null;
  /** ORD-11: details changed on an order already booked; the courier's record is not changed with them. */
  courierRecordUnchanged: boolean;
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
  /** Slice 4.8c: its option names, one list per attribute; empty for one with no options. */
  optionNames: string[][];
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

/** ATR-08: one thing asked when ordering a product: text, or a number. */
export interface PickerAsked {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
}

/** GET /orders/picker/:productId: its variants and their units, a combo's parts, its add-on groups. */
export interface OrderPickerProduct {
  id: string;
  name: string;
  kind: ProductKind;
  active: boolean;
  /** UOM-03 (Slice 4.8c): a measured unit may go in a combo by part of one. */
  stockUnit: StockUnit;
  variants: {
    variantId: string;
    label: string;
    /** ATR-20 (PD-22): a design's variant's design cover, so staff pick by photo; null for others. */
    image: string | null;
    /** Its design, so a product's variants are grouped by design; null for others. */
    design: { id: string; name: string } | null;
    /** Its other values without its design ("54"); `label` for others. */
    restLabel: string;
    price: string;
    onSale: boolean;
    available: string | null;
  }[];
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
  /** ATR-08: what the seller marked asked when ordering it. */
  asked: PickerAsked[];
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
