import type { BatchState, SerialFormat, SerialStatus, StockReason } from '@lytronix/validators';
import type { ProductStock } from './attribute';
import type { VariantAttribute } from './product';

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

/**
 * Mirrors `stockPageSchema` (Slice 11.9): a product as the Stock page shows it -- its stock, its name, whether it is on
 * sale, how it keeps its stock, and its variant-defining attributes; its variants come in its own order.
 */
export interface StockPageProduct extends ProductStock {
  name: string;
  active: boolean;
  batchTracked: boolean;
  serialTracked: boolean;
  serialFormat: SerialFormat;
  splits: VariantAttribute[];
}

/** GET /inventory/stock: a page of products, out and low first, with All, Low and Out counted (INV-08). */
export interface StockPage {
  products: StockPageProduct[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  counts: { all: number; low: number; out: number };
}

/** INV-18: one figure, to the paisa, with how many movements made it and how many had no cost. */
export interface MovedFigure {
  value: string;
  movements: number;
  unknownCost: number;
}

/** Mirrors `inventoryFiguresSchema` as far as the Stock page's figures read it (INV-18, D3-9). */
export interface InventoryFigures {
  dateFrom: string;
  dateTo: string;
  stockValue: { value: string; unknownCost: number };
  costOfGoodsSold: MovedFigure;
  losses: MovedFigure & { byReason: (MovedFigure & { reason: StockReason })[] };
}

/** GET /batches: a page of the shop's batches expiring or expired, as far as its count is read. */
export interface BatchCount {
  total: number;
}
