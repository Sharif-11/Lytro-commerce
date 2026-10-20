import type { Transaction } from '@lytronix/db';
import type {
  NewReceiptLine,
  PurchaseHistoryRow,
  PurchaseReceiptLineRow,
  PurchaseReceiptRow,
} from '../types/purchasing';

/**
 * PUR-04, PUR-08, PUR-09: the deliveries received against a shop's purchases. A receipt is only ever inserted. A
 * delivery the database refuses (more than is still to come, a purchase not placed and open) is a `PurchaseRefused`.
 */
export interface PurchaseReceiptStore {
  insertReceipt(
    tx: Transaction,
    tenantId: string,
    values: { purchaseOrderId: string; actorUserId: string | null; note: string | null },
  ): Promise<string>;
  insertLines(
    tx: Transaction,
    tenantId: string,
    receiptId: string,
    lines: NewReceiptLine[],
  ): Promise<void>;
  countForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<number>;
  listForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<{ receipts: PurchaseReceiptRow[]; lines: PurchaseReceiptLineRow[] }>;
  historyForVariant(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: PurchaseHistoryRow[]; total: number }>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
