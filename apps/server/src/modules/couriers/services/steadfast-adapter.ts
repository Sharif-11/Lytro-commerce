import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  COURIER_MESSAGE_MAX_LENGTH,
  COURIER_PAYOUT_ID_MAX_LENGTH,
  COURIER_PAYOUT_METHOD_MAX_LENGTH,
  CourierKey,
  ParcelReading,
} from '@lytronix/validators';
import {
  CourierNoAnswer,
  type BookingAnswer,
  type ConnectionAnswer,
  type CourierAccount,
  type CourierAdapter,
  type CourierLimits,
  type CourierNews,
  type CourierRefusal,
  type FraudScoreAnswer,
  type ListedPayout,
  type LookUpAnswer,
  type MessageHeaders,
  type PaidParcel,
  type ParcelBooking,
  type PayoutAnswer,
  type PayoutsAnswer,
  type TrackAnswer,
} from '../ports/courier-adapter';
import { COURIER_FETCH, STEADFAST_URL } from '../tokens';
import {
  bodyOf,
  callCourier,
  codeOf,
  headerOf,
  moneyOf,
  refusalWords,
  statusOf,
  textOf,
  timeOf,
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
// Slice 6.5, read agreed 2026-11-06: its guide names this event and not what it carries, so until a real one shows that, it moves
// nothing and only the names of its fields are logged; payouts come from the night run's read of its list.
const PAYMENT_EVENT = 'payment_request';
// Slice 6.5: its live payout list (2026-11-06) ran oldest first with no page count, 8 on its one page, so a page holds at least 8.
const PAYOUT_PAGE_AT_LEAST = 8;
const PAID = 'paid';

/** A courier's words as they are kept: plain text on one line, within what's stored. */
function wordsOf(words: string | null): string | null {
  return refusalWords(words, COURIER_MESSAGE_MAX_LENGTH);
}
const TRACKING_PAGE = 'https://steadfast.com.bd/t/';
// Its body says what happened; a 200 can hide a failure there (Appendix A).
const SUCCESS = '200';
// FRD-01 (Slice 7.5): the most of a courier's own words kept for a size of record or a fraud category, and how many
// categories.
const FRAUD_WORD_MAX_LENGTH = 20;
const FRAUD_CATEGORY_MAX_LENGTH = 60;
const FRAUD_CATEGORIES_MAX = 10;

/** A whole percentage, as a number or its text, from 0 to 100; null for anything else, as for a phone it has no record of. */
function percentOf(value: unknown): number | null {
  const text = typeof value === 'string' ? value.trim().replace(/%$/, '') : value;
  const number =
    typeof text === 'number' ? text : typeof text === 'string' && text !== '' ? Number(text) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number) : null;
}

/** A short word or figure of the courier's, as a number or text, within what's kept. */
function shortOf(value: unknown, max: number): string | null {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string') return null;
  return refusalWords(text, max);
}

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
  readonly accountField = 'apiKey';
  readonly limits = LIMITS;
  readonly needsArea = false;
  readonly needsThana = false;
  readonly payoutPageAtLeast = PAYOUT_PAGE_AT_LEAST;
  private readonly logger = new Logger('Steadfast');

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
          paid: false,
          payoutId: null,
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
    if (event === PAYMENT_EVENT) {
      this.logger.log(
        `a ${PAYMENT_EVENT} message, with fields: ${Object.keys(reply).sort().join(', ')}`,
      );
    }
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
      paid: false,
      payoutId: null,
    };
  }

  /**
   * CRR-17 (Slice 6.5): one page of its payouts, oldest first, as its live list showed (2026-11-06). A payout is read only once
   * its label says paid; one with no ID or no readable amount is left out and logged, never guessed at.
   */
  async payouts(account: CourierAccount, page: number): Promise<PayoutsAnswer> {
    const response = await this.request(account, 'GET', `/payments?page=${String(page)}`);
    const rows = response.body?.['payments'];
    if (!this.succeeded(response) || !Array.isArray(rows)) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    const payouts: ListedPayout[] = [];
    let unreadable = 0;
    for (const row of rows) {
      const payout = this.payoutOf(bodyOf(row));
      if (payout === null) unreadable += 1;
      else payouts.push(payout);
    }
    if (unreadable > 0) this.logger.warn(`${String(unreadable)} payouts could not be read`);
    return { outcome: 'found', payouts };
  }

  /** CRR-17 (Slice 6.5): the parcels one payout settled. It names no amount for any one of them. */
  async payout(account: CourierAccount, payoutId: string): Promise<PayoutAnswer> {
    const response = await this.request(
      account,
      'GET',
      `/payments/${encodeURIComponent(payoutId)}`,
    );
    const payment = bodyOf(response.body?.['payment']);
    const rows = payment?.['consignments'];
    if (this.succeeded(response) && Array.isArray(rows)) {
      const parcels: PaidParcel[] = rows
        .map((row) => bodyOf(row))
        .filter((row): row is CourierReply => row !== null)
        .map((row) => ({
          consignmentId: codeOf(row, 'consignment_id'),
          invoice: textOf(row, 'invoice'),
        }))
        .filter((parcel) => parcel.consignmentId !== null || parcel.invoice !== null);
      return { outcome: 'found', parcels };
    }
    if (response.status === 404 || codeOf(response.body, 'status') === '404') {
      return { outcome: 'not_found' };
    }
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  private payoutOf(row: CourierReply | null): ListedPayout | null {
    const payoutId = codeOf(row, 'payment_id');
    const amount = moneyOf(row, 'amount');
    if (payoutId === null || payoutId.length > COURIER_PAYOUT_ID_MAX_LENGTH || amount === null) {
      return null;
    }
    const paidAt = timeOf(textOf(row, 'paid_at'));
    return {
      payoutId,
      amount,
      charges: moneyOf(row, 'charges'),
      total: moneyOf(row, 'total'),
      method: refusalWords(textOf(row, 'method'), COURIER_PAYOUT_METHOD_MAX_LENGTH),
      paid: statusOf(textOf(row, 'status_label')) === PAID && paidAt !== null,
      paidAt,
      madeAt: timeOf(textOf(row, 'created_at')),
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

  /**
   * FRD-01, D7-52 (Slice 7.5, tried with a live key 2026-11-07): its record of a phone across its merchants. It answers
   * whole percentages, the size of the record and merchants' reports; its counts and its own score are null. An answer
   * without the percentages' field is no answer: its shape has changed.
   */
  async fraudScore(account: CourierAccount, phone: string): Promise<FraudScoreAnswer> {
    const response = await this.request(
      account,
      'GET',
      `/fraud_check/score/${encodeURIComponent(phone)}`,
    );
    const body = response.body;
    if (!this.succeeded(response) || body === null) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    if (!('delivery_ratio' in body)) throw new CourierNoAnswer('a fraud score without its figures');
    const said = body['fraud_categories'];
    const categories = (Array.isArray(said) ? said : [])
      .map((category) => {
        const named = bodyOf(category);
        return shortOf(
          named ? (named['name'] ?? named['label']) : category,
          FRAUD_CATEGORY_MAX_LENGTH,
        );
      })
      .filter((category): category is string => category !== null)
      .slice(0, FRAUD_CATEGORIES_MAX);
    const reports = Number(codeOf(body, 'total_reports') ?? 0);
    return {
      outcome: 'answered',
      figures: {
        deliveredPercent: percentOf(body['delivery_ratio']),
        cancelledPercent: percentOf(body['cancellation_ratio']),
        returnedPercent: percentOf(body['return_ratio']),
        volumeBand: shortOf(body['volume_band'], FRAUD_WORD_MAX_LENGTH),
        volumeRange: shortOf(body['volume_range'], FRAUD_WORD_MAX_LENGTH),
        reports: Number.isInteger(reports) && reports >= 0 ? reports : 0,
        doubtful: body['doubtful_reports'] === true,
        categories,
      },
    };
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
