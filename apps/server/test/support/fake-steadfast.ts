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

/** Slice 6.5: one payout, in the shape its live list gave (2026-11-06); its parcels come only with the payout itself. */
export interface FakePayout {
  payment_id: string;
  amount: number;
  method: string;
  due_bills: number;
  paid_bills: number;
  charges: number;
  total: number;
  status_label: string;
  created_at: string;
  ready_at: string;
  paid_at: string | null;
  consignments: {
    consignment_id: number;
    invoice: string;
    tracking_code: string;
    cod_amount: number;
    status: string;
  }[];
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
  /** Its payout calls time out. */
  payoutsTimeOut?: boolean;
  /** Slice 7.5: its fraud check answers a 200 without the figures, as a changed answer would. */
  fraudCheckUnreadable?: boolean;
}

/**
 * Slice 7.5: Steadfast's record of one phone, as its fraud check gives it (tried live 2026-11-07): whole percentages, the
 * size of the record and merchants' reports; its own score and its counts are null.
 */
export interface FakeFraudRecord {
  delivery_ratio: number | null;
  cancellation_ratio: number | null;
  return_ratio: number | null;
  volume_band: string;
  volume_range: string | null;
  total_reports: number;
  doubtful_reports: boolean;
  fraud_categories: unknown[];
}

/** The live answer for a phone it has no record of. */
export const NO_FRAUD_RECORD: FakeFraudRecord = {
  delivery_ratio: null,
  cancellation_ratio: null,
  return_ratio: null,
  volume_band: 'none',
  volume_range: null,
  total_reports: 0,
  doubtful_reports: false,
  fraud_categories: [],
};

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
  /** Slice 6.5: its payouts, oldest first, as its live list ran, and how many a page of that list holds. */
  readonly payouts: FakePayout[] = [];
  payoutPageSize = 8;
  /** Slice 7.5: its record of each phone; one it has none of answers NO_FRAUD_RECORD. */
  readonly fraudRecords = new Map<string, FakeFraudRecord>();
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
    if (path === '/payments' || path.startsWith('/payments/')) return this.payoutsAnswer(url, path);
    if (path === '/create_order' && body !== null) return this.createOrder(body);
    if (path.startsWith('/fraud_check/score/')) {
      const phone = decodeURIComponent(path.slice('/fraud_check/score/'.length));
      if (this.behaviour.fraudCheckUnreadable === true) return reply(200, { status: 200, phone });
      return reply(200, {
        status: 200,
        phone,
        score: null,
        level: null,
        reasons: [],
        scoring_disabled: true,
        delivered_count: null,
        cancelled_count: null,
        ...(this.fraudRecords.get(phone) ?? NO_FRAUD_RECORD),
      });
    }
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
    this.payouts.length = 0;
    this.payoutPageSize = 8;
    this.fraudRecords.clear();
    this.behaviour = {};
  }

  /** The calls asking where a parcel stands. */
  statusCalls(): SteadfastCall[] {
    return this.calls.filter((call) => call.path.startsWith('/status_by_'));
  }

  /** Slice 6.5: the calls reading payouts, the list's pages and single payouts. */
  payoutCalls(): string[] {
    return this.calls
      .filter((call) => call.path === '/payments' || call.path.startsWith('/payments/'))
      .map((call) => call.path);
  }

  /** A paid payout of these consignments, made and paid at `at` (Dhaka's time, as it writes it). */
  pay(
    paymentId: string,
    consignments: { consignmentId: number | string; invoice: string }[],
    at = '2026-11-06 12:00:00',
    extra: Partial<FakePayout> = {},
  ): FakePayout {
    const payout: FakePayout = {
      payment_id: paymentId,
      amount: 1840,
      method: 'Bank',
      due_bills: 0,
      paid_bills: consignments.length,
      charges: 160,
      total: 2000,
      status_label: 'paid',
      created_at: at,
      ready_at: at,
      paid_at: at,
      consignments: consignments.map((each) => ({
        consignment_id: Number(each.consignmentId),
        invoice: each.invoice,
        tracking_code: `TRK${String(each.consignmentId)}`,
        cod_amount: 1000,
        status: 'delivered',
      })),
      ...extra,
    };
    this.payouts.push(payout);
    return payout;
  }

  private payoutsAnswer(url: URL, path: string): Response {
    if (this.behaviour.payoutsTimeOut) throw new DOMException('timed out', 'TimeoutError');
    if (path === '/payments') {
      const page = Number(url.searchParams.get('page') ?? '1');
      const from = (page - 1) * this.payoutPageSize;
      return reply(200, {
        status: 200,
        alertClass: 'success',
        message: 'Payments retrieved successfully.',
        payments: this.payouts
          .slice(from, from + this.payoutPageSize)
          // Its list leaves a payout's parcels out; they come only with the payout itself.
          .map((payout) => {
            const listed: Partial<FakePayout> = { ...payout };
            delete listed.consignments;
            return listed;
          }),
      });
    }
    const wanted = decodeURIComponent(path.slice('/payments/'.length));
    const payout = this.payouts.find((each) => each.payment_id === wanted);
    return payout === undefined
      ? reply(404, { status: 404, message: 'Payment not found.' })
      : reply(200, { status: 200, payment: payout });
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
