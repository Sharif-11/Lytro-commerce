import type {
  NewStockMovement,
  OutgoingRow,
  SelectStockMovement,
  StockCheckLineRow,
  StockCheckRow,
  StockCheckSummaryRow,
  StockHistoryRow,
  StockValueRow,
  StockVariantRow,
  VariantStockRow,
} from '@lytronix/db';
import type { StockReason, StockState, StockTracking, StockUnit } from '@lytronix/validators';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type MovementRecord = SelectStockMovement;
export type {
  NewStockMovement,
  OutgoingRow,
  StockCheckLineRow,
  StockCheckRow,
  StockCheckSummaryRow,
  StockHistoryRow,
  StockValueRow,
  StockVariantRow,
  VariantStockRow,
};

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
  /** Null for a variant drawing on a shared stock, which holds none of its own (INV-24). */
  onHand: string | null;
  reserved: string | null;
  /** For a variant drawing on a shared stock, the whole packs of it the shared stock makes (INV-24). */
  available: string;
  /** INV-24: how much of the shared stock one unit sold uses; null unless the product shares its stock. */
  packAmount: string | null;
  state: StockState;
  /** INV-10, D3-9: present only for a caller who may see cost; for a pack, its share of the shared stock's cost. */
  avgCost?: string | null;
}

/** INV-24: a product's shared stock, held by its stock-holder variant, in the product's unit. */
export interface SharedStockView {
  /** The stock holder: the id the stock, cost, history, addition and stock check routes take. */
  variantId: string;
  onHand: string;
  reserved: string;
  available: string;
  state: StockState;
  /** INV-10, D3-9: per unit of the stock, present only for a caller who may see cost. */
  avgCost?: string | null;
}

export interface ProductStockView {
  productId: string;
  stockTracking: StockTracking;
  stockUnit: StockUnit;
  lowStockThreshold: string;
  /** CCH-08: the product's public stock state, its best variant's. */
  state: StockState;
  /** INV-24: the stock the variants share; null for a product whose variants hold their own. */
  shared: SharedStockView | null;
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
  actor: StockActorView | null;
  createdAt: Date;
}

export interface StockHistoryPage {
  movements: StockMovementView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Who made a stock change or check, by name; null where no person did. */
export interface StockActorView {
  userId: string;
  name: string | null;
}

/** INV-07: one counted variant. Cost and value are present only for a caller who may see cost (D3-9). */
export interface StockCheckLineView {
  productId: string;
  variantId: string;
  /** Null where the product has since been deleted for good (PRD-13). */
  productName: string | null;
  optionIds: string[];
  expected: string;
  counted: string;
  difference: string;
  unitCost?: string | null;
  /** The difference at that cost, to the paisa; null when the cost was unknown. */
  value?: string | null;
}

/** INV-07: how much was counted and changed, and (with cost) the value gained and lost. */
export interface StockCheckTotals {
  lines: number;
  changed: number;
  valueGained?: string;
  valueLost?: string;
  /** Changed lines whose cost was unknown, so their value is not in the totals. */
  unknownCost?: number;
}

export interface StockCheckView {
  id: string;
  note: string | null;
  actor: StockActorView | null;
  createdAt: Date;
  totals: StockCheckTotals;
  lines: StockCheckLineView[];
}

export interface StockCheckSummary {
  id: string;
  note: string | null;
  actor: StockActorView | null;
  createdAt: Date;
  totals: StockCheckTotals;
}

export interface StockCheckPage {
  checks: StockCheckSummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** INV-18: a value at average or recorded cost, with how many movements or variants had no cost to count. */
export interface ValuedFigure {
  value: string;
  unknownCost: number;
}

export interface MovedFigure extends ValuedFigure {
  movements: number;
}

export interface InventoryFigures {
  /** The period, whole Asia/Dhaka days, both ends included. */
  dateFrom: string;
  dateTo: string;
  /** What the stock held now is worth, whatever the period. */
  stockValue: ValuedFigure;
  costOfGoodsSold: MovedFigure;
  /** Every outgoing movement that was not a sale, together and by reason. */
  losses: MovedFigure & { byReason: (MovedFigure & { reason: StockReason })[] };
}
