import { Inject, Injectable } from '@nestjs/common';
import {
  OrderRepository,
  StockRepository,
  TransactionRunner,
  type InsertOrder,
  type NewOrderCall,
  type NewOrderHistory,
  type OrderLinePatch,
  type OrderListFilter,
  type OrderPatch,
  type StockVariantRow,
  type Transaction,
} from '@lytronix/db';
import { OrderKept } from '../../common/errors/order-kept';
import type { OrderStore } from '../../modules/orders/ports/order-store';
import type {
  NewOrderLine,
  OrderCallRecord,
  OrderHistoryRecord,
  OrderLineRecord,
  OrderRecord,
  OrderSummaryRow,
  UnnumberedOrder,
} from '../../modules/orders/types/orders';
import { DatabaseService } from '../database.service';

// ORD-12: what the order guard refuses (migration 0083).
const ORDER_KEPT_CHECK = 'orders_kept';

@Injectable()
export class DrizzleOrderStore implements OrderStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(OrderRepository) private readonly orders: OrderRepository,
    @Inject(StockRepository) private readonly stock: StockRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  findVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<StockVariantRow[]> {
    return this.stock.findVariants(tx, tenantId, variantIds);
  }

  nextNumber(tx: Transaction, tenantId: string, day: string): Promise<number> {
    return this.orders.nextNumber(tx, tenantId, day);
  }

  insertOrder(tx: Transaction, values: InsertOrder): Promise<UnnumberedOrder | null> {
    return this.orders.insertOrder(tx, values);
  }

  numberOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    orderNumber: string,
  ): Promise<OrderRecord> {
    return this.orders.numberOrder(tx, tenantId, id, orderNumber);
  }

  findOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<OrderRecord | null> {
    return this.orders.findOrder(tx, tenantId, id, lock);
  }

  updateOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: OrderPatch,
  ): Promise<OrderRecord> {
    return this.orders.updateOrder(tx, tenantId, id, patch);
  }

  async deleteOrder(tx: Transaction, tenantId: string, id: string): Promise<void> {
    try {
      await this.orders.deleteOrder(tx, tenantId, id);
    } catch (error) {
      if (this.transactions.isCheckViolation(error, ORDER_KEPT_CHECK)) throw new OrderKept();
      throw error;
    }
  }

  insertLines(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    rows: NewOrderLine[],
  ): Promise<OrderLineRecord[]> {
    return this.orders.insertLines(tx, tenantId, orderId, rows);
  }

  updateLine(tx: Transaction, tenantId: string, id: string, patch: OrderLinePatch): Promise<void> {
    return this.orders.updateLine(tx, tenantId, id, patch);
  }

  deleteLines(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    return this.orders.deleteLines(tx, tenantId, ids);
  }

  listLines(tx: Transaction, tenantId: string, orderIds: string[]): Promise<OrderLineRecord[]> {
    return this.orders.listLines(tx, tenantId, orderIds);
  }

  insertHistory(tx: Transaction, tenantId: string, rows: NewOrderHistory[]): Promise<void> {
    return this.orders.insertHistory(tx, tenantId, rows);
  }

  listHistory(tx: Transaction, tenantId: string, orderId: string): Promise<OrderHistoryRecord[]> {
    return this.orders.listHistory(tx, tenantId, orderId);
  }

  insertCall(tx: Transaction, tenantId: string, values: NewOrderCall): Promise<OrderCallRecord> {
    return this.orders.insertCall(tx, tenantId, values);
  }

  listCalls(tx: Transaction, tenantId: string, orderId: string): Promise<OrderCallRecord[]> {
    return this.orders.listCalls(tx, tenantId, orderId);
  }

  listOrders(
    tx: Transaction,
    tenantId: string,
    filter: OrderListFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: OrderSummaryRow[]; total: number }> {
    return this.orders.listOrders(tx, tenantId, filter, page);
  }

  listForExport(
    tx: Transaction,
    tenantId: string,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<OrderRecord[]> {
    return this.orders.listForExport(tx, tenantId, after, limit);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.orders.deleteAllForTenant(tx, tenantId);
  }
}
