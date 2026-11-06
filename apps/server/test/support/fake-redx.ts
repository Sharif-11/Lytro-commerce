// A stand-in for RedX's API (Phase 6 Slice 6.4), as its OpenAPI document says and its sandbox showed on 2026-11-06: one token per shop in
// `API-ACCESS-TOKEN`, an area list, pickup stores, a booking that needs one of its areas and a declared value and answers only a
// tracking id, parcel info with `status` and `delivery_type`, and a cancel that answers "Request Accepted". Unlike the sandbox, which gives
// one tracking id to every booking, each parcel here has its own. Injected as COURIER_FETCH, so nothing leaves the machine.

export const REDX_SHOP_TOKEN = 'redx-shop-token-1234';
export const REDX_LYTRO_TOKEN = 'redx-lytro-area-token-5678';

export interface RedxCall {
  method: string;
  path: string;
  token: string | null;
  body: Record<string, unknown> | null;
}

export interface FakeRedxArea {
  id: number;
  name: string;
  post_code: number | null;
  district_name: string;
  division_name: string;
  zone_id: number;
}

export interface FakeRedxParcel {
  trackingId: string;
  body: Record<string, unknown>;
  status: string;
  deliveryType: string;
}

interface Behaviour {
  refuseBooking?: { status: number; body: unknown };
  bookingTimesOut?: { madeIt: boolean };
  bookingPage?: boolean;
  down?: boolean;
  /** How a cancel is answered: as its document says, as its sandbox did (503 saying success), or refused. */
  cancel?: 'accepted' | 'sandbox' | 'refused' | 'unclear';
  tokensRevoked?: boolean;
  /** The area list answers this many areas, or nothing at all. */
  emptyAreas?: boolean;
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export class FakeRedx {
  readonly calls: RedxCall[] = [];
  readonly parcels: FakeRedxParcel[] = [];
  behaviour: Behaviour = {};
  areas: FakeRedxArea[] = [];
  stores: {
    id: number;
    name: string;
    address: string;
    area_name: string;
    area_id: number;
    phone: string;
  }[] = [];
  private nextParcel = 1;

  constructor() {
    this.reset();
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(/^\/v1\.0\.0-beta/, '');
    const headers = new Headers(init?.headers);
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const token = headers.get('API-ACCESS-TOKEN')?.replace(/^Bearer /, '') ?? null;
    const method = init?.method ?? 'GET';
    this.calls.push({ method, path, token, body });
    await Promise.resolve();
    if (this.behaviour.down) throw new DOMException('timed out', 'TimeoutError');
    const known = token === REDX_SHOP_TOKEN || token === REDX_LYTRO_TOKEN;
    if (this.behaviour.tokensRevoked === true || !known) {
      return reply(401, { message: 'Unauthorized', status_code: 401 });
    }
    if (path === '/areas' && method === 'GET') {
      return reply(200, { areas: this.behaviour.emptyAreas === true ? [] : this.areas });
    }
    if (path === '/pickup/stores' && method === 'GET')
      return reply(200, { pickup_stores: this.stores });
    if (path === '/parcel' && method === 'POST' && body !== null) return this.createParcel(body);
    if (path === '/parcels' && method === 'PATCH' && body !== null) return this.cancel(body);
    const info = /^\/parcel\/info\/([^/]+)$/.exec(path);
    if (info) return this.info(decodeURIComponent(info[1] ?? ''));
    return reply(404, { message: 'Not found' });
  };

  bookings(): RedxCall[] {
    return this.calls.filter((call) => call.path === '/parcel' && call.method === 'POST');
  }

  statusCalls(): RedxCall[] {
    return this.calls.filter((call) => call.path.startsWith('/parcel/info/'));
  }

  cancels(): RedxCall[] {
    return this.calls.filter((call) => call.path === '/parcels');
  }

  areaCalls(): RedxCall[] {
    return this.calls.filter((call) => call.path === '/areas');
  }

  reset(): void {
    this.calls.length = 0;
    this.parcels.length = 0;
    this.behaviour = {};
    this.stores = [
      {
        id: 1,
        name: 'Malibag',
        address: 'Malibagh main road',
        area_name: 'Malibag',
        area_id: 160,
        phone: '8801888999999',
      },
    ];
  }

  private createParcel(body: Record<string, unknown>): Response {
    const { refuseBooking, bookingTimesOut } = this.behaviour;
    if (refuseBooking) return reply(refuseBooking.status, refuseBooking.body);
    if (this.behaviour.bookingPage) {
      return new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    const errors: Record<string, string>[] = [];
    if (body['value'] === undefined) errors.push({ value: '"value" is required' });
    if (!body['delivery_area']) errors.push({ delivery_area: 'Delivery Area is required' });
    if (!this.areas.some((area) => area.id === body['delivery_area_id'])) {
      errors.push({ delivery_area_id: 'Not a valid delivery_area_id provided for delivery!' });
    }
    if (errors.length > 0) {
      return reply(400, {
        message: 'Request payload contains validation errors',
        validation_errors: errors,
      });
    }
    if (bookingTimesOut) {
      if (bookingTimesOut.madeIt) this.make(body);
      throw new DOMException('timed out', 'TimeoutError');
    }
    return reply(201, { tracking_id: this.make(body).trackingId });
  }

  private info(trackingId: string): Response {
    const parcel = this.parcels.find((each) => each.trackingId === trackingId);
    if (!parcel) return reply(404, { message: 'Parcel not found' });
    return reply(200, {
      parcel: {
        tracking_id: parcel.trackingId,
        status: parcel.status,
        delivery_type: parcel.deliveryType,
        charge: 60,
        cash_collection_amount: String(parcel.body['cash_collection_amount']),
      },
    });
  }

  private cancel(body: Record<string, unknown>): Response {
    const how = this.behaviour.cancel ?? 'accepted';
    if (how === 'sandbox') return reply(503, { success: true, message: 'Request Accepted' });
    if (how === 'refused') return reply(400, { message: 'Parcel can not be cancelled now' });
    if (how === 'unclear') return reply(200, { message: 'Received' });
    const parcel = this.parcels.find((each) => each.trackingId === body['entity_id']);
    if (parcel) parcel.status = 'cancelled';
    return reply(200, { success: true, message: 'Request Accepted' });
  }

  private make(body: Record<string, unknown>): FakeRedxParcel {
    const made = {
      trackingId: `21A${String(this.nextParcel).padStart(3, '0')}REDX`,
      body,
      status: 'pickup-pending',
      deliveryType: 'regular',
    };
    this.nextParcel += 1;
    this.parcels.push(made);
    return made;
  }
}
