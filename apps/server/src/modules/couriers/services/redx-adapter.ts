import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { COURIER_MESSAGE_MAX_LENGTH, CourierKey, ParcelReading } from '@lytronix/validators';
import {
  CourierNoAnswer,
  PICKUP_STORE_ID,
  type AreasAnswer,
  type BookingAnswer,
  type CancelAnswer,
  type ConnectionAnswer,
  type CourierAccount,
  type CourierAdapter,
  type CourierLimits,
  type CourierNews,
  type CourierRefusal,
  type ParcelBooking,
  type StoresAnswer,
  type TrackAnswer,
} from '../ports/courier-adapter';
import { COURIER_FETCH, REDX_URL } from '../tokens';
import {
  bodyOf,
  callCourier,
  codeOf,
  refusalWords,
  statusOf,
  textOf,
  timeOf,
  type CourierReply,
  type CourierResponse,
} from './courier-http';

const FIELDS = ['apiToken'] as const;
// D6-14. Its document gives no lengths or weights, and its sandbox took 600 characters and 25 kg, so these are Lytro's own.
const LIMITS: CourierLimits = {
  invoiceMax: 100,
  nameMax: 100,
  phoneDigits: 11,
  addressMax: 500,
  noteMax: 500,
  weightKg: { min: 0, max: 1000 },
  // Its document names no limit.
  callsPerMinute: 30,
};
const CANCELLED = 'cancelled';
const PARTLY = 'partial_delivery';
// CRR-29, read agreed 2026-11-06: `ready-for-delivery` is "received from the merchant", the point it has the parcel. A hold, a changed area
// and a parcel coming back show and move nothing. Being paid is Slice 6.5's (CRR-12), so it is no status here.
const READINGS: Readonly<Record<string, ParcelReading>> = {
  pickup_pending: ParcelReading.Booked,
  ready_for_delivery: ParcelReading.WithCourier,
  delivery_in_progress: ParcelReading.WithCourier,
  delivered: ParcelReading.Delivered,
  agent_hold: ParcelReading.Hold,
  agent_area_change: ParcelReading.Hold,
  agent_returning: ParcelReading.Returning,
  returned: ParcelReading.Returning,
  cancelled: ParcelReading.Returning,
};
const OTHER_STATUSES: ReadonlySet<string> = new Set(['paid']);

function wordsOf(words: string | null): string | null {
  return refusalWords(words, COURIER_MESSAGE_MAX_LENGTH);
}

/** A part delivery shows in `delivery_type`, not `status` (Appendix A), so the two make one reading. */
function readingOf(status: string | null, deliveryType: string | null): ParcelReading | null {
  if (status === null) return null;
  const reading = READINGS[status] ?? null;
  return reading === ParcelReading.Delivered && deliveryType === PARTLY
    ? ParcelReading.PartlyDelivered
    : reading;
}

/** Its refusal: the first of its `validation_errors`, then its `message`. */
function refusalOf(response: CourierResponse): CourierRefusal {
  const errors = response.body?.['validation_errors'];
  let words: string | null = null;
  if (Array.isArray(errors)) {
    const first = bodyOf(errors[0]);
    const [named] = first ? Object.values(first) : [];
    words = typeof named === 'string' ? named : null;
  }
  return {
    message: refusalWords(words ?? textOf(response.body, 'message')),
    login: response.status === 401 || response.status === 403,
  };
}

/**
 * CRR-01, CRR-06, CRR-28, CUS-10, CUS-12 (Phase 6 Slice 6.4, read agreed 2026-11-06): RedX, from its OpenAPI document. Its sandbox is a
 * canned mock, one area and one tracking ID for every booking, so most of this is untried. One token per shop. Every booking needs one
 * of its own areas and a declared value; its pickup store is optional. It can't be asked by our number, so a lost answer goes to staff.
 * Its messages carry no signature: the address's token is the only proof (read agreed 2026-11-06). It is the one courier with a cancel
 * call, and only a clear success counts.
 */
@Injectable()
export class RedxAdapter implements CourierAdapter {
  readonly key = CourierKey.RedX;
  readonly name = 'RedX';
  readonly credentialFields = FIELDS;
  readonly limits = LIMITS;
  readonly needsArea = true;
  readonly needsThana = false;
  readonly storeOptional = true;

  constructor(
    @Inject(REDX_URL) private readonly baseUrl: string,
    @Inject(COURIER_FETCH) private readonly send: typeof fetch,
  ) {}

  /** A harmless read, which needs the token and creates nothing. */
  async testConnection(account: CourierAccount): Promise<ConnectionAnswer> {
    const response = await this.request(account, 'GET', '/pickup/stores');
    if (this.succeeded(response) && response.body !== null) return { outcome: 'accepted' };
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  async pickupStores(account: CourierAccount): Promise<StoresAnswer> {
    const response = await this.request(account, 'GET', '/pickup/stores');
    if (!this.succeeded(response) || response.body === null) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    const rows = response.body['pickup_stores'];
    const stores = (Array.isArray(rows) ? rows : []).map((row: unknown) => {
      const store = bodyOf(row);
      return {
        id: codeOf(store, 'id') ?? '',
        name: textOf(store, 'name') ?? '',
        address: textOf(store, 'address'),
        active: true,
      };
    });
    return { outcome: 'found', stores: stores.filter((store) => store.id !== '') };
  }

  /** CUS-10: its whole list at once; 2,866 areas on 2026-11-06. */
  async listAreas(account: CourierAccount): Promise<AreasAnswer> {
    const response = await this.request(account, 'GET', '/areas');
    const rows = response.body?.['areas'];
    if (!this.succeeded(response) || !Array.isArray(rows)) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    const areas = rows.flatMap((row: unknown) => {
      const area = bodyOf(row);
      const areaCode = codeOf(area, 'id');
      const name = textOf(area, 'name');
      const districtName = textOf(area, 'district_name');
      if (areaCode === null || name === null || districtName === null) return [];
      return [{ areaCode, name, districtName, postCode: codeOf(area, 'post_code') }];
    });
    return { outcome: 'found', areas };
  }

  /** Weight in grams, cash as it takes it, and the goods' worth as the declared value it requires. */
  async book(account: CourierAccount, booking: ParcelBooking): Promise<BookingAnswer> {
    const store = account.credentials[PICKUP_STORE_ID];
    const response = await this.request(account, 'POST', '/parcel', {
      customer_name: booking.recipientName,
      customer_phone: booking.recipientPhone,
      delivery_area: booking.areaName ?? '',
      delivery_area_id: Number(booking.areaCode),
      customer_address: booking.recipientAddress,
      merchant_invoice_id: booking.invoice,
      cash_collection_amount: booking.cod,
      parcel_weight: Math.max(1, Math.round(Number(booking.weightKg ?? '0') * 1000)),
      value: Number(booking.goodsValue),
      ...(booking.note !== null ? { instruction: booking.note } : {}),
      ...(store ? { pickup_store_id: Number(store) } : {}),
    });
    if (!this.succeeded(response)) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    const trackingId = codeOf(response.body, 'tracking_id');
    // Called a success but naming no parcel: it may exist, so it goes to staff rather than counting as refused.
    if (trackingId === null) throw new CourierNoAnswer('a success without a tracking id');
    return {
      outcome: 'accepted',
      parcel: {
        consignmentId: trackingId,
        trackingCode: trackingId,
        courierStatus: null,
        deliveryCharge: null,
      },
    };
  }

  trackingLink(): null {
    return null;
  }

  /** CRR-14, CRR-15: one parcel's status and how it was delivered, by its number. */
  async track(
    account: CourierAccount,
    parcel: { consignmentId: string | null; invoice: string },
  ): Promise<TrackAnswer> {
    if (parcel.consignmentId === null) return { outcome: 'not_found' };
    const response = await this.request(
      account,
      'GET',
      `/parcel/info/${encodeURIComponent(parcel.consignmentId)}`,
    );
    const info = bodyOf(response.body?.['parcel']) ?? response.body;
    const rawStatus = statusOf(textOf(info, 'status'));
    if (this.succeeded(response) && rawStatus !== null) {
      const deliveryType = statusOf(textOf(info, 'delivery_type'));
      return {
        outcome: 'found',
        news: {
          dedupeKey: `asked:${parcel.consignmentId}:${rawStatus}:${deliveryType ?? ''}`,
          event: rawStatus,
          statusEvent: !OTHER_STATUSES.has(rawStatus),
          forShopper: false,
          consignmentId: parcel.consignmentId,
          invoice: parcel.invoice,
          rawStatus,
          reading: OTHER_STATUSES.has(rawStatus) ? null : readingOf(rawStatus, deliveryType),
          messageEn: null,
          messageBn: null,
          // Read agreed 2026-11-06: staff record what came; its amount's meaning is unknown.
          cashCollected: null,
          deliveryCharge: codeOf(info, 'charge'),
          codAtCourier: null,
          happenedAt: null,
        },
      };
    }
    if (response.status === 404) return { outcome: 'not_found' };
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  /** Read agreed 2026-11-06: its messages carry no proof of their own, so finding the shop by the address's token is all there is. */
  verifyMessage(): boolean {
    return true;
  }

  /** CRR-12, CRR-13: its messages, by the fields its document names, in both languages. It sends no key of its own. */
  readMessage(rawBody: Buffer): CourierNews | null {
    let reply: CourierReply | null;
    try {
      reply = bodyOf(JSON.parse(rawBody.toString('utf8')));
    } catch {
      return null;
    }
    const rawStatus = statusOf(textOf(reply, 'status'));
    if (reply === null || rawStatus === null) return null;
    const statusEvent = !OTHER_STATUSES.has(rawStatus);
    const deliveryType = statusOf(textOf(reply, 'delivery_type'));
    const trackingId = codeOf(reply, 'tracking_number');
    const when = textOf(reply, 'timestamp');
    return {
      dedupeKey: `sent:${trackingId ?? ''}:${rawStatus}:${deliveryType ?? ''}:${when ?? createHash('sha256').update(rawBody).digest('hex')}`,
      event: rawStatus,
      statusEvent,
      // Read agreed 2026-11-05: its words about the parcel's journey may reach a shopper; being paid never does.
      forShopper: statusEvent,
      consignmentId: trackingId,
      invoice: textOf(reply, 'invoice_number'),
      rawStatus: statusEvent ? rawStatus : null,
      reading: statusEvent ? readingOf(rawStatus, deliveryType) : null,
      messageEn: wordsOf(textOf(reply, 'message_en')),
      messageBn: wordsOf(textOf(reply, 'message_bn')),
      cashCollected: null,
      deliveryCharge: null,
      codAtCourier: null,
      happenedAt: timeOf(when),
    };
  }

  /** D6-8, read agreed 2026-11-06: only a clear success cancels. A client's error is a refusal; anything else is no answer. */
  async cancel(account: CourierAccount, consignmentId: string): Promise<CancelAnswer> {
    const response = await this.request(account, 'PATCH', '/parcels', {
      entity_type: 'parcel-tracking-id',
      entity_id: consignmentId,
      update_details: {
        property_name: 'status',
        new_value: CANCELLED,
        reason: 'Cancelled by the shop',
      },
    });
    if (this.succeeded(response) && response.body?.['success'] === true) {
      return { outcome: 'cancelled' };
    }
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  private request(
    account: CourierAccount,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: CourierReply,
  ): Promise<CourierResponse> {
    return callCourier(this.send, `${this.baseUrl}${path}`, {
      method,
      headers: {
        'API-ACCESS-TOKEN': `Bearer ${account.credentials['apiToken'] ?? ''}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  private succeeded(response: CourierResponse): boolean {
    return response.status >= 200 && response.status < 300;
  }

  /** A client's error is a refusal, and 401 or 403 a refusal of the token. A server error, a page or an unclear 2xx is no answer. */
  private refusalOrThrow(response: CourierResponse): CourierRefusal {
    if (response.status < 400 || response.status >= 500) {
      throw new CourierNoAnswer(`status ${String(response.status)}`);
    }
    return refusalOf(response);
  }
}
