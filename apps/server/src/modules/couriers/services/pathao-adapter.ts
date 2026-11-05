import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CourierKey, ParcelReading } from '@lytronix/validators';
import {
  CourierNoAnswer,
  PICKUP_STORE_ID,
  type BookingAnswer,
  type ConnectionAnswer,
  type CourierAccount,
  type CourierAdapter,
  type CourierLimits,
  type CourierNews,
  type CourierRefusal,
  type LogInAnswer,
  type MessageHeaders,
  type ParcelBooking,
  type StoresAnswer,
  type TrackAnswer,
} from '../ports/courier-adapter';
import { COURIER_CLOCK, COURIER_FETCH, PATHAO_TEST_ANSWER, PATHAO_URL } from '../tokens';
import {
  bodyOf,
  callCourier,
  codeOf,
  headerOf,
  refusalWords,
  statusOf,
  textOf,
  timeOf,
  type CourierReply,
  type CourierResponse,
} from './courier-http';

// What the owner types when connecting. Only the first two are kept: the password becomes tokens (read agreed 2026-11-05).
const FIELDS = ['clientId', 'clientSecret', 'username', 'password'] as const;
// D6-14, read agreed 2026-11-05. Its document says 0.5 to 10 kg; a lighter parcel is sent as 0.5, so only the top is refused.
const LIMITS: CourierLimits = {
  invoiceMax: 100,
  nameMin: 3,
  nameMax: 100,
  phoneDigits: 11,
  addressMin: 10,
  addressMax: 220,
  // Its document gives none, and the sandbox took 600.
  noteMax: 500,
  weightKg: { min: 0, max: 10 },
  // About 60 a minute, second-hand.
  callsPerMinute: 30,
  wholeTakaCod: true,
};
const SMALLEST_WEIGHT_KG = 0.5;
const NORMAL_DELIVERY = 48;
const ITEM_PARCEL = 2;
// Well before a token ends, so a shop's parcels never meet one that has just ended.
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
const ADDRESS_TEST_EVENT = 'webhook_integration';
const SIGNATURE_HEADER = 'x-pathao-signature';
const TEST_ANSWER_HEADER = 'X-Pathao-Merchant-Webhook-Integration-Secret';

// CRR-29, D6-12, read agreed 2026-11-05: its messages name events and its status call names slugs, written differently for one step, so
// both are read the same way. `picked` is its real pickup, the point it stands behind having the parcel. A failed pickup, a failed delivery
// and a hold are all things that may still come right, so they show and move nothing.
const READINGS: Readonly<Record<string, ParcelReading>> = {
  pending: ParcelReading.Booked,
  created: ParcelReading.Booked,
  order_created: ParcelReading.Booked,
  pickup_requested: ParcelReading.Booked,
  assigned_for_pickup: ParcelReading.Booked,
  picked: ParcelReading.WithCourier,
  at_the_sorting_hub: ParcelReading.WithCourier,
  in_transit: ParcelReading.WithCourier,
  received_at_last_mile_hub: ParcelReading.WithCourier,
  assigned_for_delivery: ParcelReading.WithCourier,
  pickup_failed: ParcelReading.Hold,
  on_hold: ParcelReading.Hold,
  delivery_failed: ParcelReading.Hold,
  delivered: ParcelReading.Delivered,
  partial_delivery: ParcelReading.PartlyDelivered,
  return: ParcelReading.Returning,
  returned: ParcelReading.Returning,
  return_in_transit: ParcelReading.Returning,
  returned_to_merchant: ParcelReading.Returning,
  paid_return: ParcelReading.Returning,
  pickup_cancelled: ParcelReading.Problem,
};
// Events that say nothing of where the parcel stands. A store's events aren't about a parcel at all. Being paid is Slice 6.5's.
const OTHER_EVENTS: ReadonlySet<string> = new Set([
  'updated',
  'order_updated',
  'paid',
  'payment_invoice',
  'return_id_created',
  'store_created',
  'store_updated',
]);

/** `order.at-the-sorting-hub` and `At_the_Sorting_HUB` are one step; a store's `store.created` stays `store_created`. */
function eventOf(words: string | null): string | null {
  const plain = statusOf(words);
  return plain === null ? null : plain.replace(/^order\./, '').replace(/\./g, '_');
}

function digestOf(words: string): Buffer {
  return createHash('sha256').update(words).digest();
}

/** A refusal in the words that help: its first field error, since its `message` only says there were some. */
function refusalOf(response: CourierResponse, login: boolean): CourierRefusal {
  const errors = response.body?.['errors'];
  let words: string | null = typeof errors === 'string' ? errors : null;
  if (typeof errors === 'object' && errors !== null) {
    const [first] = Object.values(errors as Record<string, unknown>);
    const named: unknown = Array.isArray(first) ? first[0] : first;
    words = typeof named === 'string' ? named : null;
  }
  return { message: refusalWords(words ?? textOf(response.body, 'message')), login };
}

/**
 * CRR-01, CRR-06, D6-5, D6-11, D6-14 (Phase 6 Slice 6.3, read agreed 2026-11-05): Pathao, from its merchant document and tried in its
 * sandbox. A login with the merchant's password gives tokens, and a refresh token works once, so Lytro keeps the newest pair and
 * never the password. Every booking names a pickup store. It reads the area from the address, which is why the thana must be in it. It
 * takes whole taka and whole quantities. A repeated order number makes a second parcel and it can't be asked by our number, so a lost
 * answer goes to staff, and there is no cancel call. Its proof of a message is the secret itself, sent unchanged, so unlike Steadfast's
 * it doesn't cover the body. Messages and a real parcel haven't been tried: its sandbox can't send them.
 */
@Injectable()
export class PathaoAdapter implements CourierAdapter {
  readonly key = CourierKey.Pathao;
  readonly name = 'Pathao';
  readonly credentialFields = FIELDS;
  readonly limits = LIMITS;
  readonly needsArea = false;
  readonly needsThana = true;

  constructor(
    @Inject(PATHAO_URL) private readonly baseUrl: string,
    @Inject(COURIER_FETCH) private readonly send: typeof fetch,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
    @Inject(PATHAO_TEST_ANSWER) private readonly testAnswer: string | null,
  ) {}

  /** A harmless read, which needs a working token and creates nothing. */
  async testConnection(account: CourierAccount): Promise<ConnectionAnswer> {
    const response = await this.request(account, 'GET', '/stores');
    if (response.status >= 200 && response.status < 300 && response.body !== null) {
      return { outcome: 'accepted' };
    }
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  /** Read agreed 2026-11-05: the password is used here once and isn't among what comes back. */
  logIn(fields: Readonly<Record<string, string>>): Promise<LogInAnswer> {
    return this.issue(
      fields,
      {
        username: fields['username'] ?? '',
        password: fields['password'] ?? '',
        grant_type: 'password',
      },
      { clientId: fields['clientId'] ?? '', clientSecret: fields['clientSecret'] ?? '' },
    );
  }

  renewalDue(credentials: Readonly<Record<string, string>>, now: Date): boolean {
    const ends = Date.parse(credentials['expiresAt'] ?? '');
    return Number.isNaN(ends) || ends - now.getTime() < RENEW_BEFORE_MS;
  }

  /** Works once: from here on the old refresh token is refused, so what comes back must be kept in place of it. */
  renewLogin(account: CourierAccount): Promise<LogInAnswer> {
    return this.issue(
      account.credentials,
      { refresh_token: account.credentials['refreshToken'] ?? '', grant_type: 'refresh_token' },
      account.credentials,
    );
  }

  async pickupStores(account: CourierAccount): Promise<StoresAnswer> {
    const response = await this.request(account, 'GET', '/stores');
    if (response.status < 200 || response.status >= 300 || response.body === null) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    const data = bodyOf(response.body['data']);
    const rows = data?.['data'];
    const stores = (Array.isArray(rows) ? rows : []).map((row: unknown) => {
      const store = bodyOf(row);
      const active: unknown = store?.['is_active'];
      return {
        id: codeOf(store, 'store_id') ?? '',
        name: textOf(store, 'store_name') ?? '',
        address: textOf(store, 'store_address'),
        active: active === 1 || active === true,
      };
    });
    return { outcome: 'found', stores: stores.filter((store) => store.id !== '') };
  }

  /** D6-14, read agreed 2026-11-05: `booking.cod` is already whole, and a quantity like 1.5 kg goes up to the next whole number. */
  async book(account: CourierAccount, booking: ParcelBooking): Promise<BookingAnswer> {
    const response = await this.request(account, 'POST', '/orders', {
      store_id: Number(account.credentials[PICKUP_STORE_ID]),
      merchant_order_id: booking.invoice,
      recipient_name: booking.recipientName,
      recipient_phone: booking.recipientPhone,
      recipient_address: booking.recipientAddress,
      delivery_type: NORMAL_DELIVERY,
      item_type: ITEM_PARCEL,
      item_quantity: Math.max(1, Math.ceil(Number(booking.quantity))),
      item_weight: Math.max(SMALLEST_WEIGHT_KG, Number(booking.weightKg ?? SMALLEST_WEIGHT_KG)),
      amount_to_collect: Number(booking.cod),
      ...(booking.note !== null ? { special_instruction: booking.note } : {}),
    });
    if (response.status < 200 || response.status >= 300) {
      return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
    }
    const data = bodyOf(response.body?.['data']);
    const consignmentId = codeOf(data, 'consignment_id');
    // Called a success but saying no consignment: it may exist, so it goes to staff rather than counting as refused.
    if (consignmentId === null) throw new CourierNoAnswer('a success without a consignment');
    return {
      outcome: 'accepted',
      parcel: {
        consignmentId,
        trackingCode: null,
        courierStatus: statusOf(textOf(data, 'order_status')),
        deliveryCharge: codeOf(data, 'delivery_fee'),
      },
    };
  }

  /** Its tracking page needs the shopper's phone as well as the number, so it can't be linked from a code alone. */
  trackingLink(): null {
    return null;
  }

  /** CRR-14, CRR-15: one parcel's status, by its number; there's no asking by ours. Asked twice for one status, it has one key. */
  async track(
    account: CourierAccount,
    parcel: { consignmentId: string | null; invoice: string },
  ): Promise<TrackAnswer> {
    if (parcel.consignmentId === null) return { outcome: 'not_found' };
    const response = await this.request(
      account,
      'GET',
      `/orders/${encodeURIComponent(parcel.consignmentId)}/info`,
    );
    const data = bodyOf(response.body?.['data']);
    const rawStatus = eventOf(textOf(data, 'order_status_slug'));
    if (rawStatus !== null) {
      return {
        outcome: 'found',
        news: {
          dedupeKey: `asked:${parcel.consignmentId}:${rawStatus}`,
          event: rawStatus,
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
          happenedAt: timeOf(textOf(data, 'updated_at')),
        },
      };
    }
    if (response.status === 404) return { outcome: 'not_found' };
    return { outcome: 'refused', refusal: this.refusalOrThrow(response) };
  }

  /** CRR-11: its `X-PATHAO-Signature` is the secret itself, with no HMAC. Compared as digests, so the lengths don't show. */
  verifyMessage(token: string, _rawBody: Buffer, headers: MessageHeaders): boolean {
    const said = headerOf(headers, SIGNATURE_HEADER);
    return said !== null && timingSafeEqual(digestOf(said), digestOf(token));
  }

  /** CRR-27, read agreed 2026-11-05: the test it sends when an address is added. */
  isAddressTest(rawBody: Buffer): boolean {
    return textOf(this.parsed(rawBody), 'event') === ADDRESS_TEST_EVENT;
  }

  /** CRR-27: it wants this on every answer, and only insists for some accounts. */
  messageAnswerHeaders(): Record<string, string> {
    return this.testAnswer === null ? {} : { [TEST_ANSWER_HEADER]: this.testAnswer };
  }

  /** CRR-12, CRR-13: it sends no key of its own, so one message's key comes from its parcel, event and time. */
  readMessage(rawBody: Buffer): CourierNews | null {
    const reply = this.parsed(rawBody);
    const event = eventOf(textOf(reply, 'event'));
    if (reply === null || event === null) return null;
    const statusEvent = !OTHER_EVENTS.has(event);
    const reading = statusEvent ? (READINGS[event] ?? null) : null;
    const finished =
      reading === ParcelReading.Delivered || reading === ParcelReading.PartlyDelivered;
    const consignmentId = codeOf(reply, 'consignment_id');
    const when = textOf(reply, 'updated_at') ?? textOf(reply, 'timestamp');
    return {
      dedupeKey: `sent:${consignmentId ?? ''}:${event}:${when ?? createHash('sha256').update(rawBody).digest('hex')}`,
      event,
      statusEvent,
      forShopper: false,
      consignmentId,
      invoice: textOf(reply, 'merchant_order_id'),
      rawStatus: statusEvent ? event : null,
      reading,
      messageEn: null,
      messageBn: null,
      cashCollected: finished ? codeOf(reply, 'collected_amount') : null,
      deliveryCharge: codeOf(reply, 'delivery_fee'),
      codAtCourier: null,
      happenedAt: timeOf(when),
    };
  }

  private parsed(rawBody: Buffer): CourierReply | null {
    try {
      return bodyOf(JSON.parse(rawBody.toString('utf8')));
    } catch {
      return null;
    }
  }

  /** One token call. What it answers replaces the tokens in `keep`, and nothing the owner typed but `keep` carries on. */
  private async issue(
    client: Readonly<Record<string, string>>,
    grant: Record<string, string>,
    keep: Readonly<Record<string, string>>,
  ): Promise<LogInAnswer> {
    const response = await callCourier(this.send, `${this.baseUrl}/issue-token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client['clientId'] ?? '',
        client_secret: client['clientSecret'] ?? '',
        ...grant,
      }),
    });
    if (response.status >= 400 && response.status < 500) {
      // It answers a wrong login, and a refresh token already used, with 400.
      return { outcome: 'refused', refusal: refusalOf(response, true) };
    }
    const accessToken = textOf(response.body, 'access_token');
    const refreshToken = textOf(response.body, 'refresh_token');
    const lasts = Number(codeOf(response.body, 'expires_in'));
    if (
      response.status < 200 ||
      response.status >= 300 ||
      accessToken === null ||
      refreshToken === null ||
      !Number.isFinite(lasts)
    ) {
      throw new CourierNoAnswer(`status ${String(response.status)}`);
    }
    return {
      outcome: 'accepted',
      credentials: {
        ...keep,
        accessToken,
        refreshToken,
        expiresAt: new Date(this.clock().getTime() + lasts * 1000).toISOString(),
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
        Authorization: `Bearer ${account.credentials['accessToken'] ?? ''}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** A client's error is a refusal, and 401 or 403 a refusal of the token. A server error or a page is no answer. */
  private refusalOrThrow(response: CourierResponse): CourierRefusal {
    if (response.status < 400 || response.status >= 500) {
      throw new CourierNoAnswer(`status ${String(response.status)}`);
    }
    return refusalOf(response, response.status === 401 || response.status === 403);
  }
}
