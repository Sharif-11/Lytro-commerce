import type { OrderSource } from '@lytronix/validators';

/** ORD-20: a shopper's order, as the shop's staff are told of it. */
export interface PlacedOrderNotice {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  source: OrderSource;
  customerName: string | null;
  grandTotal: string;
  /**
   * ORD-20 as amended (PYG-23, PF-28): a locked order's notice names no one -- the district it goes to and what opening
   * it costs; null for an order the shop can already see.
   */
  locked?: { district: { bn: string; en: string } | null; fee: string } | null;
  /** INV-25 (ORDERS-BEYOND-STOCK OB-10): it arrived short of stock, so the notice says so. */
  short?: boolean;
}

/**
 * ORD-20, D4-10: tells the shop's staff with orders:read of an order a shopper placed -- never of one staff entered.
 * Phase 7 delivers it in-app and by push (NTF-01, NTF-03), and by SMS as the shop's event settings say.
 */
export interface OrderNotifier {
  orderPlaced(notice: PlacedOrderNotice): Promise<void>;
}
