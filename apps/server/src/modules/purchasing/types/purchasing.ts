import type {
  PurchaseLineRow,
  PurchaseOrderRow,
  PurchaseOrderSummaryRow,
  SelectSupplier,
} from '@lytronix/db';
import type { PurchaseStatus, StockUnit } from '@lytronix/validators';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type SupplierRecord = SelectSupplier;
export type { PurchaseLineRow, PurchaseOrderRow, PurchaseOrderSummaryRow };

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

export interface SupplierPage {
  suppliers: SupplierView[];
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

/** PUR-02: one purchase, item by item. A draft has no number. */
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
  items: PurchaseItemView[];
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
  total?: string;
  unknownCost?: number;
}

export interface PurchaseOrderPage {
  purchaseOrders: PurchaseOrderSummaryView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** One item as a purchase stores it. */
export interface NewPurchaseLine {
  productId: string;
  variantId: string;
  position: number;
  quantityOrdered: string;
  unitCost: string | null;
}
