import type { Transaction } from '@lytronix/db';

/** INV-25 (ORDERS-BEYOND-STOCK OB-10): one stock change's fill -- the orders it gave stock to, and those now covered. */
export interface OrdersFilledNotice {
  tenantId: string;
  /** Every order the fill gave stock to, oldest first. */
  orderIds: string[];
  /** Those of them that now wait for nothing, so can be booked or shipped. */
  coveredIds: string[];
}

/**
 * OB-10 (the owner on #448, 2026-11-25): tells the shop's people, once per stock change, that waiting orders got stock --
 * in the fill's own transaction, so the notice commits with the fill or not at all.
 */
export interface FillNotifier {
  ordersFilled(tx: Transaction, notice: OrdersFilledNotice): Promise<void>;
}
