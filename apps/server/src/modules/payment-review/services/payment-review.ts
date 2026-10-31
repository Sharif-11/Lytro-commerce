import { Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  PaymentSessionSource,
  PaymentSessionState,
  QueueName,
  type RejectShopperPaymentInput,
  type VerifyShopperPaymentInput,
} from '@lytronix/validators';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { OrderService } from '../../orders/services/order.service';
import { PaymentRecorder } from '../../orders/services/payment-recorder';
import type { OrderView } from '../../orders/types/orders';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import { AdTrackingService } from '../../public-api/services/ad-tracking.service';
import type { MetaPurchasePayload } from '../../public-api/services/meta-purchase-sender';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';

/**
 * VER-01, VER-12, PAY-14, PAY-15, D5-4 (Phase 5 Slice 5.3, read agreed 2026-10-31): staff with payments:verify decide a
 * transaction ID a shopper typed, by hand. Verifying records the amount that arrived (the amount asked when not said,
 * never more than is due) as the order's payment, claims the ID platform-wide, moves the order on from Unverified and
 * -- for a checkout's order -- tells Meta of the purchase now (agreed 2026-10-31). Rejecting records why, which the page
 * shows the shopper, and cancels a checkout's order with "advance not paid", letting its stock go; a staff link's order
 * stays as it is, as an unpaid link leaves it. Each is one transaction and in the activity log.
 */
@Injectable()
export class PaymentReview {
  constructor(
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(PaymentRecorder) private readonly recorder: PaymentRecorder,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(AdTrackingService) private readonly adTracking: AdTrackingService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async verify(
    tenantId: string,
    sessionId: string,
    input: VerifyShopperPaymentInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    const toMeta = await this.adTracking.sendsPurchases(tenantId);
    return this.sessions.inTransaction(async (tx) => {
      const session = await this.sessions.lockToDecideWithin(tx, tenantId, sessionId);
      const order = await this.orders.lockWithin(tx, tenantId, session.orderId);
      const updated = await this.recorder.recordWithin(
        tx,
        tenantId,
        order,
        {
          method: session.method,
          amount: input.amount !== undefined ? input.amount.toFixed(2) : session.amount,
          senderNumber: session.senderNumber,
          transactionId: session.transactionId,
          sessionId: session.id,
        },
        who,
        '',
        AuditAction.PaymentVerified,
      );
      await this.sessions.decideWithin(tx, tenantId, session.id, {
        state: PaymentSessionState.Verified,
        decidedBy: who.id,
        decidedAt: new Date(),
        rejectReason: null,
        rejectNote: null,
      });
      if (toMeta && session.source === PaymentSessionSource.Checkout) {
        const payload: MetaPurchasePayload = { tenantId, orderId: order.id };
        await this.jobs.enqueue(tx, QueueName.MetaPurchase, payload, { singletonKey: order.id });
      }
      return this.orders.viewWithin(tx, tenantId, updated, []);
    });
  }

  async reject(
    tenantId: string,
    sessionId: string,
    input: RejectShopperPaymentInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.sessions.inTransaction(async (tx) => {
      const session = await this.sessions.lockToDecideWithin(tx, tenantId, sessionId);
      const now = new Date();
      await this.sessions.decideWithin(tx, tenantId, session.id, {
        state: PaymentSessionState.Failed,
        decidedBy: who.id,
        decidedAt: now,
        rejectReason: input.reason,
        rejectNote: input.note ? input.note : null,
      });
      if (session.source === PaymentSessionSource.Checkout) {
        await this.orders.cancelUnpaidWithin(tx, tenantId, session.orderId, now);
      }
      const order = await this.orders.lockWithin(tx, tenantId, session.orderId);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PaymentRejected,
        { type: 'order', id: order.id },
        {
          orderNumber: order.orderNumber,
          method: session.method,
          amount: session.amount,
          transactionId: session.transactionId,
          reason: input.reason,
        },
      );
      return this.orders.viewWithin(tx, tenantId, order, []);
    });
  }
}
