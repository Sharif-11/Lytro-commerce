// Couriers against a mocked API (Phase 6, TENANT-DASHBOARD-DESIGN §7.39, Part 36): the shop's connections, connecting, the paste
// address, the pickup stores, the default, a courier's areas and its payouts, as the server answers them. An order's parcel is
// orders.ts's, built here.

const MINUTE_MS = 60_000;
// One moment for every time a fixture names, so a read after a write (Sync) answers the same times it did before.
const NOW = Date.now();

export type CourierKey = 'steadfast' | 'pathao' | 'redx';

export const COURIER_NAMES: Record<CourierKey, string> = {
  steadfast: 'Steadfast',
  pathao: 'Pathao',
  redx: 'RedX',
};

/** Each courier as GET /couriers/adapters names it (CRR-01): Steadfast has no stores, weight or cancel; RedX needs an area. */
export const ADAPTERS = [
  {
    key: 'steadfast',
    name: 'Steadfast',
    credentialFields: ['apiKey', 'secretKey'],
    needsArea: false,
    needsThana: false,
    hasStores: false,
    takesWeight: false,
    canCancel: false,
    retiring: false,
  },
  {
    key: 'pathao',
    name: 'Pathao',
    credentialFields: ['clientId', 'clientSecret', 'username', 'password'],
    needsArea: false,
    needsThana: true,
    hasStores: true,
    takesWeight: true,
    canCancel: false,
    retiring: false,
  },
  {
    key: 'redx',
    name: 'RedX',
    credentialFields: ['apiToken'],
    needsArea: true,
    needsThana: false,
    hasStores: true,
    takesWeight: true,
    canCancel: true,
    retiring: false,
  },
] as const;

export interface ConnectionFixture {
  courierKey: CourierKey;
  isDefault: boolean;
  state?: 'active' | 'login_refused';
  messages?: 'none_yet' | 'arriving' | 'token_missing';
  /** Minutes since the last message. */
  lastMessageAgo?: number | null;
  /** The night check found news no message brought. */
  missed?: boolean;
  pickupStore?: { id: string; name: string } | null;
  retiring?: boolean;
  suggestedKey?: CourierKey | null;
  /** Days since the shop was told its retiring was undone (shown for 7); the server gives none while it is retiring again. */
  backDaysAgo?: number | null;
}

/** D6-11: who can be asked by the order's number, as the server reads it from each courier (Steadfast today). */
const ASKS_BY_ORDER_NUMBER: Record<CourierKey, boolean> = {
  steadfast: true,
  pathao: false,
  redx: false,
};

export interface PayoutFixture {
  id: string;
  payoutId: string;
  courierKey: CourierKey;
  amount: number;
  charges: number | null;
  total: number | null;
  method: string | null;
  paidDaysAgo: number;
  parcels: number;
  ours: number;
  orders: {
    orderNumber: string;
    cod: number;
    deliveryCharge: number | null;
    reading: string;
  }[];
}

export interface CouriersFixture {
  connections: ConnectionFixture[];
  /** What POST /couriers/connections refuses with, where a test wants that. */
  connectRefused?: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
  /** The address and token to paste, which Get a new address replaces. */
  address?: { address: string; token: string };
  /** RedX's areas for the order's thana, and the district's for a search. */
  areas?: {
    thana: { areaCode: string; name: string; suggested: boolean }[];
    zilla: { areaCode: string; name: string; suggested: boolean }[];
  };
  stores?: { id: string; name: string; address: string | null; active: boolean }[];
  payouts?: PayoutFixture[];
}

/** Part 36's `c36`: Steadfast the default with its messages arriving, and Pathao with none yet and its store chosen. */
export function drawnCouriers(): CouriersFixture {
  return {
    connections: [
      { courierKey: 'steadfast', isDefault: true, messages: 'arriving', lastMessageAgo: 10 },
      {
        courierKey: 'pathao',
        isDefault: false,
        messages: 'none_yet',
        pickupStore: { id: 'st-1', name: 'Megh Fashion · Mirpur' },
      },
    ],
    areas: {
      thana: [
        { areaCode: '101', name: 'Mirpur 10', suggested: false },
        { areaCode: '102', name: 'Mirpur 11', suggested: false },
        { areaCode: '103', name: 'Mirpur 12', suggested: false },
        { areaCode: '104', name: 'Kazipara(Mirpur)', suggested: true },
      ],
      zilla: [
        { areaCode: '201', name: 'Kazipara', suggested: false },
        { areaCode: '202', name: 'Kazi Office Road (Banani)', suggested: false },
      ],
    },
    stores: [
      {
        id: 'st-1',
        name: 'Megh Fashion · Mirpur',
        address: 'House 12, Road 3, Mirpur 10',
        active: true,
      },
      { id: 'st-2', name: 'Megh Fashion · Uttara', address: 'Sector 7, Uttara', active: true },
      { id: 'st-3', name: 'Old warehouse', address: 'Kazipara', active: false },
    ],
    payouts: [
      {
        id: 'po-1',
        payoutId: 'AAA-10000123',
        courierKey: 'steadfast',
        amount: 18400,
        charges: 1560,
        total: 19960,
        method: 'Bank',
        paidDaysAgo: 1,
        parcels: 14,
        ours: 13,
        orders: [
          { orderNumber: '261031-0047', cod: 3470, deliveryCharge: 60, reading: 'delivered' },
          { orderNumber: '261031-0041', cod: 1250, deliveryCharge: 60, reading: 'delivered' },
          { orderNumber: '261030-0033', cod: 2180, deliveryCharge: 110, reading: 'returning' },
        ],
      },
      {
        id: 'po-2',
        payoutId: 'AAA-10000118',
        courierKey: 'steadfast',
        amount: 9250,
        charges: 840,
        total: 10090,
        method: 'Bank',
        paidDaysAgo: 5,
        parcels: 8,
        ours: 8,
        orders: [],
      },
    ],
  };
}

const ADDRESS = {
  address: 'https://api.lytro.app/api/v1/webhooks/couriers/whk_7Qm2cX9rLp4Tn8Vb',
  token: 'tok_Hs82nKq0LbX4mW7e',
};

const money = (amount: number) => amount.toFixed(2);

export function connectionView(connection: ConnectionFixture) {
  const messages = connection.messages ?? 'none_yet';
  return {
    courierKey: connection.courierKey,
    name: COURIER_NAMES[connection.courierKey],
    isDefault: connection.isDefault,
    hasCredentials: true,
    state: connection.state ?? 'active',
    connectedAt: new Date(Date.now() - 30 * 24 * 60 * MINUTE_MS).toISOString(),
    messages,
    lastMessageAt:
      messages === 'none_yet'
        ? null
        : new Date(Date.now() - (connection.lastMessageAgo ?? 10) * MINUTE_MS).toISOString(),
    messagesMissedAt: connection.missed
      ? new Date(Date.now() - 60 * MINUTE_MS).toISOString()
      : null,
    pickupStore: connection.pickupStore ?? null,
    retiring: connection.retiring ?? false,
    suggestedKey: connection.retiring ? (connection.suggestedKey ?? null) : null,
    backSince:
      connection.retiring || connection.backDaysAgo === undefined || connection.backDaysAgo === null
        ? null
        : new Date(Date.now() - connection.backDaysAgo * 24 * 60 * MINUTE_MS).toISOString(),
    asksByOrderNumber: ASKS_BY_ORDER_NUMBER[connection.courierKey],
  };
}

function payoutView(payout: PayoutFixture) {
  const paidAt = new Date(Date.now() - payout.paidDaysAgo * 24 * 60 * MINUTE_MS).toISOString();
  return {
    id: payout.id,
    courierKey: payout.courierKey,
    payoutId: payout.payoutId,
    amount: money(payout.amount),
    charges: payout.charges === null ? null : money(payout.charges),
    total: payout.total === null ? null : money(payout.total),
    method: payout.method,
    paidAt,
    madeAt: new Date(new Date(paidAt).getTime() - 24 * 60 * MINUTE_MS).toISOString(),
    parcels: payout.parcels,
    ours: payout.ours,
  };
}

type Answer =
  | { data: unknown }
  | {
      refused: { status: number; code: string; message: string; details?: Record<string, unknown> };
    }
  | undefined;

/** The answer to a couriers request, or undefined when it is not one. */
export function couriersAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: CouriersFixture,
): Answer {
  if (!path.startsWith('/couriers')) return undefined;
  const connected = (key: string) => fixture.connections.find((each) => each.courierKey === key);
  if (method === 'GET' && path === '/couriers/adapters') {
    return {
      data: {
        adapters: ADAPTERS.map((adapter) => ({
          ...adapter,
          credentialFields: [...adapter.credentialFields],
          retiring: connected(adapter.key)?.retiring ?? false,
        })),
      },
    };
  }
  if (method === 'GET' && path === '/couriers/connections') {
    return { data: { connections: fixture.connections.map(connectionView) } };
  }
  if (method === 'POST' && path === '/couriers/connections') {
    if (fixture.connectRefused) return { refused: fixture.connectRefused };
    const key = String(body?.courierKey) as CourierKey;
    let connection = connected(key);
    if (!connection) {
      connection = { courierKey: key, isDefault: fixture.connections.length === 0 };
      fixture.connections.push(connection);
    }
    // A login again: Pathao takes the password, and the connection works again.
    connection.state = 'active';
    return { data: { ...connectionView(connection), message: ADDRESS } };
  }
  const one = /^\/couriers\/connections\/([a-z]+)(?:\/([a-z]+))?$/.exec(path);
  if (one) {
    const key = one[1] ?? '';
    const connection = connected(key);
    if (!connection)
      return { refused: { status: 404, code: 'not_found', message: 'Not connected.' } };
    const action = one[2] ?? null;
    if (method === 'DELETE' && action === null) {
      fixture.connections = fixture.connections.filter((each) => each !== connection);
      const [next] = fixture.connections;
      if (connection.isDefault && next) next.isDefault = true;
      return { data: { ok: true } };
    }
    if (action === 'address') {
      if (method === 'POST') fixture.address = { ...ADDRESS, token: 'tok_New9pQ2wX5' };
      return { data: fixture.address ?? ADDRESS };
    }
    if (method === 'GET' && action === 'stores') {
      return {
        data: { stores: fixture.stores ?? [], chosenId: connection.pickupStore?.id ?? null },
      };
    }
    if (method === 'PUT' && action === 'store') {
      const store = (fixture.stores ?? []).find((each) => each.id === body?.storeId);
      connection.pickupStore = store ? { id: store.id, name: store.name } : null;
      return { data: connectionView(connection) };
    }
    if (method === 'PUT' && action === 'default') {
      for (const each of fixture.connections) each.isDefault = each === connection;
      return { data: connectionView(connection) };
    }
    return undefined;
  }
  const areas = /^\/couriers\/([a-z]+)\/areas$/.exec(path);
  if (method === 'GET' && areas) {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const found = fixture.areas ?? { thana: [], zilla: [] };
    return {
      data: {
        thana: found.thana,
        zilla: q ? found.zilla.filter((each) => each.name.toLowerCase().includes(q)) : found.zilla,
      },
    };
  }
  if (method === 'GET' && path === '/couriers/payouts') {
    const payouts = (fixture.payouts ?? []).map(payoutView);
    return { data: { payouts, page: 1, limit: 20, total: payouts.length, pages: 1 } };
  }
  const payout = /^\/couriers\/payouts\/([^/]+)$/.exec(path);
  if (method === 'GET' && payout) {
    const found = (fixture.payouts ?? []).find((each) => each.id === payout[1]);
    if (!found) return { refused: { status: 404, code: 'not_found', message: 'Not found.' } };
    return {
      data: {
        ...payoutView(found),
        orders: found.orders.map((order, index) => ({
          orderId: `po-order-${String(index)}`,
          orderNumber: order.orderNumber,
          cod: money(order.cod),
          cashCollected: money(order.cod),
          deliveryCharge: order.deliveryCharge === null ? null : money(order.deliveryCharge),
          reading: order.reading,
        })),
      },
    };
  }
  return undefined;
}

/** An order's parcel as GET /orders/:id gives it, booked with Steadfast and waiting for pickup unless told otherwise. */
export interface ParcelFixture {
  courierKey: CourierKey;
  state?: 'booking' | 'booked' | 'unknown' | 'refused' | 'cancelled';
  reading?: string | null;
  courierStatus?: string | null;
  consignmentId?: string | null;
  trackingCode?: string | null;
  cod: number;
  cashCollected?: number | null;
  codAtCourier?: number | null;
  deliveryCharge?: number | null;
  settled?: boolean;
  settleProblem?: string | null;
  attention?: string | null;
  noNews?: boolean;
  paidDaysAgo?: number | null;
  payoutId?: string | null;
  /** Newest first: where it came from, its words in English and Bangla, its raw status, minutes ago. */
  news?: {
    source: 'message' | 'check' | 'sync';
    words?: [string, string] | null;
    raw: string;
    ago: number;
  }[];
}

export function parcelView(parcel: ParcelFixture) {
  return {
    courierKey: parcel.courierKey,
    state: parcel.state ?? 'booked',
    invoice: 'inv',
    consignmentId: parcel.consignmentId === undefined ? '1424107' : parcel.consignmentId,
    trackingCode: parcel.trackingCode === undefined ? '15BAEB8A' : parcel.trackingCode,
    courierStatus: parcel.courierStatus === undefined ? 'in_review' : parcel.courierStatus,
    cod: money(parcel.cod),
    note: null,
    weightKg: null,
    areaCode: null,
    deliveryCharge:
      parcel.deliveryCharge === undefined || parcel.deliveryCharge === null
        ? null
        : money(parcel.deliveryCharge),
    refusal: null,
    settled: parcel.settled ?? true,
    settleProblem: parcel.settleProblem ?? null,
    createdAt: new Date(Date.now() - 60 * MINUTE_MS).toISOString(),
    reading: parcel.reading === undefined ? 'booked' : parcel.reading,
    cashCollected:
      parcel.cashCollected === undefined || parcel.cashCollected === null
        ? null
        : money(parcel.cashCollected),
    codAtCourier:
      parcel.codAtCourier === undefined || parcel.codAtCourier === null
        ? null
        : money(parcel.codAtCourier),
    lastNewsAt: null,
    noNews: parcel.noNews ?? false,
    attention: parcel.attention ?? null,
    paidAt:
      parcel.paidDaysAgo === undefined || parcel.paidDaysAgo === null
        ? null
        : new Date(Date.now() - parcel.paidDaysAgo * 24 * 60 * MINUTE_MS).toISOString(),
    payoutId: parcel.payoutId ?? null,
    news: (parcel.news ?? []).map((each) => ({
      source: each.source,
      rawStatus: each.raw,
      message: { en: each.words?.[1] ?? null, bn: each.words?.[0] ?? null },
      at: new Date(NOW - each.ago * MINUTE_MS).toISOString(),
    })),
  };
}
