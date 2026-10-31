import type {
  ComboPartStockRow,
  InsertOrder,
  InsertOrderLineComponent,
  SelectOrderLineComponent,
  NewOrderCall,
  NewOrderHistory,
  NewOrderPayment,
  OrderHomeCounts,
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
  OrderPaymentRecord,
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
  /** QTA-01, QTA-05: the shop's handling, counted one order at a time until the transaction ends. */
  lockHandling(tx: Transaction, tenantId: string): Promise<void>;
  /** QTA-01, QTA-04, QTA-05: the shop's orders handled at or after `since`, or ever when it is null. */
  countHandled(tx: Transaction, tenantId: string, since: Date | null): Promise<number>;
  /**
   * ORD-15, ORD-22: money recorded for an order, verified as it is recorded. A transaction ID on another live payment of
   * the shop is a `UniqueViolation('transactionId')`.
   */
  insertPayment(
    tx: Transaction,
    tenantId: string,
    values: NewOrderPayment,
  ): Promise<OrderPaymentRecord>;
  listPayments(tx: Transaction, tenantId: string, orderId: string): Promise<OrderPaymentRecord[]>;
  /** Slice 4.3b: one of the order's payments, held until the transaction ends. */
  lockPayment(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    paymentId: string,
  ): Promise<OrderPaymentRecord | null>;
  /** Agreed 2026-10-30: a payment recorded by mistake, voided with its reason. */
  voidPayment(
    tx: Transaction,
    tenantId: string,
    paymentId: string,
    values: { voidedBy: string | null; voidReason: string },
  ): Promise<OrderPaymentRecord>;
  /** PAY-20, ORD-44 (Slice 5.3): a payment marked refunded with a note. */
  refundPayment(
    tx: Transaction,
    tenantId: string,
    paymentId: string,
    values: { refundedBy: string | null; refundNote: string },
  ): Promise<OrderPaymentRecord>;
  /** ORD-15: how the shop's order payments carry a transaction ID -- on a live one, only on voided ones, or none. */
  transactionUse(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<'live' | 'voided' | 'none'>;
  /**
   * ORD-15: registers a transaction ID platform-wide for the shop unless it is already registered; `claimed` when this
   * call registered it, else the shop that holds it.
   */
  claimTransactionId(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<{ claimed: boolean; tenantId: string }>;
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
  /** ORD-18 (Slice 4.4b): a page of the shop's orders carrying this phone, newest first. */
  listForPhone(
    tx: Transaction,
    tenantId: string,
    phone: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: OrderRecord[]; total: number }>;
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
  /** CMB-03, CMB-04: a combo line's components as ordered, written with the line. */
  insertComponents(
    tx: Transaction,
    tenantId: string,
    rows: Omit<InsertOrderLineComponent, 'tenantId'>[],
  ): Promise<void>;
  listComponents(
    tx: Transaction,
    tenantId: string,
    orderLineIds: string[],
  ): Promise<SelectOrderLineComponent[]>;
  /** CMB-02, CMB-03, CMB-07: every allowed variant of these combos' parts, with its stock and weight. */
  listComboPartStock(
    tx: Transaction,
    tenantId: string,
    comboIds: string[],
  ): Promise<ComboPartStockRow[]>;
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
  /** ORD-09 (Slice 4.8a): the couriers the shop has shipped with, the most recently used first. */
  recentCouriers(tx: Transaction, tenantId: string, limit: number): Promise<string[]>;
  /** Slice 4.8b: Home's order figures. */
  homeCounts(
    tx: Transaction,
    tenantId: string,
    at: { now: Date; todayStart: Date; yesterdayStart: Date },
  ): Promise<OrderHomeCounts>;
  listForExport(
    tx: Transaction,
    tenantId: string,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<OrderRecord[]>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
