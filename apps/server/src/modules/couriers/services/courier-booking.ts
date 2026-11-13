import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectCourierParcel, Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  bdMobileNumber,
  COURIER_CALLS_PER_MINUTE,
  CourierCallAction,
  FulfillmentStatus,
  ParcelReading,
  ParcelState,
  StatusOverride,
  type BookOrderInput,
  type CancelOrderInput,
  type CancelParcelInput,
  type CourierKey,
  type SettleParcelInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CircuitOpen } from '../../../common/circuit-breaker';
import type { LimitStore } from '../../shared/limits/ports/limit-store';
import { LIMIT_STORE } from '../../shared/limits/tokens';
import type { MessageKey } from '../../../common/i18n/message-key';
import { MINUTE_MS } from '../../../common/time';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { LocationService } from '../../delivery/services/location.service';
import type { HandlingPassed, HandlingShop } from '../../orders/services/handling-quota';
import { OrderFulfilment } from '../../orders/services/order-fulfilment';
import { OrderService } from '../../orders/services/order.service';
import type { OrderRecord, OrderView } from '../../orders/types/orders';
import {
  CourierNoAnswer,
  PICKUP_STORE_ID,
  type AcceptedParcel,
  type BookingAnswer,
  type CancelAnswer,
  type CourierAccount,
  type CourierAdapter,
  type CourierRefusal,
  type ParcelBooking,
} from '../ports/courier-adapter';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_STORE } from '../tokens';
import { CourierAreaList } from './courier-area-list';
import { CourierCalls } from './courier-calls';
import { CourierConnections } from './courier-connections';
import { CourierRegistry } from './courier-registry';

// D6-11: after a lost answer, wait this long before asking by our own number: Steadfast's answers are cached for 60 seconds.
export const FIRST_LOOK_UP_AFTER_MS = 2 * MINUTE_MS;
// A courier the circuit has stopped calling is tried again after this.
const RETRY_AFTER_SECONDS = 60;
// The server acting on its own: the minute pass settling a booking whose answer it found (D6-11).
const SYSTEM: ResolvedActor = { id: null, ip: null, type: ActorType.System };

/** What a claim left ready for the call. */
interface Claim {
  parcel: SelectCourierParcel;
  booking: ParcelBooking;
  passed: HandlingPassed | null;
  connection: { adapter: CourierAdapter; account: CourierAccount };
}

/**
 * CRR-05 to CRR-10, CRR-18, CRR-19, CRR-28, CRR-30, D6-7, D6-10, D6-11, D6-14 (Phase 6 Slice 6.1, read agreed 2026-11-04): booking an
 * order with its courier: claim, call, settle, with no transaction open across a call of up to 30 seconds.
 *
 * The claim refuses what can't be booked and writes a `booking` parcel; the order's lock and a unique index allow one live parcel.
 * Because a courier's yes can't be taken back, everything that could refuse afterwards is settled now: the order takes its place under
 * the limits, its fee is held and its stock step is tried. The call makes one attempt. A refusal ends the claim and gives everything
 * back. A lost answer leaves the parcel `unknown` with everything still set aside, and another booking refused until it is settled, by
 * asking the courier where it can be asked, or by staff. An accepted parcel is written first and alone, so it is never lost, and
 * the order then takes it in one transaction; if that can't happen, the parcel waits, and staff are told if it needs them.
 *
 * Cancelling comes in two sizes (read agreed 2026-11-04): the booking alone, with the order kept to be booked again, or the whole order
 * with its stock back. Either way its fee and count stay (PYG-04, QTA-01), and only a booking that was cancelled gives the next
 * attempt a new invoice, so a courier's refusal of a repeat still guards every other retry.
 */
@Injectable()
export class CourierBooking {
  private readonly logger = new Logger('CourierBooking');

  constructor(
    @Inject(LIMIT_STORE) private readonly limitStore: LimitStore,
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierRegistry) private readonly registry: CourierRegistry,
    @Inject(CourierConnections) private readonly connections: CourierConnections,
    @Inject(CourierCalls) private readonly calls: CourierCalls,
    @Inject(OrderFulfilment) private readonly fulfilment: OrderFulfilment,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(CourierAreaList) private readonly areas: CourierAreaList,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  async book(
    shop: HandlingShop,
    orderId: string,
    input: BookOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    await this.takeCall(shop.id);
    const who = await this.activity.resolve(shop.id, actor);
    // Before the claim: nothing is set aside for a login that has ended, and renewing proves nothing about the parcel.
    await this.connections.renewIfDue(shop.id, input.courierKey);
    const claim = await this.claim(shop, orderId, input, who);
    const { adapter, account } = claim.connection;
    let answer: BookingAnswer;
    try {
      answer = await this.calls.run(
        adapter,
        {
          tenantId: shop.id,
          connectionId: account.connectionId,
          orderId,
          action: CourierCallAction.Book,
        },
        () => adapter.book(account, claim.booking),
      );
    } catch (error) {
      if (error instanceof CircuitOpen) {
        // No call was made, so nothing can exist: this attempt simply didn't happen.
        await this.endRefused(shop.id, claim.parcel, null);
        throw new ApiError(
          'service_unavailable',
          'CourierNotAnswering',
          { courierKey: adapter.key },
          RETRY_AFTER_SECONDS,
          { courier: adapter.name },
        );
      }
      // CRR-18: it may have worked. Whatever went wrong, the parcel may exist, so nothing is released and nothing is retried.
      if (!(error instanceof CourierNoAnswer)) {
        this.logger.error(`a booking call failed for order ${orderId}`, error as Error);
      }
      await this.markUnknown(shop.id, claim.parcel.id, adapter);
      throw new ApiError(
        'service_unavailable',
        'CourierAnswerLost',
        { courierKey: adapter.key, parcelState: ParcelState.Unknown },
        undefined,
        { courier: adapter.name },
      );
    }
    if (answer.outcome === 'refused') {
      await this.endRefused(shop.id, claim.parcel, answer.refusal);
      throw this.refusalError(adapter, answer.refusal);
    }
    await this.markAccepted(shop.id, claim.parcel.id, answer.parcel);
    return this.settleAccepted(shop.id, claim.parcel.id, orderId, who, claim.passed);
  }

  /** CRR-07, D6-11: finishes an accepted parcel, for the minute pass. A stock problem is recorded for staff, never thrown. */
  async settleQuietly(tenantId: string, parcel: SelectCourierParcel): Promise<void> {
    await this.settleAccepted(tenantId, parcel.id, parcel.orderId, SYSTEM, null);
  }

  /** D6-11: what the minute pass found: the parcel exists, and the order takes it. */
  async foundByLookUp(
    tenantId: string,
    parcel: SelectCourierParcel,
    found: {
      consignmentId: string | null;
      trackingCode: string | null;
      courierStatus: string | null;
    },
  ): Promise<void> {
    const taken = await this.store.run(tenantId, async (tx) => {
      // Close-out (A6): staff may have settled it while the look-up was out; what they said stands.
      const held = await this.lockedOwn(tx, tenantId, parcel.id);
      if (held.state !== ParcelState.Unknown) return false;
      await this.store.updateParcel(
        tx,
        tenantId,
        parcel.id,
        {
          state: ParcelState.Booked,
          consignmentId: found.consignmentId,
          trackingCode: found.trackingCode,
          courierStatus: found.courierStatus,
          nextLookUpAt: null,
        },
        this.clock(),
      );
      return true;
    });
    if (taken) await this.settleQuietly(tenantId, parcel);
  }

  /** D6-11: there is no such parcel, so the booking comes to nothing and gives everything back. */
  async notBooked(tenantId: string, parcel: SelectCourierParcel): Promise<void> {
    await this.endRefused(tenantId, parcel, null);
  }

  /** D6-11, CRR-18: staff settle a booking from what the courier's panel says, or finish one whose stock wasn't ready. */
  async settle(
    tenantId: string,
    orderId: string,
    input: SettleParcelInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    const parcel = await this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      const live = await this.store.liveParcel(tx, tenantId, order.id);
      if (live === null) throw new ApiError('conflict', 'ParcelNothingToSettle', {});
      return live;
    });
    switch (input.outcome) {
      case 'not_booked':
        if (parcel.state !== ParcelState.Unknown) {
          throw new ApiError('conflict', 'ParcelNothingToSettle', {});
        }
        await this.endRefused(tenantId, parcel, null, who);
        return this.viewOf(tenantId, orderId);
      case 'retry':
        if (parcel.state !== ParcelState.Booked || parcel.settledAt !== null) {
          throw new ApiError('conflict', 'ParcelNothingToSettle', {});
        }
        return this.settleOrThrow(tenantId, parcel.id, orderId, who);
      case 'booked':
        return this.settleWithIds(
          tenantId,
          parcel,
          orderId,
          { consignmentId: input.consignmentId ?? '', trackingCode: input.trackingCode ?? null },
          who,
        );
    }
  }

  /** Read agreed 2026-11-04: only the booking is called off; the order stays, to be booked again or marked shipped by hand. */
  async cancelBooking(
    tenantId: string,
    orderId: string,
    input: CancelParcelInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    const { parcel } = await this.parcelToCancel(tenantId, orderId);
    if (parcel === null) throw new ApiError('conflict', 'ParcelNothingToCancel', {});
    await this.callOffAtCourier(tenantId, orderId, parcel, input.courierCancelled);
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      this.refuseOffItsWay(order);
      const held = await this.lockedOwn(tx, tenantId, parcel.id);
      // Close-out (A6): two at once cancel it once; the second finds nothing left to call off.
      if (held.state !== ParcelState.Booked) {
        throw new ApiError('conflict', 'ParcelNothingToCancel', {});
      }
      await this.endCancelled(tx, tenantId, order, held);
      const name = this.registry.of(held.courierKey)?.name ?? held.courierKey;
      const note = [name, held.consignmentId, 'booking cancelled']
        .filter((part) => part !== null)
        .join(' · ');
      const updated =
        held.settledAt !== null
          ? await this.fulfilment.dropBookingWithin(tx, tenantId, order, note, who)
          : order;
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ParcelCancelled,
        { type: 'order', id: order.id },
        { orderNumber: order.orderNumber, courierKey: held.courierKey },
      );
      return this.orders.viewWithin(tx, tenantId, updated, []);
    });
  }

  /**
   * CRR-28, ORD-10, ORD-52: cancels an order. One with no booking is cancelled as ever; a booked one has its parcel dealt with first,
   * then its stock comes back and it is cancelled with its reason, keeping its fee and count.
   */
  async cancelOrder(
    tenantId: string,
    orderId: string,
    input: CancelOrderInput,
    actor: CatalogueActor,
  ): Promise<OrderView> {
    const { parcel, booked } = await this.parcelToCancel(tenantId, orderId);
    if (parcel === null && !booked) return this.orders.cancel(tenantId, orderId, input, actor);
    const who = await this.activity.resolve(tenantId, actor);
    if (parcel !== null) {
      await this.callOffAtCourier(tenantId, orderId, parcel, input.courierCancelled);
    }
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      this.refuseOffItsWay(order);
      if (parcel !== null) {
        const held = await this.lockedOwn(tx, tenantId, parcel.id);
        await this.endCancelled(tx, tenantId, order, held);
      }
      await this.fulfilment.takeBackStockWithin(tx, tenantId, order, who);
      return this.orders.cancelBookedWithin(tx, tenantId, order, input, who, this.clock());
    });
  }

  /** Claims the order for this booking, in one short transaction. */
  private claim(
    shop: HandlingShop,
    orderId: string,
    input: BookOrderInput,
    who: ResolvedActor,
  ): Promise<Claim> {
    return this.store.run(shop.id, async (tx) => {
      const order = await this.fulfilment.lockForBooking(tx, shop.id, orderId);
      const connection = await this.connections.chosenWithin(tx, shop.id, input.courierKey);
      const { adapter } = connection;
      const booking = await this.bookingOf(tx, shop.id, order, input, connection);
      const now = this.clock();
      const aside = await this.fulfilment.setAsideWithin(tx, shop, order, now);
      // Booked before and called off, its stock is already out: only a first booking takes any.
      const first = order.fulfillmentStatus === FulfillmentStatus.Unfulfilled;
      const serials = first ? (input.serials ?? []) : [];
      if (first) {
        // Under the handling lock the set-aside just took, so two bookings can't both pass here with one serial.
        const named = serials.flatMap((item) => item.serials);
        if (await this.store.serialsInFlight(tx, shop.id, order.id, named)) {
          throw new ApiError('conflict', 'SerialBeingBooked', {});
        }
        await this.fulfilment.checkStockWithin(tx, shop.id, order, serials, who);
      }
      const parcel = await this.store.insertParcel(tx, shop.id, {
        orderId: order.id,
        courierKey: adapter.key,
        connectionId: connection.account.connectionId,
        state: ParcelState.Booking,
        invoice: booking.invoice,
        cod: booking.cod,
        note: booking.note,
        weightKg: booking.weightKg,
        areaCode: booking.areaCode,
        feeHeld: aside.fee?.amount ?? '0',
        feeRates: aside.fee ? { minimum: aside.fee.minimum, percent: aside.fee.percent } : null,
        tookPlace: aside.tookPlace,
        serials,
        serialNumbers: serials.flatMap((item) => item.serials),
        bookedBy: who.id,
      });
      return { parcel, booking, passed: aside.passed, connection };
    });
  }

  /**
   * CRR-06, CRR-10, CRR-30, D6-14: the parcel as this courier will get it, or a refusal saying what to change, before anything is
   * sent. Cash on delivery is what the order says is due (read agreed 2026-11-04). The address is the order's own text with its thana
   * and zilla: a courier reads the address as written, and riders read it too.
   */
  private async bookingOf(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    input: BookOrderInput,
    connection: { adapter: CourierAdapter; account: CourierAccount },
  ): Promise<ParcelBooking> {
    const { adapter, account } = connection;
    const { limits, name: courier } = adapter;
    if (
      order.customerName === null ||
      order.customerPhone === null ||
      order.deliveryAddress === null
    ) {
      throw new ApiError('conflict', 'CourierNeedsRecipient', {}, undefined, { courier });
    }
    const name = order.customerName;
    if (name.length > limits.nameMax) {
      throw this.limitError('CourierNameTooLong', adapter, limits.nameMax);
    }
    if (limits.nameMin !== undefined && name.length < limits.nameMin) {
      throw this.limitError('CourierNameTooShort', adapter, limits.nameMin);
    }
    const phone = bdMobileNumber(order.customerPhone);
    if (phone?.length !== limits.phoneDigits) {
      throw this.limitError('CourierPhoneNotTaken', adapter, limits.phoneDigits);
    }
    const area = order.locationId !== null ? await this.locations.areaOf(order.locationId) : null;
    // A delivery order always has a thana's ID, so this is one no longer in the list, which this courier couldn't read an area from.
    if (adapter.needsThana && area === null) {
      throw this.limitError('CourierThanaNeeded', adapter);
    }
    // An address is written on several lines (the dashboard's and the storefront's boxes, the owner's word of 2026-11-10,
    // and the landing page's always were); a courier's label takes one, so each line break is a comma.
    const street = order.deliveryAddress
      .split(/\s*\n\s*/)
      .filter((line) => line !== '')
      .join(', ');
    const address = [street, area?.thana.nameEn, area?.zilla.nameEn]
      .filter((part) => part !== undefined && part !== '')
      .join(', ');
    if (address.length > limits.addressMax) {
      throw this.limitError('CourierAddressTooLong', adapter, limits.addressMax);
    }
    if (limits.addressMin !== undefined && address.length < limits.addressMin) {
      throw this.limitError('CourierAddressTooShort', adapter, limits.addressMin);
    }
    const note = input.note ?? null;
    if (note !== null && note.length > limits.noteMax) {
      throw this.limitError('CourierNoteTooLong', adapter, limits.noteMax);
    }
    if (
      adapter.pickupStores !== undefined &&
      adapter.storeOptional !== true &&
      !account.credentials[PICKUP_STORE_ID]
    ) {
      throw this.limitError('CourierStoreNeeded', adapter);
    }
    // CUS-12, CRR-10, read agreed 2026-11-06: the courier's own area, chosen by staff or, in one case, by itself; never a guess.
    const courierArea = adapter.needsArea
      ? await this.areas.choose(adapter, order, input.areaCode)
      : null;
    return {
      invoice: await this.invoiceOf(tx, tenantId, order),
      recipientName: name,
      recipientPhone: phone,
      recipientAddress: address,
      // Read agreed 2026-11-05: the order keeps its exact amount, and the parcel records what the courier was asked to collect.
      cod: limits.wholeTakaCod ? Math.ceil(Number(order.due)).toFixed(2) : order.due,
      note,
      weightKg: await this.weightOf(tx, tenantId, order, input, adapter),
      areaCode: courierArea?.areaCode ?? null,
      areaName: courierArea?.name ?? null,
      quantity: await this.fulfilment.quantityWithin(tx, tenantId, order.id),
      // Read agreed 2026-11-06: what the goods are worth, before the delivery charge.
      goodsValue: Math.max(0, Number(order.grandTotal) - Number(order.deliveryCharge)).toFixed(2),
    };
  }

  /** CRR-30: what to change, in words that name the courier and its limit. */
  private limitError(key: MessageKey, adapter: CourierAdapter, limit?: number): ApiError {
    return new ApiError('conflict', key, { courierKey: adapter.key, limit }, undefined, {
      courier: adapter.name,
      limit: limit ?? 0,
    });
  }

  /** Steadfast refuses a repeated invoice: the order's own number, and a suffix only once a booking of it was cancelled. */
  private async invoiceOf(tx: Transaction, tenantId: string, order: OrderRecord): Promise<string> {
    const cancelled = await this.store.countCancelled(tx, tenantId, order.id);
    return cancelled === 0 ? order.orderNumber : `${order.orderNumber}-${String(cancelled + 1)}`;
  }

  /** ATR-13, CMB-07: the weight staff gave, or what the order's items weigh, for a courier that takes one. */
  private async weightOf(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    input: BookOrderInput,
    adapter: CourierAdapter,
  ): Promise<string | null> {
    const range = adapter.limits.weightKg;
    if (range === null) return null;
    const weight =
      input.weightKg !== undefined
        ? input.weightKg.toFixed(3)
        : await this.fulfilment.weightWithin(tx, tenantId, order.id);
    if (weight === null) throw this.limitError('CourierWeightNeeded', adapter);
    if (Number(weight) < range.min || Number(weight) > range.max) {
      throw this.limitError('CourierWeightOutOfRange', adapter, range.max);
    }
    return weight;
  }

  /** CRR-19: bookings a shop may make in a minute. */
  private async takeCall(tenantId: string): Promise<void> {
    const verdict = await this.limitStore.take(
      `courier-book:${tenantId}`,
      COURIER_CALLS_PER_MINUTE,
      MINUTE_MS,
      this.clock(),
    );
    if (!verdict.allowed) {
      throw new ApiError(
        'rate_limited',
        'CourierCallsPerMinute',
        {},
        Math.ceil(verdict.resetMs / 1000),
      );
    }
  }

  /** CRR-07: a refusal in the courier's own short words, for staff; our own words if it sent none (SEC-16 as amended). */
  private refusalError(adapter: CourierAdapter, refusal: CourierRefusal): ApiError {
    const { message } = refusal;
    return new ApiError(
      'conflict',
      message === null ? 'CourierRefusedNoReason' : 'CourierRefused',
      { courierKey: adapter.key, courierMessage: message },
      undefined,
      { courier: adapter.name, message: message ?? '' },
    );
  }

  /**
   * CRR-07, PYG-04, QTA-01: the booking came to nothing, so the order is as it was: the hold ends with the state and the place it took
   * goes back. Nothing was charged and no stock moved.
   */
  private endRefused(
    tenantId: string,
    parcel: Pick<SelectCourierParcel, 'id' | 'orderId'>,
    refusal: CourierRefusal | null,
    who?: ResolvedActor,
  ): Promise<void> {
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, parcel.orderId);
      const held = await this.lockedOwn(tx, tenantId, parcel.id);
      // Close-out (A6): one settled meanwhile, by staff or a message, stays as it was settled.
      if (held.state !== ParcelState.Booking && held.state !== ParcelState.Unknown) return;
      await this.store.updateParcel(
        tx,
        tenantId,
        held.id,
        { state: ParcelState.Refused, refusal: refusal?.message ?? null, nextLookUpAt: null },
        this.clock(),
      );
      if (held.tookPlace) await this.fulfilment.giveBackPlaceWithin(tx, tenantId, order.id);
      if (who) {
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.ParcelSettled,
          { type: 'order', id: order.id },
          { orderNumber: order.orderNumber, outcome: 'not_booked' },
        );
      }
    });
  }

  /** CRR-18, D6-11: the answer was lost, so the parcel may exist; everything stays set aside until that's settled. */
  private async markUnknown(
    tenantId: string,
    parcelId: string,
    adapter: CourierAdapter,
  ): Promise<void> {
    const now = this.clock();
    await this.store.run(tenantId, (tx) =>
      this.store.updateParcel(
        tx,
        tenantId,
        parcelId,
        {
          state: ParcelState.Unknown,
          nextLookUpAt:
            adapter.lookUp !== undefined ? new Date(now.getTime() + FIRST_LOOK_UP_AFTER_MS) : null,
        },
        now,
      ),
    );
  }

  /** §3.6: written first and alone: a parcel the courier accepted is never lost, whatever happens to the settling. */
  private async markAccepted(
    tenantId: string,
    parcelId: string,
    accepted: AcceptedParcel,
  ): Promise<void> {
    await this.store.run(tenantId, (tx) =>
      this.store.updateParcel(
        tx,
        tenantId,
        parcelId,
        {
          state: ParcelState.Booked,
          consignmentId: accepted.consignmentId,
          trackingCode: accepted.trackingCode,
          courierStatus: accepted.courierStatus,
          deliveryCharge: accepted.deliveryCharge,
        },
        this.clock(),
      ),
    );
  }

  /** The order takes the parcel. A problem staff can clear is kept on the parcel and shown; anything else waits for the minute pass. */
  private async settleAccepted(
    tenantId: string,
    parcelId: string,
    orderId: string,
    who: ResolvedActor,
    passed: HandlingPassed | null,
  ): Promise<OrderView> {
    try {
      return await this.settleOrThrow(tenantId, parcelId, orderId, who, passed);
    } catch (error) {
      if (error instanceof ApiError) {
        this.logger.warn(`parcel ${parcelId} accepted, not settled: ${error.messageKey}`);
        await this.store.run(tenantId, (tx) =>
          this.store.updateParcel(
            tx,
            tenantId,
            parcelId,
            { settleProblem: error.messageKey },
            this.clock(),
          ),
        );
      } else {
        this.logger.error(`parcel ${parcelId} accepted, not settled`, error as Error);
      }
      return this.viewOf(tenantId, orderId);
    }
  }

  /** CRR-06: one transaction: the parcel stops holding, the order moves, counts, charges and gives up its stock, once. */
  private settleOrThrow(
    tenantId: string,
    parcelId: string,
    orderId: string,
    who: ResolvedActor,
    passed: HandlingPassed | null = null,
  ): Promise<OrderView> {
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      const parcel = await this.lockedOwn(tx, tenantId, parcelId);
      if (parcel.state !== ParcelState.Booked || parcel.settledAt !== null) {
        return this.orders.viewWithin(tx, tenantId, order, []);
      }
      const now = this.clock();
      // Before the charge: a held fee stops counting as held the moment it is the one being charged.
      await this.store.updateParcel(
        tx,
        tenantId,
        parcel.id,
        { settledAt: now, settleProblem: null },
        now,
      );
      const adapter = this.registry.of(parcel.courierKey);
      const name = adapter?.name ?? parcel.courierKey;
      const updated = await this.fulfilment.settleBookingWithin(
        tx,
        tenantId,
        order,
        {
          courierName: name,
          trackingCode: parcel.trackingCode ?? parcel.consignmentId,
          trackingLink:
            parcel.trackingCode !== null
              ? (adapter?.trackingLink(parcel.trackingCode) ?? null)
              : null,
          note: [name, parcel.consignmentId, parcel.trackingCode]
            .filter((part) => part !== null)
            .join(' · '),
          serials: parcel.serials,
          fee: parcel.feeRates !== null ? { amount: parcel.feeHeld, ...parcel.feeRates } : null,
          bookedBy: parcel.bookedBy,
        },
        who,
        now,
      );
      return this.orders.viewWithin(tx, tenantId, updated, [], passed);
    });
  }

  /** D6-11: staff read the IDs from the courier's panel: for a lost answer, or for a parcel found without them. */
  private async settleWithIds(
    tenantId: string,
    parcel: SelectCourierParcel,
    orderId: string,
    ids: { consignmentId: string; trackingCode: string | null },
    who: ResolvedActor,
  ): Promise<OrderView> {
    const settledBefore = await this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      // Close-out (A6): read again under its lock, as a look-up or a message may have settled it meanwhile.
      const held = await this.lockedOwn(tx, tenantId, parcel.id);
      const fillable =
        held.state === ParcelState.Unknown ||
        (held.state === ParcelState.Booked && held.consignmentId === null);
      if (!fillable) throw new ApiError('conflict', 'ParcelNothingToSettle', {});
      await this.store.updateParcel(
        tx,
        tenantId,
        parcel.id,
        {
          state: ParcelState.Booked,
          consignmentId: ids.consignmentId,
          trackingCode: ids.trackingCode,
          nextLookUpAt: null,
        },
        this.clock(),
      );
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ParcelSettled,
        { type: 'order', id: order.id },
        { orderNumber: order.orderNumber, outcome: 'booked', consignmentId: ids.consignmentId },
      );
      if (held.settledAt === null) return false;
      // Close-out (A3): it settled without its IDs, so the order's tracking takes them now.
      await this.fulfilment.fillTrackingWithin(
        tx,
        tenantId,
        order,
        this.trackingOf(held.courierKey, ids),
      );
      return true;
    });
    if (settledBefore) return this.viewOf(tenantId, orderId);
    return this.settleOrThrow(tenantId, parcel.id, orderId, who);
  }

  /** The order's live parcel if there is one to call off, and whether it has been booked; an open booking has to settle first. */
  private parcelToCancel(
    tenantId: string,
    orderId: string,
  ): Promise<{ parcel: SelectCourierParcel | null; booked: boolean }> {
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      this.refuseOffItsWay(order);
      const live = await this.store.liveParcel(tx, tenantId, order.id);
      if (live !== null && live.state !== ParcelState.Booked) {
        throw new ApiError('conflict', 'OrderBookingOpen', { parcelState: live.state });
      }
      return { parcel: live, booked: order.fulfillmentStatus === FulfillmentStatus.Processing };
    });
  }

  /**
   * CRR-28, D6-8: where the courier has a cancel call it is made, and its refusal shown; otherwise staff must say they did it in the
   * courier's panel. A parcel whose connection is gone can only be cancelled that way.
   */
  private async callOffAtCourier(
    tenantId: string,
    orderId: string,
    parcel: SelectCourierParcel,
    courierCancelled: boolean | undefined,
  ): Promise<void> {
    // Read agreed 2026-11-05: the courier has already said it is coming back, so there is nothing to call off.
    if (parcel.reading === ParcelReading.Returning) return;
    // Agreed 2026-11-07: staff saying it is cancelled in the courier's panel is taken, and the courier isn't asked again. Without
    // that, a courier that can cancel is asked, and its refusal, in its own words, keeps the booking.
    if (courierCancelled === true) return;
    const opened = await this.store.run(tenantId, (tx) =>
      this.connections.openedWithin(tx, tenantId, parcel.courierKey),
    );
    const adapter = opened?.adapter;
    const cancel = adapter?.cancel?.bind(adapter);
    if (!opened || !adapter || !cancel || parcel.consignmentId === null) {
      throw new ApiError('conflict', 'ParcelCancelConfirmNeeded', {
        courierKey: parcel.courierKey,
      });
    }
    const { account } = opened;
    const { consignmentId } = parcel;
    let answer: CancelAnswer;
    try {
      answer = await this.calls.run(
        adapter,
        {
          tenantId,
          connectionId: account.connectionId,
          orderId,
          action: CourierCallAction.Cancel,
        },
        () => cancel(account, consignmentId),
      );
    } catch (error) {
      // Read agreed 2026-11-06: anything but a clear yes is no answer, so staff confirm in its panel, as for a courier with no call.
      if (error instanceof CircuitOpen || error instanceof CourierNoAnswer) {
        throw new ApiError('conflict', 'ParcelCancelConfirmNeeded', {
          courierKey: parcel.courierKey,
          courierNotAnswering: true,
        });
      }
      throw error;
    }
    if (answer.outcome === 'refused') throw this.refusalError(adapter, answer.refusal);
  }

  /** A parcel called off that never settled was never handled: no fee was charged, and its place goes back. */
  private async endCancelled(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    parcel: SelectCourierParcel,
  ): Promise<void> {
    await this.store.updateParcel(
      tx,
      tenantId,
      parcel.id,
      { state: ParcelState.Cancelled, nextLookUpAt: null },
      this.clock(),
    );
    if (parcel.settledAt === null && parcel.tookPlace) {
      await this.fulfilment.giveBackPlaceWithin(tx, tenantId, order.id);
    }
  }

  /** ORD-52: what has left the shop comes back by a return, never a cancellation. */
  private refuseOffItsWay(order: OrderRecord): void {
    if (order.statusOverride === StatusOverride.Cancelled) {
      throw new ApiError('conflict', 'OrderIsCancelled', {});
    }
    if (
      order.fulfillmentStatus !== FulfillmentStatus.Unfulfilled &&
      order.fulfillmentStatus !== FulfillmentStatus.Processing
    ) {
      throw new ApiError('conflict', 'OrderShippedReturnInstead', {});
    }
  }

  /** As the order's tracking shows a parcel's IDs: its tracking code, else its consignment, with the courier's link. */
  trackingOf(
    courierKey: CourierKey,
    ids: { consignmentId: string; trackingCode: string | null },
  ): { trackingCode: string; trackingLink: string | null } {
    return {
      trackingCode: ids.trackingCode ?? ids.consignmentId,
      trackingLink:
        ids.trackingCode !== null
          ? (this.registry.of(courierKey)?.trackingLink(ids.trackingCode) ?? null)
          : null,
    };
  }

  private async lockedOwn(
    tx: Transaction,
    tenantId: string,
    parcelId: string,
  ): Promise<SelectCourierParcel> {
    const parcel = await this.store.lockParcel(tx, tenantId, parcelId);
    if (!parcel) throw new ApiError('conflict', 'ParcelNothingToSettle', {});
    return parcel;
  }

  private viewOf(tenantId: string, orderId: string): Promise<OrderView> {
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      return this.orders.viewWithin(tx, tenantId, order, []);
    });
  }
}
