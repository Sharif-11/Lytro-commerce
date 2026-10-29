import type {
  InsertOrder,
  NewOrderCall,
  NewOrderHistory,
  OrderLinePatch,
  OrderListFilter,
  OrderPatch,
  StockVariantRow,
  Transaction,
} from '@lytronix/db';
import type {
  NewOrderLine,
  OrderCallRecord,
  OrderHistoryRecord,
  OrderLineRecord,
  OrderRecord,
  OrderSummaryRow,
  UnnumberedOrder,
} from '../types/orders';

/**
 * ORD-01 to ORD-14, ORD-51: a shop's orders, their items, history and calls. Deleting an order that shipped or was paid
 * is refused by the database as an `OrderKept`; an order's number, tracking ID and source never change.
 */
export interface OrderStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** The variants an item may name, with their products, as the stock ledger knows them. */
  findVariants(tx: Transaction, tenantId: string, variantIds: string[]): Promise<StockVariantRow[]>;
  /** ORD-04: the day's next number, gap-free; the day's counter stays locked until the transaction ends. */
  nextNumber(tx: Transaction, tenantId: string, day: string): Promise<number>;
  /** ORD-05: the order, not yet numbered, or null when its tracking ID is taken. */
  insertOrder(tx: Transaction, values: InsertOrder): Promise<UnnumberedOrder | null>;
  /** ORD-04: gives the new order its number, once. */
  numberOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    orderNumber: string,
  ): Promise<OrderRecord>;
  findOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<OrderRecord | null>;
  /** ORD-17: the shop's order with this tracking ID. */
  findByTrackingId(
    tx: Transaction,
    tenantId: string,
    trackingId: string,
  ): Promise<OrderRecord | null>;
  updateOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: OrderPatch,
  ): Promise<OrderRecord>;
  deleteOrder(tx: Transaction, tenantId: string, id: string): Promise<void>;
  insertLines(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    rows: NewOrderLine[],
  ): Promise<OrderLineRecord[]>;
  updateLine(tx: Transaction, tenantId: string, id: string, patch: OrderLinePatch): Promise<void>;
  deleteLines(tx: Transaction, tenantId: string, ids: string[]): Promise<void>;
  listLines(tx: Transaction, tenantId: string, orderIds: string[]): Promise<OrderLineRecord[]>;
  insertHistory(tx: Transaction, tenantId: string, rows: NewOrderHistory[]): Promise<void>;
  listHistory(tx: Transaction, tenantId: string, orderId: string): Promise<OrderHistoryRecord[]>;
  insertCall(tx: Transaction, tenantId: string, values: NewOrderCall): Promise<OrderCallRecord>;
  listCalls(tx: Transaction, tenantId: string, orderId: string): Promise<OrderCallRecord[]>;
  listOrders(
    tx: Transaction,
    tenantId: string,
    filter: OrderListFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: OrderSummaryRow[]; total: number }>;
  listForExport(
    tx: Transaction,
    tenantId: string,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<OrderRecord[]>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
