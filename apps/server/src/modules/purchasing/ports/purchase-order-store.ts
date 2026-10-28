import type {
  PurchaseLinePatch,
  PurchaseOrderPatch,
  StockVariantRow,
  Transaction,
} from '@lytronix/db';
import type { PurchaseStatus, StockUnit } from '@lytronix/validators';
import type {
  NewPurchaseLine,
  PurchaseLineRow,
  PurchaseOrderRow,
  PurchaseOrderSummaryRow,
  PurchaseUnitsRow,
} from '../types/purchasing';

/**
 * PUR-02, PUR-03: a shop's purchases and their items. An item the database refuses (a fraction of a whole-unit product,
 * a size drawing on a shared stock) is a `StockRefused`; a variant or supplier that is not the shop's is a
 * `MissingReference`.
 */
export interface PurchaseOrderStore {
  /** The variants an item may name, with their products, as the stock ledger knows them. */
  findVariants(tx: Transaction, tenantId: string, variantIds: string[]): Promise<StockVariantRow[]>;
  /**
   * INV-01: locks the variant's stock level, as every stock writer does first, so a one-step arrival takes the level
   * before the purchase counter, in the same order as a stock edit.
   */
  lockLevel(tx: Transaction, tenantId: string, variantId: string): Promise<void>;
  /** PUR-03: the next number, gap-free; the counter stays locked until the transaction ends. */
  nextNumber(tx: Transaction, tenantId: string): Promise<number>;
  /** A draft, or (PUR-07) a purchase placed at once with its number. */
  insertOrder(
    tx: Transaction,
    tenantId: string,
    values: Pick<PurchaseOrderRow, 'supplierId' | 'expectedOn' | 'notes'> &
      Partial<Pick<PurchaseOrderRow, 'status' | 'number' | 'orderedAt'>>,
  ): Promise<string>;
  findOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<PurchaseOrderRow | null>;
  updateOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: PurchaseOrderPatch,
  ): Promise<void>;
  deleteOrder(tx: Transaction, tenantId: string, id: string): Promise<void>;
  insertLines(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    lines: NewPurchaseLine[],
  ): Promise<void>;
  updateLine(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: PurchaseLinePatch,
  ): Promise<void>;
  deleteLines(tx: Transaction, tenantId: string, ids: string[]): Promise<void>;
  listLines(tx: Transaction, tenantId: string, orderId: string): Promise<PurchaseLineRow[]>;
  listOrders(
    tx: Transaction,
    tenantId: string,
    filter: { statuses: PurchaseStatus[] | null; supplierId: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: PurchaseOrderSummaryRow[]; total: number }>;
  /** PUR-05: what each of these purchases orders, and still awaits, unit by unit. */
  unitsOf(tx: Transaction, tenantId: string, orderIds: string[]): Promise<PurchaseUnitsRow[]>;
  /** PUR-05: what the shop's placed, open purchases still await, unit by unit, and from how many purchases. */
  coming(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ units: { stockUnit: StockUnit | null; quantity: string }[]; purchases: number }>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
