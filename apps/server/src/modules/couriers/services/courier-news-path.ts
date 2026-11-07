import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CourierParcelPatch,
  SelectCourierEvent,
  SelectCourierParcel,
  Transaction,
} from '@lytronix/db';
import {
  ActorType,
  COURIER_PAYOUT_ID_MAX_LENGTH,
  CourierNewsSource,
  FulfillmentStatus,
  ParcelAttention,
  ParcelReading,
  ParcelState,
  StatusOverride,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { OrderFulfilment } from '../../orders/services/order-fulfilment';
import type { OrderRecord } from '../../orders/types/orders';
import type {
  CourierNotifier,
  ParcelAttentionNotice,
  ParcelMovedNotice,
} from '../ports/courier-notifier';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_NOTIFIER, COURIER_STORE } from '../tokens';
import { CourierBooking } from './courier-booking';
import { CourierRegistry } from './courier-registry';

// A courier's report moving an order is the server acting on its word; the history line names the courier.
const COURIER_REPORT: ResolvedActor = { id: null, ip: null, type: ActorType.System };
// How many stored messages one pass of the minute job applies for a shop.
const PER_PASS = 100;

// A report on an order already delivered that says something has gone wrong with it (read agreed 2026-11-05).
/**
 * Phase 6 close-out: what comes before a result. Once a parcel is delivered, or partly delivered, a report of one of these is
 * an old word arriving late: it is noted in the news and moves nothing back.
 */
const BEFORE_A_RESULT: readonly ParcelReading[] = [
  ParcelReading.Booked,
  ParcelReading.WithCourier,
  ParcelReading.Unconfirmed,
];
const REVERSING: readonly ParcelReading[] = [
  ParcelReading.Returning,
  ParcelReading.Hold,
  ParcelReading.Problem,
];

/** What applying one report left to say, once its transaction has committed. */
interface Applied {
  attention: ParcelAttentionNotice | null;
  moved: ParcelMovedNotice | null;
}

const NOTHING: Applied = { attention: null, moved: null };

/**
 * CRR-12, CRR-13, CRR-29, ORD-42, ORD-43, D6-6, D6-12, D6-13 (Phase 6 Slice 6.2, read agreed 2026-11-05): the one path all courier news
 * takes, a message, the night check or Sync alike. It keeps the courier's own status on the parcel and moves the order only on a
 * result the courier stands behind: with the courier, delivered, or partly delivered with its cash. A hold, the rider's word, a
 * parcel coming back or a lost parcel show and move nothing, and no report moves stock, since staff count what comes back.
 * News older than the parcel holds is kept and changes nothing. A report that disagrees with what has already happened goes to
 * staff and reopens nothing: delivered on a cancelled order, or something gone wrong on a delivered one. Its transaction holds
 * the order and the parcel, so news arriving together, or a person marking the same step, applies once.
 */
@Injectable()
export class CourierNewsPath {
  private readonly logger = new Logger('CourierNews');

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierRegistry) private readonly registry: CourierRegistry,
    @Inject(CourierBooking) private readonly booking: CourierBooking,
    @Inject(OrderFulfilment) private readonly fulfilment: OrderFulfilment,
    @Inject(COURIER_NOTIFIER) private readonly notifier: CourierNotifier,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** Applies stored news. A parcel still being booked leaves it for the minute pass; a second apply does nothing. */
  async apply(tenantId: string, eventId: string): Promise<void> {
    const event = await this.store.run(tenantId, (tx) =>
      this.store.findEvent(tx, tenantId, eventId),
    );
    if (event?.appliedAt !== null) return;
    const parcel = await this.readyParcel(tenantId, event);
    if (parcel === 'waiting') return;
    let outcome = NOTHING;
    try {
      outcome = await this.store.run(tenantId, async (tx) => {
        if (parcel === null) {
          this.logger.warn(`news for a parcel Lytro did not book, on tenant ${tenantId}`);
          await this.finish(tx, tenantId, event.id, null, 'no_parcel');
          return NOTHING;
        }
        const order = await this.fulfilment.lockWithin(tx, tenantId, parcel.orderId);
        const held = await this.store.lockParcel(tx, tenantId, parcel.id);
        const fresh = await this.store.lockEvent(tx, tenantId, event.id);
        if (!held || fresh?.appliedAt !== null) return NOTHING;
        const applied = await this.applyWithin(tx, tenantId, order, held, fresh);
        await this.finish(tx, tenantId, event.id, held.id, null);
        return applied;
      });
    } catch (error) {
      // A refusal of its own, such as a payment that doesn't fit, would refuse every time. Anything else is tried again by the pass.
      if (!(error instanceof ApiError)) throw error;
      this.logger.warn(`courier news ${event.id} could not be applied: ${error.messageKey}`);
      await this.store.run(tenantId, (tx) =>
        this.finish(tx, tenantId, event.id, parcel?.id ?? null, error.messageKey),
      );
    }
    await this.tell(outcome);
  }

  /** The minute pass: what a message stored and nothing applied, say because the server restarted just after answering it. */
  async applyDue(tenantId: string, storedBefore: Date): Promise<void> {
    const due = await this.store.run(tenantId, (tx) =>
      this.store.unappliedEvents(tx, tenantId, storedBefore, PER_PASS),
    );
    for (const event of due) {
      try {
        await this.apply(tenantId, event.id);
      } catch (error) {
        this.logger.error(`courier news ${event.id} failed on tenant ${tenantId}`, error as Error);
      }
    }
  }

  /**
   * The parcel this news is about, once it can take news. News can prove a lost answer's parcel exists (D6-11), so that settles it
   * first. One still out with its courier, or accepted and not yet settled, waits.
   */
  private async readyParcel(
    tenantId: string,
    event: SelectCourierEvent,
  ): Promise<SelectCourierParcel | null | 'waiting'> {
    const { news } = event;
    const found = await this.store.run(tenantId, (tx) =>
      this.store.parcelForNews(tx, tenantId, event.courierKey, {
        consignmentId: news.consignmentId,
        invoice: news.invoice,
      }),
    );
    if (found === null) return null;
    if (found.state === ParcelState.Unknown) {
      await this.booking.foundByLookUp(tenantId, found, {
        consignmentId: news.consignmentId,
        trackingCode: null,
        courierStatus: event.rawStatus,
      });
    } else if (found.state !== ParcelState.Booked) {
      return found.state === ParcelState.Booking ? 'waiting' : found;
    }
    const current = await this.store.run(tenantId, (tx) =>
      this.store.lockParcel(tx, tenantId, found.id),
    );
    return current?.settledAt === null ? 'waiting' : current;
  }

  private async applyWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    parcel: SelectCourierParcel,
    event: SelectCourierEvent,
  ): Promise<Applied> {
    const { news } = event;
    const now = this.clock();
    const patch: CourierParcelPatch = {
      ...(event.source === CourierNewsSource.Message ? { lastMessageAt: now } : {}),
      ...(news.consignmentId !== null && parcel.consignmentId === null
        ? { consignmentId: news.consignmentId }
        : {}),
      ...(news.deliveryCharge !== null ? { deliveryCharge: news.deliveryCharge } : {}),
    };
    // Close-out (A3): a parcel that settled without its IDs gives them to the order's tracking when a message brings them.
    if (news.consignmentId !== null && parcel.consignmentId === null && parcel.settledAt !== null) {
      await this.fulfilment.fillTrackingWithin(
        tx,
        tenantId,
        order,
        this.booking.trackingOf(parcel.courierKey, {
          consignmentId: news.consignmentId,
          trackingCode: parcel.trackingCode,
        }),
      );
    }
    // CRR-12, CRR-17 (Slice 6.5): being paid goes on the parcel and moves nothing else. The first word of it stands.
    if (news.paid === true && parcel.paidAt === null) {
      patch.paidAt = event.happenedAt ?? now;
      const payoutId = news.payoutId ?? null;
      if (payoutId !== null && payoutId.length <= COURIER_PAYOUT_ID_MAX_LENGTH) {
        patch.payoutId = payoutId;
      }
    }
    let attention: ParcelAttention | null = null;
    if (news.codAtCourier !== null && Number(news.codAtCourier) !== Number(parcel.cod)) {
      patch.codAtCourier = news.codAtCourier;
      attention = ParcelAttention.CodChanged;
    }
    const older =
      event.happenedAt !== null &&
      parcel.lastNewsAt !== null &&
      event.happenedAt.getTime() < parcel.lastNewsAt.getTime();
    let moved: ParcelReading | null = null;
    const finished =
      parcel.reading === ParcelReading.Delivered ||
      parcel.reading === ParcelReading.PartlyDelivered;
    const late = finished && event.reading !== null && BEFORE_A_RESULT.includes(event.reading);
    if (news.statusEvent && !older && !late) {
      if (event.rawStatus !== parcel.courierStatus) {
        patch.courierStatus = event.rawStatus;
        patch.lastChangeAt = now;
        // Phase 6 close-out: news after 30 quiet days ends "no news", and the checks start again.
        if (parcel.checksStoppedAt !== null) patch.checksStoppedAt = null;
      }
      if (event.happenedAt !== null) patch.lastNewsAt = event.happenedAt;
      if (event.reading === null) {
        this.logger.warn(`${event.courierKey} sent a status it has no reading for`);
      } else {
        patch.reading = event.reading;
        const result = await this.moveOrder(tx, tenantId, order, parcel, event, patch, now);
        attention = result.attention ?? attention;
        moved = result.moved;
      }
    }
    if (attention !== null) patch.attention = attention;
    await this.store.updateParcel(tx, tenantId, parcel.id, patch, now);
    const about = {
      tenantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      courierKey: parcel.courierKey,
    };
    return {
      attention: attention !== null ? { ...about, why: attention } : null,
      moved: moved !== null ? { ...about, reading: moved } : null,
    };
  }

  /** CRR-29, D6-12: what this report does to the order, by what the courier stands behind and where the order has got to. */
  private async moveOrder(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    parcel: SelectCourierParcel,
    event: SelectCourierEvent,
    patch: CourierParcelPatch,
    now: Date,
  ): Promise<{ attention: ParcelAttention | null; moved: ParcelReading | null }> {
    const reading = event.reading;
    const finished =
      reading === ParcelReading.Delivered || reading === ParcelReading.PartlyDelivered;
    const cancelledOrder = order.statusOverride === StatusOverride.Cancelled;
    // CRR-28: a booking called off, or an order cancelled, that the courier says arrived anyway goes to staff and reopens nothing.
    if (parcel.state !== ParcelState.Booked || cancelledOrder) {
      return {
        attention: finished ? ParcelAttention.DeliveredAfterCancel : null,
        moved: null,
      };
    }
    const status = order.fulfillmentStatus;
    const reached =
      status === FulfillmentStatus.Delivered || status === FulfillmentStatus.PartiallyDelivered;
    if (reading !== null && REVERSING.includes(reading)) {
      return { attention: reached ? ParcelAttention.ReportAfterDelivered : null, moved: null };
    }
    const name = this.registry.of(parcel.courierKey)?.name ?? parcel.courierKey;
    const line = [name, event.rawStatus].filter((part) => part !== null).join(' · ');
    if (reading === ParcelReading.WithCourier) {
      if (status !== FulfillmentStatus.Processing) return { attention: null, moved: null };
      await this.fulfilment.courierShippedWithin(tx, tenantId, order, line, COURIER_REPORT, now);
      return { attention: null, moved: reading };
    }
    if (!finished) return { attention: null, moved: null };
    // Phase 6 close-out (agreed 2026-11-07): staff are counting a partly delivered parcel's rest back, so a later "delivered" is
    // noted in its news and changes nothing: no move, no cash, and the parcel still reads partly delivered.
    if (reading === ParcelReading.Delivered && status === FulfillmentStatus.PartiallyDelivered) {
      patch.reading = ParcelReading.PartlyDelivered;
      return { attention: null, moved: null };
    }
    const reported = event.news.cashCollected;
    if (reported !== null) patch.cashCollected = reported;
    // D6-13: a person got there first, or the parcel is already further on, so this agrees and changes nothing but may differ in cash.
    const taken =
      reading === ParcelReading.Delivered
        ? status === FulfillmentStatus.Delivered || status === FulfillmentStatus.Returned
        : reached || status === FulfillmentStatus.Returned;
    if (taken) {
      const differs = reported !== null && Number(reported) !== Number(parcel.cod);
      return { attention: differs ? ParcelAttention.CashDiffers : null, moved: null };
    }
    const result = await this.fulfilment.courierDeliveredWithin(
      tx,
      tenantId,
      order,
      { partly: reading === ParcelReading.PartlyDelivered, reported, asked: parcel.cod, line },
      COURIER_REPORT,
      now,
    );
    return { attention: result.differs ? ParcelAttention.CashDiffers : null, moved: reading };
  }

  private finish(
    tx: Transaction,
    tenantId: string,
    eventId: string,
    parcelId: string | null,
    problem: string | null,
  ): Promise<void> {
    return this.store.finishEvent(tx, tenantId, eventId, { parcelId, problem }, this.clock());
  }

  /** After its transaction, so a notice never tells of what rolled back, and failing to tell changes nothing. */
  private async tell(outcome: Applied): Promise<void> {
    try {
      if (outcome.attention) await this.notifier.parcelNeedsAttention(outcome.attention);
      if (outcome.moved) await this.notifier.parcelMoved(outcome.moved);
    } catch (error) {
      this.logger.error('could not tell of a courier report', error as Error);
    }
  }
}
