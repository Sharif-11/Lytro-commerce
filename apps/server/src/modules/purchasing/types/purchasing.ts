import type {
  PurchaseHistoryRow,
  PurchaseLineRow,
  PurchaseOrderRow,
  PurchaseOrderSummaryRow,
  PurchaseReceiptLineRow,
  PurchaseReceiptRow,
  PurchaseUnitsRow,
  SelectSupplier,
  SupplierListRow,
} from '@lytronix/db';
import type { PurchaseStatus, StockUnit } from '@lytronix/validators';
import type { UnitQuantity } from '../../inventory/types/inventory';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type SupplierRecord = SelectSupplier;
export type SupplierListRecord = SupplierListRow;
export type { PurchaseUnitsRow };
export type {
  PurchaseHistoryRow,
  PurchaseLineRow,
  PurchaseOrderRow,
  PurchaseOrderSummaryRow,
  PurchaseReceiptLineRow,
  PurchaseReceiptRow,
};

/** PUR-01: a supplier as the shop sees it. */
export interface SupplierView {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  postalAddress: string | null;
  notes: string | null;
  /** No longer offered for new purchases; its past ones still show its name. */
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** PUR-01: a supplier as the list shows it, with when it was last bought from. */
export interface SupplierListView extends SupplierView {
  lastPurchaseAt: Date | null;
}

export interface SupplierPage {
  suppliers: SupplierListView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** PUR-02: the supplier a purchase is from, by the name it has now. */
export interface PurchaseSupplierView {
  id: string;
  name: string | null;
}

/**
 * PUR-02, PUR-05: one item on a purchase, in the product's stock unit. `outstanding` is what is still to come; it is
 * incoming stock only while the purchase is placed and open. Cost is shown only to a caller who may see it (D3-9).
 */
export interface PurchaseItemView {
  id: string;
  productId: string;
  variantId: string;
  /** Null where the product has since been deleted for good (PRD-13). */
  productName: string | null;
  /** The variant's options; none for a product's single variant or its shared stock. */
  optionIds: string[];
  /** INV-24: the item buys the product's shared stock. */
  sharedStock: boolean;
  stockUnit: StockUnit | null;
  quantityOrdered: string;
  quantityReceived: string;
  outstanding: string;
  unitCost?: string | null;
  /** Quantity ordered at the unit cost, to the paisa; null when the cost is not known. */
  total?: string | null;
}

/** PUR-04: what one delivery brought for one item. Cost only for a caller who may see it (D3-9). */
export interface ReceiptItemView {
  itemId: string;
  accepted: string;
  rejected: string;
  rejectReason: string | null;
  unitCost?: string | null;
  /** INV-12: the batch the accepted units landed in. */
  batch: { id: string; batchCode: string | null; expiresOn: string | null } | null;
}

/** PUR-04, PUR-08: one delivery against a purchase, as it was saved; it never changes. */
export interface PurchaseReceiptView {
  id: string;
  receivedAt: Date;
  actor: { userId: string; name: string | null } | null;
  note: string | null;
  items: ReceiptItemView[];
}

/** PUR-02: one purchase, item by item, with its deliveries. A draft has no number. */
export interface PurchaseOrderView {
  id: string;
  number: number | null;
  status: PurchaseStatus;
  supplier: PurchaseSupplierView | null;
  expectedOn: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  orderedAt: Date | null;
  /** PUR-06: why it was closed short; null otherwise. */
  closeReason: string | null;
  items: PurchaseItemView[];
  /** PUR-04: its deliveries, oldest first. */
  receipts: PurchaseReceiptView[];
  /** What the items cost where the cost is known, to the paisa, and how many have none. */
  total?: string;
  unknownCost?: number;
}

/** PUR-02: a purchase as its list shows it. */
export interface PurchaseOrderSummaryView {
  id: string;
  number: number | null;
  status: PurchaseStatus;
  supplier: PurchaseSupplierView | null;
  expectedOn: string | null;
  createdAt: Date;
  orderedAt: Date | null;
  items: number;
  /** PUR-05: what it orders, unit by unit, and -- while it is placed and open -- what is still to come. */
  units: UnitQuantity[];
  outstanding: UnitQuantity[];
  total?: string;
  unknownCost?: number;
}

export interface PurchaseOrderPage {
  purchaseOrders: PurchaseOrderSummaryView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  /** PUR-05: what the shop's placed, open purchases still bring, unit by unit, and from how many purchases. */
  coming: { units: UnitQuantity[]; purchases: number };
}

/** PUR-09: one delivery of a variant, as its purchase history shows it. Cost only with inventory:manage (D3-9). */
export interface PurchaseHistoryView {
  receiptId: string;
  purchaseOrderId: string;
  number: number | null;
  supplier: PurchaseSupplierView | null;
  receivedAt: Date;
  accepted: string;
  rejected: string;
  rejectReason: string | null;
  unitCost?: string | null;
}

export interface PurchaseHistoryPage {
  purchases: PurchaseHistoryView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** What a delivery brought for one item, as a receipt stores it. */
export interface NewReceiptLine {
  purchaseLineId: string;
  quantityAccepted: string;
  quantityRejected: string;
  rejectReason: string | null;
  unitCost: string | null;
  batchId: string | null;
  movementId: number | null;
}

/** One item as a purchase stores it. */
export interface NewPurchaseLine {
  productId: string;
  variantId: string;
  position: number;
  quantityOrdered: string;
  unitCost: string | null;
}
