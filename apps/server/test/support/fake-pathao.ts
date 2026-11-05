// A stand-in for Pathao's API (Phase 6 Slice 6.3), behaving as its sandbox did when tried on 2026-11-05: a login gives tokens, a refresh token
// works once, a wrong login is a 400, a bad token a 401, an unknown parcel a 404, and decimals in an amount or a quantity are refused with
// field errors. A repeated order number makes a second parcel. Injected as COURIER_FETCH, so nothing leaves. The old access token also ends
// here at a refresh, the stricter of what the sandbox did: it refused one and went on taking another, so Lytro must never rely on it.

export const PATHAO_CLIENT_ID = 'pathao-client-id-1234';
export const PATHAO_CLIENT_SECRET = 'pathao-client-secret-5678';
export const PATHAO_USERNAME = 'merchant@example.com';
export const PATHAO_PASSWORD = 'pathao-merchant-password-90';
export const PATHAO_FIELDS = {
  clientId: PATHAO_CLIENT_ID,
  clientSecret: PATHAO_CLIENT_SECRET,
  username: PATHAO_USERNAME,
  password: PATHAO_PASSWORD,
};

export interface PathaoCall {
  method: string;
  path: string;
  bearer: string | null;
  body: Record<string, unknown> | null;
}

export interface FakeParcel {
  consignmentId: string;
  body: Record<string, unknown>;
}

interface FakeStore {
  store_id: number;
  store_name: string;
  store_address: string;
  is_active: number;
}

interface Behaviour {
  refuseBooking?: { status: number; body: unknown };
  bookingTimesOut?: { madeIt: boolean };
  bookingPage?: boolean;
  /** Everything times out, as if the courier were down. */
  down?: boolean;
  /** A refresh is answered with a timeout. `used` says it took effect there anyway, as a lost answer can. */
  refreshTimesOut?: { used: boolean };
  /** A login or a refresh is answered like this instead. */
  issueAnswer?: { status: number; body: unknown };
  /** Called during each refresh while it is out with the courier. */
  whileRefreshing?: () => Promise<void>;
  /** Every token is refused from now on. */
  tokensRevoked?: boolean;
}

const LASTS_SECONDS = 90 * 24 * 60 * 60;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export class FakePathao {
  readonly calls: PathaoCall[] = [];
  readonly parcels: FakeParcel[] = [];
  readonly statuses = new Map<string, string>();
  behaviour: Behaviour = {};
  stores: FakeStore[] = [];
  /** What a login or a refresh says a token lasts. */
  lastsSeconds = LASTS_SECONDS;
  private access = new Set<string>();
  private refresh = new Set<string>();
  private issued = 0;
  private nextParcel = 1;

  constructor() {
    this.reset();
  }

  /** A working token, for a test that wants an account without logging in. */
  grant(): { accessToken: string; refreshToken: string } {
    return this.mint();
  }

  /** The stand-in for `fetch`. */
  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(/^\/aladdin\/api\/v1/, '');
    const headers = new Headers(init?.headers);
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const bearer = headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
    this.calls.push({ method: init?.method ?? 'GET', path, bearer, body });
    if (this.behaviour.down) throw new DOMException('timed out', 'TimeoutError');
    if (path === '/issue-token' && body !== null) return this.issue(body);
    if (this.behaviour.tokensRevoked === true || bearer === null || !this.access.has(bearer)) {
      return reply(401, {
        message: 'Unauthorized User',
        type: 'error',
        error: { source: 'verify-auth-token', description: 'access token is invalid' },
      });
    }
    if (path === '/stores') return this.listStores();
    if (path === '/orders' && body !== null) return this.createOrder(body);
    const info = /^\/orders\/([^/]+)\/info$/.exec(path);
    if (info) return this.orderInfo(decodeURIComponent(info[1] ?? ''));
    return reply(404, { message: 'not found', type: 'error', code: 404 });
  };

  bookings(): PathaoCall[] {
    return this.calls.filter((call) => call.path === '/orders' && call.method === 'POST');
  }

  statusCalls(): PathaoCall[] {
    return this.calls.filter((call) => call.path.endsWith('/info'));
  }

  refreshes(): PathaoCall[] {
    return this.calls.filter(
      (call) => call.path === '/issue-token' && call.body?.['grant_type'] === 'refresh_token',
    );
  }

  logins(): PathaoCall[] {
    return this.calls.filter(
      (call) => call.path === '/issue-token' && call.body?.['grant_type'] === 'password',
    );
  }

  reset(): void {
    this.calls.length = 0;
    this.parcels.length = 0;
    this.statuses.clear();
    this.behaviour = {};
    this.lastsSeconds = LASTS_SECONDS;
    this.access = new Set();
    this.refresh = new Set();
    this.stores = [
      {
        store_id: 2,
        store_name: 'Mirpur warehouse',
        store_address: 'House 1, Mirpur, Dhaka\n',
        is_active: 1,
      },
    ];
  }

  private mint(): { accessToken: string; refreshToken: string } {
    this.issued += 1;
    const accessToken = `pathao-access-${String(this.issued)}`;
    const refreshToken = `pathao-refresh-${String(this.issued)}`;
    this.access.add(accessToken);
    this.refresh.add(refreshToken);
    return { accessToken, refreshToken };
  }

  private async issue(body: Record<string, unknown>): Promise<Response> {
    if (this.behaviour.issueAnswer) {
      return reply(this.behaviour.issueAnswer.status, this.behaviour.issueAnswer.body);
    }
    const refused = reply(400, {
      message: 'The user credentials were incorrect',
      type: 'error',
      code: 400,
    });
    if (body['client_id'] !== PATHAO_CLIENT_ID || body['client_secret'] !== PATHAO_CLIENT_SECRET) {
      return refused;
    }
    if (body['grant_type'] === 'password') {
      if (body['username'] !== PATHAO_USERNAME || body['password'] !== PATHAO_PASSWORD) {
        return refused;
      }
    } else if (body['grant_type'] === 'refresh_token') {
      if (this.behaviour.whileRefreshing) await this.behaviour.whileRefreshing();
      const token = String(body['refresh_token']);
      if (!this.refresh.has(token)) return refused;
      if (this.behaviour.refreshTimesOut) {
        if (this.behaviour.refreshTimesOut.used) this.endAll();
        throw new DOMException('timed out', 'TimeoutError');
      }
      // One use, and the stricter reading of what happens to the access token before it.
      this.endAll();
    } else {
      return refused;
    }
    const { accessToken, refreshToken } = this.mint();
    return reply(200, {
      token_type: 'Bearer',
      expires_in: this.lastsSeconds,
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  private endAll(): void {
    this.access.clear();
    this.refresh.clear();
  }

  private listStores(): Response {
    return reply(200, {
      message: 'Store list fetched.',
      type: 'success',
      code: 200,
      data: { data: this.stores, total: this.stores.length },
    });
  }

  private createOrder(body: Record<string, unknown>): Response {
    const { refuseBooking, bookingTimesOut } = this.behaviour;
    if (refuseBooking) return reply(refuseBooking.status, refuseBooking.body);
    if (this.behaviour.bookingPage) {
      return new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    const errors: Record<string, string[]> = {};
    if (!Number.isInteger(body['amount_to_collect'])) {
      errors['amount_to_collect'] = ['The amount to collect must be an integer.'];
    }
    if (!Number.isInteger(body['item_quantity'])) {
      errors['item_quantity'] = ['The item quantity must be an integer.'];
    }
    if (body['item_weight'] === undefined) {
      errors['item_weight'] = ['The item weight field is required.'];
    }
    if (!this.stores.some((store) => store.store_id === body['store_id'])) {
      errors['store_id'] = ['Wrong Store selected'];
    }
    if (Object.keys(errors).length > 0) {
      return reply(422, {
        message: 'Please fix the given errors',
        type: 'error',
        code: 422,
        errors,
      });
    }
    if (bookingTimesOut) {
      if (bookingTimesOut.madeIt) this.make(body);
      throw new DOMException('timed out', 'TimeoutError');
    }
    const made = this.make(body);
    return reply(200, {
      message: 'Order Created Successfully',
      type: 'success',
      code: 200,
      data: {
        consignment_id: made.consignmentId,
        merchant_order_id: body['merchant_order_id'],
        order_status: 'Pending',
        delivery_fee: 60,
      },
    });
  }

  private orderInfo(consignmentId: string): Response {
    const status = this.statuses.get(consignmentId);
    if (status === undefined) {
      return reply(404, {
        message: 'order not found',
        type: 'error',
        code: 404,
        errors: 'order not found',
      });
    }
    return reply(200, {
      type: 'success',
      code: 200,
      data: {
        consignment_id: consignmentId,
        invoice_id: null,
        order_status: status,
        order_status_slug: status,
        payment_status: '',
        updated_at: '2026-11-05 21:35:09',
      },
    });
  }

  private make(body: Record<string, unknown>): FakeParcel {
    const made = { consignmentId: `DS0511P${String(this.nextParcel)}`, body };
    this.nextParcel += 1;
    this.parcels.push(made);
    this.statuses.set(made.consignmentId, 'Pending');
    return made;
  }
}
