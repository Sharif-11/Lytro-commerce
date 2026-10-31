import { Inject, Injectable } from '@nestjs/common';
import type { NewOrderHistory, Transaction } from '@lytronix/db';
import {
  AuditAction,
  PaymentMethod,
  type OrderPaymentInput,
  type RefundPaymentInput,
  type VoidPaymentInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';
import type { OrderRecord, OrderView } from '../types/orders';
import { OrderService } from './order.service';
import { PaymentRecorder, paymentEntryOf, paymentWords } from './payment-recorder';

/**
 * ORD-15, ORD-43 (Phase 4 Slice 4.3b, read agreed 2026-10-30): payments staff record on an order, and voiding one
 * recorded by mistake. A voided payment stays in the order's payments, marked void with who voided it, when and why;
 * it no longer counts, so what is due goes back up. The cash on delivery collected when an order was delivered or handed
 * over is never voided: it is what Delivered means (agreed 2026-10-30). Since Phase 5 (Slice 5.3) a payment may be marked
 * refunded, a record only (PAY-20): it stops counting as a void does, and the order shows refunded once every payment
 * is (ORD-44).
 */
@Injectable()
export class OrderPayments {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(PaymentRecorder) private readonly recorder: PaymentRecorder,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** ORD-15: money staff received for an order, verified as it is recorded; what is due comes down by it. */
  async record(
    tenantId: string,
    orderId: string,
    input: OrderPaymentInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId);
      const updated = await this.recorder.recordWithin(
        tx,
        tenantId,
        order,
        paymentEntryOf(input),
        who,
      );
      return this.orders.viewWithin(tx, tenantId, updated, []);
    });
  }

  /** Agreed 2026-10-30: a payment recorded by mistake, voided with its reason; what is due goes back up. */
  async void(
    tenantId: string,
    orderId: string,
    paymentId: string,
    input: VoidPaymentInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId);
      const payment = await this.store.lockPayment(tx, tenantId, order.id, paymentId);
      if (!payment) throw new ApiError('not_found', 'OrderPaymentNotFound', {});
      if (payment.voidedAt !== null) throw new ApiError('conflict', 'PaymentAlreadyVoided', {});
      // Slice 5.3: a refunded payment stays as it is (migration 0097's guard).
      if (payment.refundedAt !== null) {
        throw new ApiError('conflict', 'PaymentAlreadyRefunded', {});
      }
      if (payment.method === PaymentMethod.CashOnDelivery) {
        throw new ApiError('conflict', 'CashOnDeliveryKept', {});
      }
      await this.store.voidPayment(tx, tenantId, payment.id, {
        voidedBy: who.id,
        voidReason: input.reason,
      });
      const standing = await this.recorder.standingWithin(tx, tenantId, order, order);
      const history: NewOrderHistory[] = [];
      this.recorder.noteStanding(
        order,
        standing,
        `${paymentWords(payment)} voided: ${input.reason}`,
        who,
        history,
      );
      const updated = await this.store.updateOrder(tx, tenantId, order.id, standing);
      await this.store.insertHistory(tx, tenantId, history);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderPaymentVoided,
        { type: 'order', id: order.id },
        {
          orderNumber: order.orderNumber,
          paymentId: payment.id,
          method: payment.method,
          amount: payment.amount,
          reason: input.reason,
        },
      );
      return this.orders.viewWithin(tx, tenantId, updated, []);
    });
  }

  /** PAY-20, ORD-44 (Slice 5.3, agreed 2026-10-31): money given back, marked with a note; it moves no money. */
  async refund(
    tenantId: string,
    orderId: string,
    paymentId: string,
    input: RefundPaymentInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.find(tx, tenantId, orderId);
      const payment = await this.store.lockPayment(tx, tenantId, order.id, paymentId);
      if (!payment) throw new ApiError('not_found', 'OrderPaymentNotFound', {});
      if (payment.voidedAt !== null) throw new ApiError('conflict', 'PaymentAlreadyVoided', {});
      if (payment.refundedAt !== null) {
        throw new ApiError('conflict', 'PaymentAlreadyRefunded', {});
      }
      await this.store.refundPayment(tx, tenantId, payment.id, {
        refundedBy: who.id,
        refundNote: input.note,
      });
      const standing = await this.recorder.standingWithin(tx, tenantId, order, order);
      const history: NewOrderHistory[] = [];
      this.recorder.noteStanding(
        order,
        standing,
        `${paymentWords(payment)} refunded: ${input.note}`,
        who,
        history,
      );
      const updated = await this.store.updateOrder(tx, tenantId, order.id, standing);
      await this.store.insertHistory(tx, tenantId, history);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.OrderPaymentRefunded,
        { type: 'order', id: order.id },
        {
          orderNumber: order.orderNumber,
          paymentId: payment.id,
          method: payment.method,
          amount: payment.amount,
          note: input.note,
        },
      );
      return this.orders.viewWithin(tx, tenantId, updated, []);
    });
  }

  private async find(tx: Transaction, tenantId: string, orderId: string): Promise<OrderRecord> {
    const order = await this.store.findOrder(tx, tenantId, orderId, true);
    if (!order) throw new ApiError('not_found', 'OrderNotFound', {});
    return order;
  }
}
