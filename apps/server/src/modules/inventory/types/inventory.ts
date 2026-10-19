import type {
  NewStockMovement,
  SelectStockMovement,
  StockHistoryRow,
  StockVariantRow,
  VariantStockRow,
} from '@lytronix/db';
import type { StockReason, StockState, StockTracking, StockUnit } from '@lytronix/validators';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type MovementRecord = SelectStockMovement;
export type { NewStockMovement, StockHistoryRow, StockVariantRow, VariantStockRow };

/** One change to on-hand stock, as the ledger records it (INV-03). `delta` is signed, in the product's unit. */
export interface StockChange {
  variantId: string;
  delta: string;
  reason: StockReason;
  note?: string | null;
  reference?: { type: string; id: string } | null;
}

/** INV-08: one variant's stock falling to or below its product's threshold. */
export interface LowStockNotice {
  tenantId: string;
  productId: string;
  productName: string;
  variantId: string;
  available: string;
  threshold: string;
}

export interface VariantStockView {
  variantId: string;
  /** The options naming it, from its combination; none for a product's one default variant. */
  optionIds: string[];
  sku: string | null;
  /** Retired from the product (ATR-11) but still holding stock: shown, never sold. */
  retired: boolean;
  onHand: string;
  reserved: string;
  available: string;
  state: StockState;
  /** INV-10, D3-9: present only for a caller who may see cost. */
  avgCost?: string | null;
}

export interface ProductStockView {
  productId: string;
  stockTracking: StockTracking;
  stockUnit: StockUnit;
  lowStockThreshold: string;
  /** CCH-08: the product's public stock state, its best variant's. */
  state: StockState;
  variants: VariantStockView[];
}

export interface StockMovementView {
  id: number;
  delta: string;
  onHandAfter: string;
  reason: StockReason;
  /** INV-11, D3-9: present only for a caller who may see cost; null is unknown. */
  unitCost?: string | null;
  reference: { type: string; id: string } | null;
  note: string | null;
  actor: { userId: string; name: string | null } | null;
  createdAt: Date;
}

export interface StockHistoryPage {
  movements: StockMovementView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
