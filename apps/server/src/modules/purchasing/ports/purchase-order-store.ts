import type {
  PurchaseLinePatch,
  PurchaseOrderPatch,
  StockVariantRow,
  Transaction,
} from '@lytronix/db';
import type { PurchaseStatus } from '@lytronix/validators';
import type {
  NewPurchaseLine,
  PurchaseLineRow,
  PurchaseOrderRow,
  PurchaseOrderSummaryRow,
} from '../types/purchasing';

/**
 * PUR-02, PUR-03: a shop's purchases and their items. An item the database refuses (a fraction of a whole-unit product,
 * a size drawing on a shared stock) is a `StockRefused`; a variant or supplier that is not the shop's is a
 * `MissingReference`.
 */
export interface PurchaseOrderStore {
  /** The variants an item may name, with their products, as the stock ledger knows them. */
  findVariants(tx: Transaction, tenantId: string, variantIds: string[]): Promise<StockVariantRow[]>;
  /** PUR-03: the next number, gap-free; the counter stays locked until the transaction ends. */
  nextNumber(tx: Transaction, tenantId: string): Promise<number>;
  insertOrder(
    tx: Transaction,
    tenantId: string,
    values: Pick<PurchaseOrderRow, 'supplierId' | 'expectedOn' | 'notes'>,
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
    filter: { status: PurchaseStatus | null; supplierId: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: PurchaseOrderSummaryRow[]; total: number }>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
