// A stand-in for Steadfast's API (Phase 6 Slice 6.1), behaving as its panel's guide says: a key pair on every call, a repeated invoice
// refused, status by invoice, failures said in a 200's body, and no sandbox behind it. Injected as COURIER_FETCH, so nothing
// leaves the machine. It counts the calls it gets: exit criterion 7 proves the rules on calls from these.

import { createHmac } from 'node:crypto';

export const RIGHT_API_KEY = 'steadfast-api-key-1234';
export const RIGHT_SECRET_KEY = 'steadfast-secret-key-5678';

export interface SteadfastCall {
  method: string;
  path: string;
  apiKey: string | null;
  secretKey: string | null;
  body: Record<string, unknown> | null;
}

export interface FakeConsignment {
  consignmentId: number;
  invoice: string;
  body: Record<string, unknown>;
}

interface Behaviour {
  /** Booking is refused with this status and body. */
  refuseBooking?: { status: number; body: unknown };
  /** A booking times out: `madeIt` says whether the parcel was made anyway. */
  bookingTimesOut?: { madeIt: boolean };
  /** A booking answers a server error: `madeIt` as above. */
  bookingServerError?: { madeIt: boolean };
  /** A booking answers a success with no consignment in it. */
  bookingSuccessWithoutConsignment?: boolean;
  /** A booking answers a web page, as a proxy would. */
  bookingPage?: boolean;
  /** Everything times out, as if the courier were down. */
  down?: boolean;
  /** Asking by invoice gets no answer. */
  lookUpTimesOut?: boolean;
  /** Called with each booking while it is out with the courier. */
  whileBooking?: () => Promise<void>;
  /** Asking after a parcel answers 401 though the keys are good, as its guide says a parcel on another profile does. */
  otherProfile?: boolean;
  /** Every key is refused from now on. */
  keysRevoked?: boolean;
}

/** A message as Steadfast's guide says it signs one: a hex HMAC-SHA256 of the raw body, keyed with the pasted token. */
export function signatureOf(body: string, token: string): string {
  return createHmac('sha256', token).update(body).digest('hex');
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export class FakeSteadfast {
  readonly calls: SteadfastCall[] = [];
  readonly consignments: FakeConsignment[] = [];
  behaviour: Behaviour = {};
  /** Where each consignment stands, by its number; its answers read from here. */
  readonly statuses = new Map<string, string>();
  private nextId = 1424107;

  /** The stand-in for `fetch`. */
  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const headers = new Headers(init?.headers);
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    this.calls.push({
      method: init?.method ?? 'GET',
      path,
      apiKey: headers.get('Api-Key'),
      secretKey: headers.get('Secret-Key'),
      body,
    });
    if (this.behaviour.down) throw new DOMException('timed out', 'TimeoutError');
    if (
      this.behaviour.keysRevoked === true ||
      headers.get('Api-Key') !== RIGHT_API_KEY ||
      headers.get('Secret-Key') !== RIGHT_SECRET_KEY
    ) {
      return reply(401, { status: 401, message: 'Unauthorized.' });
    }
    if (path === '/get_balance') return reply(200, { status: 200, current_balance: 0 });
    if (path === '/create_order' && body !== null) return this.createOrder(body);
    if (path.startsWith('/status_by_invoice/')) {
      return this.statusByInvoice(decodeURIComponent(path.slice('/status_by_invoice/'.length)));
    }
    if (path.startsWith('/status_by_cid/')) {
      if (this.behaviour.otherProfile === true) {
        return reply(401, { status: 401, message: 'Unauthorized.' });
      }
      const status = this.statuses.get(decodeURIComponent(path.slice('/status_by_cid/'.length)));
      return status === undefined
        ? reply(404, { status: 404, message: 'Consignment not found.' })
        : reply(200, { status: 200, delivery_status: status });
    }
    return reply(404, { status: 404, message: 'Not found.' });
  };

  /** How many calls went to this path, any path when left out. */
  callsTo(path?: string): SteadfastCall[] {
    return path === undefined ? this.calls : this.calls.filter((call) => call.path === path);
  }

  bookings(): SteadfastCall[] {
    return this.callsTo('/create_order');
  }

  reset(): void {
    this.calls.length = 0;
    this.consignments.length = 0;
    this.statuses.clear();
    this.behaviour = {};
  }

  /** The calls asking where a parcel stands. */
  statusCalls(): SteadfastCall[] {
    return this.calls.filter((call) => call.path.startsWith('/status_by_'));
  }

  private async createOrder(body: Record<string, unknown>): Promise<Response> {
    if (this.behaviour.whileBooking) await this.behaviour.whileBooking();
    const { refuseBooking, bookingTimesOut, bookingServerError } = this.behaviour;
    if (refuseBooking) return reply(refuseBooking.status, refuseBooking.body);
    if (this.behaviour.bookingPage) {
      return new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    const invoice = String(body['invoice']);
    // Its guide: a repeated invoice is refused, so a retry can't double-book.
    if (this.consignments.some((each) => each.invoice === invoice)) {
      return reply(400, {
        status: 400,
        errors: { invoice: ['The invoice has already been taken.'] },
      });
    }
    if (bookingTimesOut) {
      if (bookingTimesOut.madeIt) this.make(invoice, body);
      throw new DOMException('timed out', 'TimeoutError');
    }
    if (bookingServerError) {
      if (bookingServerError.madeIt) this.make(invoice, body);
      return reply(500, { status: 500, message: 'Server Error' });
    }
    if (this.behaviour.bookingSuccessWithoutConsignment) {
      this.make(invoice, body);
      return reply(200, { status: 200, message: 'Consignment has been created successfully.' });
    }
    const made = this.make(invoice, body);
    return reply(200, {
      status: 200,
      message: 'Consignment has been created successfully.',
      consignment: {
        consignment_id: made.consignmentId,
        invoice,
        tracking_code: `TRK${String(made.consignmentId)}`,
        recipient_name: body['recipient_name'],
        recipient_phone: body['recipient_phone'],
        recipient_address: body['recipient_address'],
        cod_amount: body['cod_amount'],
        status: 'in_review',
        note: body['note'] ?? null,
      },
    });
  }

  private statusByInvoice(invoice: string): Response {
    if (this.behaviour.lookUpTimesOut) throw new DOMException('timed out', 'TimeoutError');
    return this.consignments.some((each) => each.invoice === invoice)
      ? reply(200, { status: 200, delivery_status: 'in_review' })
      : reply(404, { status: 404, message: 'Consignment not found.' });
  }

  private make(invoice: string, body: Record<string, unknown>): FakeConsignment {
    const made = { consignmentId: this.nextId, invoice, body };
    this.nextId += 1;
    this.consignments.push(made);
    this.statuses.set(String(made.consignmentId), 'in_review');
    return made;
  }
}
