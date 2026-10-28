import type { BatchState, SerialStatus, StockReason } from '@lytronix/validators';

/**
 * Mirrors `StockMovementView` in apps/server/src/modules/inventory/types/inventory.ts (INV-09): one change to a
 * variant's stock, with what it left on hand.
 */
export interface StockMovement {
  id: number;
  delta: string;
  onHandAfter: string;
  reason: StockReason;
  note: string | null;
  actor: { userId: string; name: string | null } | null;
  createdAt: string;
}

/** GET /products/:id/variants/:variantId/stock-history: a page, newest first. */
export interface StockHistoryPage {
  movements: StockMovement[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Mirrors `BatchView` (INV-12, INV-13): one open batch of a product. */
export interface StockBatch {
  id: string;
  variantId: string;
  /** The options naming its variant; none for a product's default variant or its shared stock. */
  optionIds: string[];
  batchCode: string | null;
  expiresOn: string | null;
  /** INV-22: the variant's batch for stock with no code and no expiry. */
  noExpiry: boolean;
  quantity: string;
  state: BatchState;
}

/** GET /products/:id/batches: the batches holding stock, in picking order. */
export interface ProductBatches {
  productId: string;
  batches: StockBatch[];
}

/** Mirrors `SerialView` (INV-14): one unit's serial. */
export interface SerialUnit {
  id: string;
  variantId: string;
  serial: string;
  status: SerialStatus;
}

/** GET /products/:id/variants/:variantId/serials: a page of a variant's serials. */
export interface SerialPage {
  serials: SerialUnit[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
