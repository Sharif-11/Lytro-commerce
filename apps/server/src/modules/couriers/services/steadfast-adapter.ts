import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { COURIER_MESSAGE_MAX_LENGTH, CourierKey, ParcelReading } from '@lytronix/validators';
import {
  CourierNoAnswer,
  type BookingAnswer,
  type ConnectionAnswer,
  type CourierAccount,
  type CourierAdapter,
  type CourierLimits,
  type CourierNews,
  type CourierRefusal,
  type LookUpAnswer,
  type MessageHeaders,
  type ParcelBooking,
  type TrackAnswer,
} from '../ports/courier-adapter';
import { COURIER_FETCH, STEADFAST_URL } from '../tokens';
import {
  callCourier,
  codeOf,
  refusalWords,
  textOf,
  type CourierReply,
  type CourierResponse,
} from './courier-http';

const FIELDS = ['apiKey', 'secretKey'] as const;
// Steadfast cuts long values without saying so, so booking keeps within them (D6-14). It takes no weight.
const LIMITS: CourierLimits = {
  invoiceMax: 100,
  nameMax: 100,
  phoneDigits: 11,
  addressMax: 490,
  noteMax: 480,
  weightKg: null,
  // It allows 1,000 a minute.
  callsPerMinute: 300,
};
// CRR-29, read agreed 2026-11-05: `pending` is "with us, not yet attempted", which the first real parcel will confirm. Its
// `*_approval_pending` are the rider's word, "do not settle your books on it". `cancelled` means it comes back to the shop.
const READINGS: Readonly<Record<string, ParcelReading>> = {
  in_review: ParcelReading.Booked,
  pending: ParcelReading.WithCourier,
  hold: ParcelReading.Hold,
  delivered_approval_pending: ParcelReading.Unconfirmed,
  partial_delivered_approval_pending: ParcelReading.Unconfirmed,
  cancelled_approval_pending: ParcelReading.Unconfirmed,
  unknown_approval_pending: ParcelReading.Unconfirmed,
  delivered: ParcelReading.Delivered,
  partial_delivered: ParcelReading.PartlyDelivered,
  cancelled: ParcelReading.Returning,
  exceptional: ParcelReading.Problem,
  unknown: ParcelReading.Problem,
};
const STATUS_EVENT = 'delivery_status';
// Read agreed 2026-11-05: its words about the parcel's journey may reach a shopper; a change made in its panel never does.
const SHOPPER_EVENTS: ReadonlySet<string> = new Set([STATUS_EVENT, 'tracking_update']);
const CHANGED_EVENT = 'consignment_update';
// Its message times name no zone; it is a Bangladeshi service.
const DHAKA_OFFSET = '+06:00';

function headerOf(headers: MessageHeaders, name: string): string | null {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first !== undefined && first !== '' ? first : null;
}

/** "Partial Delivered" and `partial_delivered` are the same status: its guide and its samples differ in how they write it. */
function statusOf(words: string | null): string | null {
  return words === null
    ? null
    : words
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

function timeOf(words: string | null): Date | null {
  if (words === null) return null;
  const zoned = /[zZ]|[+-]\d{2}:?\d{2}$/.test(words);
  const at = new Date(zoned ? words : `${words.replace(' ', 'T')}${DHAKA_OFFSET}`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** A courier's words as they are kept: plain text on one line, within what's stored. */
function wordsOf(words: string | null): string | null {
  return refusalWords(words, COURIER_MESSAGE_MAX_LENGTH);
}
const TRACKING_PAGE = 'https://steadfast.com.bd/t/';
// Its body says what happened; a 200 can hide a failure there (Appendix A).
const SUCCESS = '200';

/** What a refused reply says: its message, or the first of its field errors. */
function refusalOf(response: CourierResponse): CourierRefusal {
  const errors = response.body?.['errors'];
  let words = textOf(response.body, 'message') ?? textOf(response.body, 'error');
  if (words === null && typeof errors === 'object' && errors !== null) {
    const [first] = Object.values(errors as Record<string, unknown>);
    const named: unknown = Array.isArray(first) ? first[0] : first;
    words = typeof named === 'string' ? named : null;
  }
  return {
    message: refusalWords(words),
    // A 401 can also be a parcel from another profile; booking and reading tell the two apart by a test call (§3.6).
    login: response.status === 401 || response.status === 403,
  };
}

/**
 * CRR-01, CRR-06, D6-11, D6-14 (Phase 6 Slice 6.1): Steadfast, from its merchant panel's guide; nothing here has been tried live yet
 * (checkpoint 6A). A key pair on every call and no login step. It has no sandbox, so every booking is real, and no cancel call.
 * A repeated invoice is refused, which is what lets it be asked by our number after a lost answer. A client error is a refusal
 * and anything else that can't be read is no answer. Its other calls and messages come with Slices 6.2 and 6.5.
 */
@Injectable()
export class SteadfastAdapter implements CourierAdapter {
  readonly key = CourierKey.Steadfast;
  readonly name = 'Steadfast';
  readonly credentialFields = FIELDS;
  readonly limits = LIMITS;
  readonly needsArea = false;

  constructor(
    @Inject(STEADFAST_URL) private readonly baseUrl: string,
    @Inject(COURIER_FETCH) private readonly send: typeof fetch,
  ) {}

  /** A harmless read, which needs the keys and creates nothing. */
  async testConnection(account: CourierAccount): Promise<ConnectionAnswer> {
    const response = await this.request(account, 'GET', '/get_balance');
    if (this.succeeded(response) && response.body !== null) return { outcome: 'accepted' };
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  async book(account: CourierAccount, booking: ParcelBooking): Promise<BookingAnswer> {
    const response = await this.request(account, 'POST', '/create_order', {
      invoice: booking.invoice,
      recipient_name: booking.recipientName,
      recipient_phone: booking.recipientPhone,
      recipient_address: booking.recipientAddress,
      cod_amount: Number(booking.cod),
      ...(booking.note !== null ? { note: booking.note } : {}),
    });
    if (!this.succeeded(response)) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    const consignment = response.body?.['consignment'];
    const reply =
      typeof consignment === 'object' && consignment !== null
        ? (consignment as CourierReply)
        : null;
    const consignmentId = codeOf(reply, 'consignment_id');
    // Called a success but saying no consignment: it may exist, so it goes to staff rather than counting as refused.
    if (consignmentId === null) throw new CourierNoAnswer('a success without a consignment');
    return {
      outcome: 'accepted',
      parcel: {
        consignmentId,
        trackingCode: textOf(reply, 'tracking_code'),
        courierStatus: textOf(reply, 'status'),
        deliveryCharge: null,
      },
    };
  }

  trackingLink(trackingCode: string): string {
    return `${TRACKING_PAGE}${encodeURIComponent(trackingCode)}`;
  }

  /** CRR-14, CRR-15: one parcel's status, by its number or else ours. Asked twice for one status, it has one key. */
  async track(
    account: CourierAccount,
    parcel: { consignmentId: string | null; invoice: string },
  ): Promise<TrackAnswer> {
    const path =
      parcel.consignmentId !== null
        ? `/status_by_cid/${encodeURIComponent(parcel.consignmentId)}`
        : `/status_by_invoice/${encodeURIComponent(parcel.invoice)}`;
    const response = await this.request(account, 'GET', path);
    const rawStatus = statusOf(textOf(response.body, 'delivery_status'));
    if (rawStatus !== null) {
      return {
        outcome: 'found',
        news: {
          dedupeKey: `asked:${parcel.consignmentId ?? parcel.invoice}:${rawStatus}`,
          event: STATUS_EVENT,
          statusEvent: true,
          forShopper: false,
          consignmentId: parcel.consignmentId,
          invoice: parcel.invoice,
          rawStatus,
          reading: READINGS[rawStatus] ?? null,
          messageEn: null,
          messageBn: null,
          cashCollected: null,
          deliveryCharge: null,
          codAtCourier: null,
          happenedAt: null,
        },
      };
    }
    if (response.status === 404 || codeOf(response.body, 'status') === '404') {
      return { outcome: 'not_found' };
    }
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  /** CRR-11: its `X-Signature`, a hex HMAC-SHA256 of the raw body keyed with the token. */
  verifyMessage(token: string, rawBody: Buffer, headers: MessageHeaders): boolean {
    const said = headerOf(headers, 'x-signature');
    if (said === null) return false;
    const expected = createHmac('sha256', token).update(rawBody).digest();
    const given = Buffer.from(said, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** CRR-12, CRR-13: its messages, by the fields its guide names; it resends a retry with the same `Idempotency-Key`. */
  readMessage(rawBody: Buffer, headers: MessageHeaders): CourierNews | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const reply = body as CourierReply;
    const event =
      textOf(reply, 'notification_type') ?? textOf(reply, 'event') ?? textOf(reply, 'type');
    if (event === null) return null;
    const statusEvent = event === STATUS_EVENT;
    const rawStatus = statusEvent ? statusOf(textOf(reply, 'status')) : null;
    const reading = rawStatus !== null ? (READINGS[rawStatus] ?? null) : null;
    const finished =
      reading === ParcelReading.Delivered || reading === ParcelReading.PartlyDelivered;
    return {
      dedupeKey:
        headerOf(headers, 'idempotency-key') ??
        `sent:${createHash('sha256').update(rawBody).digest('hex')}`,
      event,
      statusEvent,
      forShopper: SHOPPER_EVENTS.has(event),
      consignmentId: codeOf(reply, 'consignment_id'),
      invoice: textOf(reply, 'invoice'),
      rawStatus,
      reading,
      messageEn: wordsOf(textOf(reply, 'tracking_message')),
      messageBn: null,
      cashCollected: finished ? codeOf(reply, 'cod_amount') : null,
      deliveryCharge: codeOf(reply, 'delivery_charge'),
      codAtCourier: event === CHANGED_EVENT ? codeOf(reply, 'cod_amount') : null,
      happenedAt: timeOf(textOf(reply, 'updated_at')),
    };
  }

  /** D6-11: its answer names the parcel's status, not its IDs, so those stay for staff or a later read to fill. */
  async lookUp(account: CourierAccount, invoice: string): Promise<LookUpAnswer> {
    const response = await this.request(
      account,
      'GET',
      `/status_by_invoice/${encodeURIComponent(invoice)}`,
    );
    const courierStatus = textOf(response.body, 'delivery_status');
    if (courierStatus !== null) {
      return { outcome: 'found', consignmentId: null, trackingCode: null, courierStatus };
    }
    if (response.status === 404 || codeOf(response.body, 'status') === '404') {
      return { outcome: 'not_found' };
    }
    throw new CourierNoAnswer(`status ${String(response.status)}`);
  }

  private request(
    account: CourierAccount,
    method: 'GET' | 'POST',
    path: string,
    body?: CourierReply,
  ): Promise<CourierResponse> {
    return callCourier(this.send, `${this.baseUrl}${path}`, {
      method,
      headers: {
        'Api-Key': account.credentials['apiKey'] ?? '',
        'Secret-Key': account.credentials['secretKey'] ?? '',
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  private succeeded(response: CourierResponse): boolean {
    if (response.status < 200 || response.status >= 300) return false;
    const said = codeOf(response.body, 'status');
    return said === null || said === SUCCESS;
  }

  /** A client's error, or a failure said in the body of a 2xx, is a refusal. A server error or a page is no answer. */
  private refusalOrThrow(response: CourierResponse): CourierRefusal {
    const clientError = response.status >= 400 && response.status < 500;
    const saidInBody = response.status >= 200 && response.status < 300 && response.body !== null;
    if (!clientError && !saidInBody) throw new CourierNoAnswer(`status ${String(response.status)}`);
    return refusalOf(response);
  }
}
