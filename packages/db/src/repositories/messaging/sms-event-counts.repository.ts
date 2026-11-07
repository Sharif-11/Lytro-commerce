import { and, eq, gte, ne, sql } from 'drizzle-orm';
import {
  FulfilmentType,
  OrderSource,
  PaymentMethod,
  VerificationLevel,
} from '@lytronix/validators';
import { orderPayments, orders } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/**
 * SMS-12 (Slice 7.2): how often each SMS event would have gone out since a time, from the shop's own orders: the
 * shopper's events count delivery orders only, the new-order alert the orders that came from outside, and the payment
 * events the advances paid (cash on delivery has no SMS of its own; staff check the ones verified by hand).
 */
export interface SmsEventCounts {
  /** Whether the shop has made any order at all, ever. */
  anyOrder: boolean;
  placed: number;
  fromOutside: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  paid: number;
  checkedByHand: number;
}

export class SmsEventCountsRepository {
  constructor(private readonly transactions: Pick<TransactionRunner, 'setTenantContext'>) {}

  async since(tx: Transaction, tenantId: string, since: Date): Promise<SmsEventCounts> {
    await this.transactions.setTenantContext(tx, tenantId);
    const delivery = sql`${orders.fulfilmentType} = ${FulfilmentType.Delivery}`;
    const [order] = await tx
      .select({
        any: sql<boolean>`count(*) > 0`,
        placed: sql<string>`count(*) filter (where ${delivery} and ${orders.createdAt} >= ${since})`,
        fromOutside: sql<string>`count(*) filter (where ${orders.source} <> ${OrderSource.Dashboard} and ${orders.createdAt} >= ${since})`,
        shipped: sql<string>`count(*) filter (where ${delivery} and ${orders.shippedAt} >= ${since})`,
        delivered: sql<string>`count(*) filter (where ${delivery} and ${orders.deliveredAt} >= ${since})`,
        cancelled: sql<string>`count(*) filter (where ${delivery} and ${orders.cancelledAt} >= ${since})`,
      })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));
    const [payment] = await tx
      .select({
        paid: sql<string>`count(*)`,
        checkedByHand: sql<string>`count(*) filter (where ${orderPayments.verificationLevel} = ${VerificationLevel.Manual})`,
      })
      .from(orderPayments)
      .innerJoin(orders, eq(orders.id, orderPayments.orderId))
      .where(
        and(
          eq(orderPayments.tenantId, tenantId),
          eq(orders.fulfilmentType, FulfilmentType.Delivery),
          ne(orderPayments.method, PaymentMethod.CashOnDelivery),
          gte(orderPayments.verifiedAt, since),
        ),
      );
    return {
      anyOrder: order?.any ?? false,
      placed: Number(order?.placed ?? 0),
      fromOutside: Number(order?.fromOutside ?? 0),
      shipped: Number(order?.shipped ?? 0),
      delivered: Number(order?.delivered ?? 0),
      cancelled: Number(order?.cancelled ?? 0),
      paid: Number(payment?.paid ?? 0),
      checkedByHand: Number(payment?.checkedByHand ?? 0),
    };
  }
}
