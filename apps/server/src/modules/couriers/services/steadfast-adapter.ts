import { Inject, Injectable } from '@nestjs/common';
import { CourierKey } from '@lytronix/validators';
import {
  CourierNoAnswer,
  type BookingAnswer,
  type ConnectionAnswer,
  type CourierAccount,
  type CourierAdapter,
  type CourierLimits,
  type CourierRefusal,
  type LookUpAnswer,
  type ParcelBooking,
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
};
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
