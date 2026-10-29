import type { PurchaseStatus, SerialFormat, StockUnit } from '@lytronix/validators';
import type { VariantAttribute } from './product';
import type { UnitQuantity } from './stock';

/** Mirrors `SupplierListView` in apps/server/src/modules/purchasing/types/purchasing.ts (PUR-01). */
export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  postalAddress: string | null;
  notes: string | null;
  /** No longer offered for new purchases; its past ones still show its name. */
  archived: boolean;
  lastPurchaseAt?: string | null;
}

/** GET /suppliers: A to Z, a page at a time. */
export interface SupplierPage {
  suppliers: Supplier[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Mirrors `PurchaseOrderSummaryView` (PUR-02, PUR-05): a purchase as the list shows it. */
export interface PurchaseSummary {
  id: string;
  /** Null for a draft. */
  number: number | null;
  status: PurchaseStatus;
  supplier: { id: string; name: string | null } | null;
  expectedOn: string | null;
  createdAt: string;
  orderedAt: string | null;
  items: number;
  units: UnitQuantity[];
  outstanding: UnitQuantity[];
  total?: string;
  unknownCost?: number;
}

/** GET /purchase-orders: newest first, with what is coming in all. */
export interface PurchasePage {
  purchaseOrders: PurchaseSummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  coming: { units: UnitQuantity[]; purchases: number };
}

/** Mirrors `PurchaseItemView` (PUR-02, Slice 11.10): one item, in its product's unit; costs for managers only. */
export interface PurchaseItem {
  id: string;
  productId: string;
  variantId: string;
  /** Null once the product is deleted for good (PRD-13). */
  productName: string | null;
  optionIds: string[];
  sharedStock: boolean;
  stockUnit: StockUnit | null;
  batchTracked: boolean;
  serialTracked: boolean;
  serialFormat: SerialFormat;
  quantityOrdered: string;
  quantityReceived: string;
  outstanding: string;
  unitCost?: string | null;
  total?: string | null;
}

/** Mirrors `PurchaseReceiptView` (PUR-04, PUR-08): one delivery, as saved. */
export interface PurchaseReceipt {
  id: string;
  receivedAt: string;
  actor: { userId: string; name: string | null } | null;
  note: string | null;
  items: {
    itemId: string;
    accepted: string;
    rejected: string;
    rejectReason: string | null;
    unitCost?: string | null;
    batch: { id: string; batchCode: string | null; expiresOn: string | null } | null;
  }[];
}

/** GET /purchase-orders/:id: one purchase with its items, what names them, and its deliveries. */
export interface Purchase {
  id: string;
  number: number | null;
  status: PurchaseStatus;
  supplier: { id: string; name: string | null } | null;
  expectedOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  orderedAt: string | null;
  closeReason: string | null;
  items: PurchaseItem[];
  products: { productId: string; splits: VariantAttribute[] }[];
  receipts: PurchaseReceipt[];
  total?: string;
  unknownCost?: number;
}

/** Mirrors `PurchaseHistoryView` (PUR-09): one delivery of a variant. */
export interface PurchaseHistoryEntry {
  receiptId: string;
  purchaseOrderId: string;
  number: number | null;
  supplier: { id: string; name: string | null } | null;
  receivedAt: string;
  accepted: string;
  rejected: string;
  rejectReason: string | null;
  unitCost?: string | null;
}

/** GET …/variants/:variantId/purchases: newest first. */
export interface PurchaseHistoryPage {
  purchases: PurchaseHistoryEntry[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
