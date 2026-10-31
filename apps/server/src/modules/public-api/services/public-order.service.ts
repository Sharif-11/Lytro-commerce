import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ActorType,
  ApiKeyPurpose,
  FieldProblemCode,
  FulfilmentType,
  OrderPaymentStatus,
  OrderSource,
  QueueName,
  type PublicOrderInput,
} from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import {
  IdempotencyService,
  type IdempotencyClaim,
} from '../../../common/idempotency/idempotency.service';
import type { OrderNotifier } from '../../orders/ports/order-notifier';
import { OrderPricing } from '../../orders/services/order-pricing';
import { placedViewOf } from '../../orders/services/order-tracking';
import { OrderService } from '../../orders/services/order.service';
import { ORDER_NOTIFIER } from '../../orders/tokens';
import type { OrderPaymentLink, OrderRecord, PlacedOrderView } from '../../orders/types/orders';
import { PaymentMethods } from '../../payment-methods/services/payment-methods';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { ApiShop, AuthenticatedKey } from '../types/public-api';
import { AdTrackingService } from './ad-tracking.service';
import type { MetaPurchasePayload } from './meta-purchase-sender';
import { OrderLimits } from './order-limits';

/** ORD-02: an order placed, or the reply its idempotency key already holds. */
export type OrderPlaced =
  { replayed: false; order: PlacedOrderView } | { replayed: true; body: unknown };

/**
 * ORD-02, ORD-20, ORD-21, LND-16, API-21 (Phase 4 Slice 4.2): a shopper's order through a public key -- the Lytro
 * storefront's, or a key the shop made for its own site. It is made exactly as a staff order is, refused what a
 * shopper may not order, and starts pending, waiting for the shop's call (ORD-07); its activity entry names the key.
 * Since Phase 5 (Slice 5.2) an order needing an advance starts unverified, its payment session opened with it.
 * Meta's server-side `Purchase` is queued in the order's own transaction, and the shop's staff are told once it has
 * committed -- never on a replay.
 */
@Injectable()
export class PublicOrderService {
  private readonly logger = new Logger('PublicOrders');

  constructor(
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(OrderPricing) private readonly pricing: OrderPricing,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(AdTrackingService) private readonly adTracking: AdTrackingService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(ORDER_NOTIFIER) private readonly notifier: OrderNotifier,
    @Inject(PaymentMethods) private readonly methods: PaymentMethods,
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(OrderLimits) private readonly limits: OrderLimits,
  ) {}

  async place(
    shop: ApiShop,
    input: PublicOrderInput,
    key: AuthenticatedKey,
    ip: string | null,
    claim: IdempotencyClaim,
  ): Promise<OrderPlaced> {
    const tenantId = shop.row.id;
    const source = this.sourceOf(input, key);
    const location = await this.pricing.thanaOf(input.locationId);
    const toMeta = await this.adTracking.sendsPurchases(tenantId);
    const now = new Date();
    const placed = await this.orders.inTransaction(tenantId, async (tx) => {
      // PAY-01, WAL-08 (Phase 5 Slice 5.2): how an advance could be paid -- the methods the shop offers shoppers now;
      // none while Lytro has its payment page suspended (TVR-03).
      const offered =
        shop.row.paymentPageSuspendedAt === null
          ? await this.methods.forShoppersWithin(tx, tenantId)
          : [];
      const made = await this.orders.makeWithin(tx, tenantId, claim, {
        source,
        type: FulfilmentType.Delivery,
        customerName: input.customerName,
        phone: input.phone,
        location,
        deliveryAddress: input.deliveryAddress,
        tableRef: null,
        items: input.items,
        discount: '0.00',
        byHand: null,
        confirmed: false,
        notes: null,
        shopperNote: input.shopperNote ?? null,
        by: null,
        actor: { id: key.id, ip, type: ActorType.ApiKey },
        audited: { keyName: key.name, source },
        shopper: true,
        onlinePayment:
          offered.length === 0 ? 'unavailable' : input.payment === undefined ? 'not_sent' : 'ready',
      });
      if (made.replayed) return made;
      // LND-10, SFT-07: an order waiting on its advance opens its payment with it, in the same transaction -- unless the
      // shop's payment sessions are flooding (RTE-08), when the order is refused with them.
      let payment: OrderPaymentLink | null = null;
      if (made.order.paymentStatus === OrderPaymentStatus.PendingVerification && input.payment) {
        await this.limits.admitSession(shop, now);
        payment = await this.sessions.openForCheckoutWithin(
          tx,
          tenantId,
          made.order,
          input.payment,
          {
            websites: key.websites,
            offered,
            now,
          },
        );
      }
      const view: PlacedOrderView = { ...placedViewOf(made.order, made.lines), payment };
      // Agreed 2026-10-31 (Slice 5.3): an order paid in advance tells Meta of the purchase once its payment is verified.
      if (toMeta && payment === null) {
        const payload: MetaPurchasePayload = { tenantId, orderId: made.order.id };
        await this.jobs.enqueue(tx, QueueName.MetaPurchase, payload, {
          singletonKey: made.order.id,
        });
      }
      await this.idempotency.completeWithin(tx, claim, 201, view);
      return { replayed: false as const, view, order: made.order };
    });
    if (placed.replayed) return placed;
    await this.tell(tenantId, placed.order);
    return { replayed: false, order: placed.view };
  }

  /**
   * LND-09: where the order came from. The Lytro storefront says whether its storefront or a landing page took it; any
   * other key's order is the API's, and such a key may not say otherwise.
   */
  private sourceOf(input: PublicOrderInput, key: AuthenticatedKey): OrderSource {
    if (key.purpose === ApiKeyPurpose.Storefront) return input.source ?? OrderSource.Storefront;
    if (input.source !== undefined) {
      throw new FieldsError([{ field: 'source', problem: FieldProblemCode.NotAllowed }]);
    }
    return OrderSource.Api;
  }

  /** ORD-20: tells the shop's staff, after the order has committed; a notice that fails never undoes the order. */
  private async tell(tenantId: string, order: OrderRecord): Promise<void> {
    try {
      await this.notifier.orderPlaced({
        tenantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        source: order.source,
        customerName: order.customerName,
        grandTotal: order.grandTotal,
      });
    } catch (error) {
      this.logger.error(`could not tell ${tenantId} of order ${order.orderNumber}`, error as Error);
    }
  }
}
