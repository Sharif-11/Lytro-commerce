import { Inject, Injectable, Logger } from '@nestjs/common';
import { CircuitBreaker } from '../../../common/circuit-breaker';
import { LocationService } from '../../delivery/services/location.service';
import { OrderTracking } from '../../orders/services/order-tracking';
import type { MetaConversions } from '../ports/meta-conversions';
import { META_CONVERSIONS } from '../tokens';
import { AdTrackingService } from './ad-tracking.service';
import { purchaseEventOf } from './meta-purchase-event';

// LND-16: how often, and from how far apart (backing off), Meta is tried again for one purchase.
export const META_PURCHASE_RETRIES = 8;
export const META_PURCHASE_RETRY_DELAY_SECONDS = 60;

/** LND-16: the job queued in a shopper's order's own transaction. */
export interface MetaPurchasePayload {
  tenantId: string;
  orderId: string;
}

/**
 * LND-16, PRF-05, SEC-11: tells Meta of a shopper's order from the job queue, apart from the order, so Meta being away
 * never delays or touches it. The shop's credentials are read as it sends: once the order, the Pixel ID or the token is
 * gone, nothing is sent. Each shop's calls go through its own circuit, and each use of its token is logged by when, for
 * which shop and order, and how it went -- never its value. A failure throws, and the job tries again.
 */
@Injectable()
export class MetaPurchaseSender {
  private readonly logger = new Logger('MetaConversions');
  private readonly breaker = new CircuitBreaker();

  constructor(
    @Inject(AdTrackingService) private readonly adTracking: AdTrackingService,
    @Inject(OrderTracking) private readonly orders: OrderTracking,
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(META_CONVERSIONS) private readonly meta: MetaConversions,
  ) {}

  async send(job: MetaPurchasePayload): Promise<void> {
    const credentials = await this.adTracking.purchaseCredentials(job.tenantId);
    if (!credentials) return;
    const found = await this.orders.orderWithLines(job.tenantId, job.orderId);
    if (!found) return;
    const { order, lines } = found;
    const district =
      order.locationId !== null ? await this.locations.zillaNameOf(order.locationId) : null;
    const use = `tenant ${job.tenantId}, Meta Conversions API, order ${order.orderNumber}`;
    try {
      await this.breaker.call(`meta:${job.tenantId}`, () =>
        this.meta.send(credentials.pixelId, credentials.token, [
          purchaseEventOf(order, lines, district),
        ]),
      );
      this.logger.log(`credential used: ${use}: sent`);
    } catch (error) {
      // The token travels in the request body only, so no error from the call can carry it.
      this.logger.warn(
        `credential used: ${use}: failed (${error instanceof Error ? error.message : 'error'})`,
      );
      throw error;
    }
  }
}
