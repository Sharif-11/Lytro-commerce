import type {
  NewReservation,
  NewSerial,
  NewStockBatch,
  NewStockMovement,
  SelectSerialNumber,
  SelectStockReservation,
  ReferencedMovementRow,
  ReturnedRow,
  ShortfallRow,
  OutgoingRow,
  SelectStockBatch,
  StockBatchListRow,
  SelectStockMovement,
  StockCheckLineRow,
  StockCheckRow,
  StockCheckSummaryRow,
  StockHistoryRow,
  StockValueRow,
  StockVariantRow,
  VariantStockRow,
} from '@lytronix/db';
import type {
  BatchState,
  SerialStatus,
  StockReason,
  StockState,
  StockTracking,
  StockUnit,
} from '@lytronix/validators';
import type { VariantAttributeView } from '../../catalogue/types/catalogue';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type MovementRecord = SelectStockMovement;
export type StockBatchRecord = SelectStockBatch;
export type SerialRecord = SelectSerialNumber;
export type ReservationRecord = SelectStockReservation;
export type {
  NewReservation,
  NewSerial,
  NewStockBatch,
  NewStockMovement,
  OutgoingRow,
  ReferencedMovementRow,
  ReturnedRow,
  ShortfallRow,
  StockBatchListRow,
  StockCheckLineRow,
  StockCheckRow,
  StockCheckSummaryRow,
  StockHistoryRow,
  StockValueRow,
  StockVariantRow,
  VariantStockRow,
};

/** UOM-01: an amount of stock in one unit -- 12 pieces, 240.500 kg. */
export interface UnitQuantity {
  unit: StockUnit;
  quantity: string;
}

/** INV-12: a new batch arriving: an optional lot code and expiry date (its last sellable day, YYYY-MM-DD). */
export interface BatchDescription {
  batchCode?: string;
  expiresOn?: string;
}

/**
 * One change to on-hand stock, as the ledger records it (INV-03). `delta` is signed, in the product's unit. On a
 * batch-tracked product (INV-12) it may name the batch it moves (`batchId`), or, rising, describe a new one; with
 * neither, a rise goes into the variant's "no expiry" batch and a fall leaves in the picking order.
 */
export interface StockChange {
  variantId: string;
  delta: string;
  reason: StockReason;
  note?: string | null;
  reference?: { type: string; id: string } | null;
  batchId?: string | null;
  batch?: BatchDescription | null;
  /**
   * INV-14: on a serial-numbered product, the serials (as stored) of the units arriving, at most one each, or of the
   * units leaving; a fall naming fewer takes units with no serial yet for the rest.
   */
  serials?: string[] | null;
  /**
   * INV-10, PUR-04: on a purchase receipt, what each arriving unit cost, per unit of the stock it lands in (four
   * decimals); the database takes it into the average cost. Null or left out when not known. INV-17: on a return, and
   * on the write-off of a damaged one, what the unit cost when it was sold. Left out on any other fall: the average
   * cost of the moment (INV-11).
   */
  unitCost?: string | null;
  /** INV-14: on a sale, the order its units went to; the serials leaving with it are sold to that order. */
  orderId?: string | null;
}

/**
 * INV-15: one order line to hold stock for. `quantity` is what was ordered, in the product's unit, or for a size
 * drawing on a shared stock, in whole packs (INV-24).
 */
export interface ReservationLine {
  orderLineId: string;
  variantId: string;
  quantity: string;
}

/** INV-15, INV-16: an order's lines to hold stock for; one awaiting online payment holds it only for a while. */
export interface ReservationRequest {
  orderId: string;
  awaitingPayment: boolean;
  lines: ReservationLine[];
}

/** INV-15, INV-14: one reservation shipping whole, with the serial of each unit on a serial-numbered product. */
export interface Shipment {
  reservationId: string;
  serials?: string[] | null;
}

/**
 * INV-17: units of a shipped reservation coming back, in what was ordered (whole packs for a size drawing on a shared
 * stock), each marked sellable or damaged by the shop.
 */
export interface StockReturn {
  reservationId: string;
  sellable: string;
  damaged: string;
  /** INV-12: the batch they come back into, one the shipment took from; left out, the one expiring soonest first. */
  batchId?: string | null;
  /** INV-14: on a serial-numbered product, the serial (as stored) of every unit coming back, as it is marked. */
  serials?: { sellable: string[]; damaged: string[] } | null;
}

/** INV-13, INV-15: expiry has left units held for orders with nothing sellable under them. */
export interface HeldStockExpiredNotice {
  tenantId: string;
  productId: string;
  productName: string;
  variantId: string;
  reserved: string;
  /** How many of the held units are expired, with nothing sellable to ship in their place. */
  short: string;
}

/** INV-14: one serial-numbered unit, as the shop sees it. */
export interface SerialView {
  id: string;
  variantId: string;
  serial: string;
  status: SerialStatus;
  receivedMovementId: number | null;
  leftMovementId: number | null;
  createdAt: Date;
}

export interface SerialPage {
  serials: SerialView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** INV-13: one batch about to expire. */
export interface BatchExpiryNotice {
  tenantId: string;
  productId: string;
  productName: string;
  variantId: string;
  batchId: string;
  batchCode: string | null;
  expiresOn: string;
  quantity: string;
}

/** INV-12, INV-13: one open batch, as the shop sees it. */
export interface BatchView {
  id: string;
  variantId: string;
  /** The options naming its variant; none for a product's default variant or its shared stock. */
  optionIds: string[];
  batchCode: string | null;
  expiresOn: string | null;
  /** INV-22: the variant's batch for stock with no code and no expiry. */
  noExpiry: boolean;
  quantity: string;
  receivedAt: Date;
  state: BatchState;
}

export interface ProductBatchesView {
  productId: string;
  batches: BatchView[];
}

export interface ShopBatchView extends BatchView {
  productId: string;
  productName: string;
}

export interface ShopBatchPage {
  batches: ShopBatchView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
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
  /** INV-13: stock in expired batches, held but never sold until written off; null like onHand. */
  unsellable: string | null;
  /**
   * INV-13, INV-15: units held for orders that expiry left with nothing sellable under them, so those orders cannot
   * ship as they are; zero when none, null like onHand.
   */
  reservedExpired: string | null;
  /** For a variant drawing on a shared stock, the whole packs of it the shared stock makes (INV-24). */
  available: string;
  /** INV-14: on a serial-numbered product, how many units held have no serial yet; null otherwise. */
  missingSerials: number | null;
  /**
   * PUR-05: ordered and not yet received on placed, open purchases; never part of what is available. Null for a variant
   * drawing on a shared stock, which is bought by the shared stock.
   */
  incoming: string | null;
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
  unsellable: string;
  /** INV-13, INV-15: units held for orders that expiry left with nothing sellable under them. */
  reservedExpired: string;
  available: string;
  /** PUR-05: ordered and not yet received on placed, open purchases, in the product's unit. */
  incoming: string;
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

/**
 * The Stock page's product (Slice 11.9): its stock, its name and whether it is on sale, and its variant-defining
 * attributes as its edit screen names them; each variant's option ids follow their order.
 */
export interface StockPageProductView extends ProductStockView {
  name: string;
  active: boolean;
  splits: VariantAttributeView[];
}

/** The Stock page (Slice 11.9): a page of products, out and low first, with All, Low and Out counted (INV-08). */
export interface StockPageView {
  products: StockPageProductView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  counts: { all: number; low: number; out: number };
}

export interface StockMovementView {
  id: number;
  delta: string;
  onHandAfter: string;
  reason: StockReason;
  /** INV-11, D3-9: present only for a caller who may see cost; null is unknown. */
  unitCost?: string | null;
  reference: { type: string; id: string } | null;
  /** INV-12: the batch it moved, on a batch-tracked product. */
  batch: MovedBatchView | null;
  /** INV-14: the serials of the units it brought in or took out. */
  serials: string[];
  note: string | null;
  actor: StockActorView | null;
  createdAt: Date;
}

/** INV-12: a batch named on a movement or a counted line. */
export interface MovedBatchView {
  id: string;
  batchCode: string | null;
  expiresOn: string | null;
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
  /** INV-12: the batch counted; null for a variant counted as a whole. */
  batch: MovedBatchView | null;
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
  /** The shop's own number for it (#12). */
  number: number;
  note: string | null;
  actor: StockActorView | null;
  createdAt: Date;
  totals: StockCheckTotals;
  lines: StockCheckLineView[];
  /** Each counted product's variant-defining attributes, so a line is named as its product's screen names it. */
  products: { productId: string; splits: VariantAttributeView[] }[];
}

export interface StockCheckSummary {
  id: string;
  number: number;
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

/** D3-9: stock held of one top-level category (null: products in none), its worth and its amounts by unit. */
export interface CategoryStockValue extends ValuedFigure {
  categoryId: string | null;
  name: string | null;
  units: UnitQuantity[];
}

export interface InventoryFigures {
  /** The period, whole Asia/Dhaka days, both ends included. */
  dateFrom: string;
  dateTo: string;
  /**
   * What the stock held now is worth, whatever the period, with its amounts by unit and the same split by each
   * product's top-level category -- the parts add up to the whole, to the paisa.
   */
  stockValue: ValuedFigure & { units: UnitQuantity[]; byCategory: CategoryStockValue[] };
  costOfGoodsSold: MovedFigure;
  /** Every outgoing movement that was not a sale, together and by reason, each reason with the amounts it took. */
  losses: MovedFigure & {
    byReason: (MovedFigure & { reason: StockReason; units: UnitQuantity[] })[];
  };
}
