import { addonPayment, NOW, type ShopFixture } from './console-data';

// OPERATOR-CONSOLE-DESIGN v7 (Phase 8 Slice 8.8): the shop list's filters and the owner's phone, the shop page's figures
// and the lists behind them, and extending, resetting the owner's sign-in and deleting a shop's data, answered as the
// server's routes (Slices 8.2 and 8.3) answer them, from the sketch's own sample data.

type Answer = { data: unknown } | { refused: [number, string, string] };

/** The owners' phones the sketch draws (P88_OWNER), in the local form the server keeps. */
export const OWNER_PHONES: Record<string, string> = {
  'ten-0001': '01712345678',
  'ten-0007': '01819220011',
  'ten-0012': '01611908070',
  'ten-0015': '01911445566',
  'ten-0019': '01815345678',
  'ten-0023': '01713552200',
  'ten-0028': '01911223344',
  'ten-0031': '01552100200',
  'ten-0034': '01611223300',
  'ten-0040': '01716880011',
  'ten-0044': '01822450045',
  'ten-0051': '01755123321',
};

const OWNER_NAMES: Record<string, string> = {
  'ten-0001': 'Rahim Uddin',
  'ten-0007': 'Mahbub Alam',
  'ten-0019': 'Sadia Rahman',
  'ten-0028': 'Keya Das',
};

const LAPSED = ['grace', 'read_only', 'locked', 'archived'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The digits a search names: the whole local number, or the 6 to 10 last ones (D8-24). */
function phoneMatch(word: string, phone: string): boolean {
  const digits = word.replace(/[\s-]/g, '').replace(/^\+?88/, '');
  if (!/^\d+$/.test(digits)) return false;
  if (digits.length === 11) return phone === digits;
  return digits.length >= 6 && digits.length <= 10 && phone.endsWith(digits);
}

/** GET /operator/tenants (ADM-02, D8-7, D8-24): by name, address or the owner's phone, by state and plan, in an order. */
export function shopListAnswer(url: URL, shops: ShopFixture[]): Answer {
  const word = (url.searchParams.get('query') ?? '').toLowerCase();
  const state = url.searchParams.get('state');
  const planId = url.searchParams.get('planId');
  const sort = url.searchParams.get('sort') ?? 'newest';
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const start = Number(url.searchParams.get('cursor') ?? 0);
  const matching = shops.filter(
    (each) =>
      (word === '' ||
        each.shopName.toLowerCase().includes(word) ||
        each.slug.includes(word) ||
        phoneMatch(word, OWNER_PHONES[each.id] ?? '')) &&
      (!state || each.state === state) &&
      (!planId || each.planId === planId),
  );
  const sorted =
    sort === 'name'
      ? [...matching].sort((a, b) => a.shopName.localeCompare(b.shopName))
      : sort === 'period_end'
        ? [...matching].sort((a, b) => (a.periodEnd ?? '9999').localeCompare(b.periodEnd ?? '9999'))
        : matching;
  const end = start + limit;
  return {
    data: {
      entries: sorted.slice(start, end).map((each) => ({
        id: each.id,
        slug: each.slug,
        shopName: each.shopName,
        state: each.state,
        suspendedAt: each.suspension?.at ?? null,
        planId: each.planId,
        planName: each.planName,
        planVersion: each.planVersion,
        overrideCount: each.overrides.length,
        periodEnd: each.periodEnd,
        ownerPhone: OWNER_PHONES[each.id] ?? null,
      })),
      nextCursor: end < sorted.length ? String(end) : null,
    },
  };
}

const ORDERS = {
  unverified: 1,
  pending: 4,
  confirmed: 6,
  processing: 3,
  shipped: 11,
  delivered: 182,
  partial_delivered: 0,
  completed: 0,
  cancelled: 9,
  hold: 1,
  in_review: 0,
  refunded: 0,
  returned: 2,
  rejected: 0,
};

function metric(metricKey: string, used: number, limit: number | null, unit = 'count') {
  return { metric: metricKey, used, limit, unit };
}

/** ADM-03: Rahim Fashion's figures as the sketch draws them; every other shop is a quiet one (p88FigOf). */
export function shopFigures(shop: ShopFixture): Record<string, unknown> {
  const busy = shop.id === 'ten-0001';
  const owner = {
    userId: `user-${shop.id}`,
    name: OWNER_NAMES[shop.id] ?? shop.shopName,
    phone: OWNER_PHONES[shop.id] ?? null,
    isOwner: true,
    lastAt: busy ? '2026-10-21T12:20:00+06:00' : '2026-10-20T20:05:00+06:00',
  };
  return {
    balance: {
      amount: busy ? '1350.00' : '420.00',
      frozen: shop.suspension !== null || LAPSED.includes(shop.state),
      held: '0.00',
    },
    usage: {
      cycleStart: '2026-10-15T00:00:00+06:00',
      cycleEnd: '2026-11-14T00:00:00+06:00',
      metrics: [
        metric('products', 512, 600),
        metric('seats', 2, 3),
        metric('storage', 1.31e9, 2e9, 'bytes'),
        metric('bandwidth', 18.4e9, 50e9, 'bytes'),
        metric('requests', 141200, 240000),
        metric('orders_monthly', 212, 300),
        metric('essential_sms_monthly', 7, 10),
      ],
      payPerUse: [
        {
          key: 'address_reads',
          rate: '2.00',
          allowance: null,
          outsideAllowance: busy ? { count: 4, cost: '8.00' } : { count: 0, cost: '0.00' },
        },
      ],
    },
    errors: { since: NOW, count: busy ? 3 : 0 },
    failedSms: {
      since: NOW,
      shop: busy ? { failed: 2, blocked: 1 } : { failed: 0, blocked: 0 },
      lytro: busy ? 1 : 0,
    },
    failedCourierCalls: { since: NOW, count: busy ? 2 : 0 },
    signIns: busy
      ? [
          owner,
          {
            userId: 'user-shila',
            name: 'Shila Akter',
            phone: '01911220033',
            isOwner: false,
            lastAt: '2026-10-18T09:10:00+06:00',
          },
          {
            userId: 'user-karim',
            name: 'Karim Hossain',
            phone: '01715000111',
            isOwner: false,
            lastAt: null,
          },
        ]
      : [owner],
    paymentsWaiting: busy
      ? { lytro: { count: 1, amount: '99.00' }, customers: 2 }
      : { lytro: { count: 0, amount: '0.00' }, customers: 0 },
    orders: ORDERS,
  };
}

function shopErrors(shop: ShopFixture, url: URL): Record<string, unknown> {
  // The first page says more are kept, as the sketch draws it; the next is empty.
  if (shop.id !== 'ten-0001' || url.searchParams.has('before')) {
    return { errors: [], nextBefore: null };
  }
  const error = (
    id: number,
    requestId: string,
    method: string,
    route: string,
    status: number,
    kind: string,
    createdAt: string,
  ) => ({ id, requestId, method, route, status, kind, createdAt });
  return {
    errors: [
      error(
        41,
        'K7MQ-4XR2',
        'POST',
        '/api/v1/orders/:id/courier-booking',
        503,
        'CourierUnavailable',
        '2026-10-21T13:58:00+06:00',
      ),
      error(
        40,
        'P3HV-9TND',
        'GET',
        '/api/v1/orders',
        500,
        'DatabaseError 57014',
        '2026-10-21T11:16:00+06:00',
      ),
      error(
        39,
        'WX2C-7RFA',
        'PATCH',
        '/api/v1/products/:id',
        500,
        'TypeError',
        '2026-10-21T09:41:00+06:00',
      ),
      error(
        31,
        'D8JB-3KSY',
        'POST',
        '/api/v1/media/uploads',
        503,
        'StorageUnavailable',
        '2026-10-17T22:03:00+06:00',
      ),
    ],
    nextBefore: 31,
  };
}

function failedSms(shop: ShopFixture): Record<string, unknown> {
  if (shop.id !== 'ten-0001') return { shop: [], lytro: [] };
  const sms = (
    id: number,
    kind: string,
    status: string,
    orderNumber: string,
    units: number,
    createdAt: string,
    blockedReason: string | null = null,
  ) => ({ id, kind, status, blockedReason, orderNumber, units, createdAt });
  return {
    shop: [
      sms(81, 'order_shipped', 'failed', '261021-0031', 2, '2026-10-21T11:05:00+06:00'),
      sms(77, 'order_placed', 'failed', '261020-0019', 1, '2026-10-20T15:20:00+06:00'),
      sms(
        70,
        'order_delivered',
        'blocked',
        '261018-0044',
        1,
        '2026-10-18T19:02:00+06:00',
        'insufficient_balance',
      ),
    ],
    lytro: [
      {
        id: 9,
        kind: 'otp',
        toPhone: '01715000111',
        attempts: 3,
        lastError: 'Operator rejected: DND number',
        createdAt: '2026-10-19T08:47:00+06:00',
      },
    ],
  };
}

/** STA-01: Rahim Fashion's October by week (P88_SALES); none elsewhere. */
function sales(shop: ShopFixture, url: URL): Record<string, unknown> {
  const bucket = (
    from: string,
    to: string,
    orders: number,
    revenue: number,
    delivery: number,
    courier: number,
  ) => ({
    from,
    to,
    orders,
    units: [],
    revenue: revenue.toFixed(2),
    tax: '0.00',
    deliveryCharges: delivery.toFixed(2),
    courierCharges: courier.toFixed(2),
    unknownCourierCharges: 0,
  });
  const buckets =
    shop.id === 'ten-0001'
      ? [
          bucket('2026-10-01', '2026-10-02', 14, 18240, 1080, 940),
          bucket('2026-10-03', '2026-10-09', 51, 66310, 3960, 3410),
          bucket('2026-10-10', '2026-10-16', 63, 81990, 4920, 4180),
          bucket('2026-10-17', '2026-10-21', 38, 49460, 2940, 2520),
        ]
      : [];
  const sum = (pick: (each: (typeof buckets)[number]) => string | number) =>
    buckets.reduce((total, each) => total + Number(pick(each)), 0);
  return {
    dateFrom: url.searchParams.get('dateFrom') ?? '2026-10-01',
    dateTo: url.searchParams.get('dateTo') ?? '2026-10-21',
    bucket: url.searchParams.get('bucket') ?? 'week',
    productId: null,
    buckets,
    totals: {
      orders: sum((each) => each.orders),
      units: [],
      revenue: sum((each) => each.revenue).toFixed(2),
      tax: '0.00',
      deliveryCharges: sum((each) => each.deliveryCharges).toFixed(2),
      courierCharges: sum((each) => each.courierCharges).toFixed(2),
      unknownCourierCharges: 0,
    },
  };
}

/** ADM-08: the platform audit log's last entries on a shop, as GET /operator/audit lists them. */
export function shopAudit(shopId: string): Record<string, unknown> {
  const entry = (
    id: number,
    createdAt: string,
    actorType: string,
    actorEmail: string | null,
    action: string,
    summary: Record<string, unknown>,
  ) => ({
    id,
    actorType,
    actorId: actorEmail === null ? null : 'op-1',
    actorEmail,
    action,
    targetType: 'tenant',
    targetId: shopId,
    result: 'success',
    summary,
    createdAt,
    shop: null,
  });
  if (shopId !== 'ten-0001') return { items: [], next: null };
  return {
    items: [
      entry(9377, '2026-10-20T19:44:00+06:00', 'shop_owner', null, 'notice_acknowledged', {
        tenantId: shopId,
      }),
      entry(9361, '2026-10-20T15:10:00+06:00', 'operator', 'ops@lytro.app', 'balance_adjusted', {
        amount: -150,
        reason: 'SMS charged twice on 18 Oct',
      }),
      entry(
        9322,
        '2026-10-19T11:00:00+06:00',
        'operator',
        'ops@lytro.app',
        'plan_payment_verified',
        {
          kind: 'renewal',
          amount: '449.00',
          tenantId: shopId,
        },
      ),
    ],
    next: null,
  };
}

/** The shop page's reads and the three actions, changing the shop as the server would; undefined for anything else. */
export function shopAnswer(
  rest: string,
  url: URL,
  body: Record<string, unknown> | null,
  shop: ShopFixture,
  courierUses: Record<string, unknown>[],
  now: string,
): Answer | undefined {
  if (rest === 'figures') return { data: shopFigures(shop) };
  if (rest === 'errors') return { data: shopErrors(shop, url) };
  if (rest === 'failed-sms') return { data: failedSms(shop) };
  if (rest === 'payments-waiting') {
    return { data: shop.id === 'ten-0001' ? [addonPayment()] : [] };
  }
  if (rest === 'sales') return { data: sales(shop, url) };
  if (rest === 'courier-credential-uses' && url.searchParams.get('failed') === 'true') {
    const failed = courierUses.filter((each) => each['succeeded'] === false);
    return {
      data: { uses: failed, page: 1, limit: 20, total: failed.length, pages: 1 },
    };
  }
  if (rest === 'extend') {
    const from = shop.periodEnd;
    if (from === null)
      return { refused: [409, 'conflict', "This shop's period can't be extended."] };
    const to = new Date(new Date(from).getTime() + Number(body?.days) * DAY_MS);
    if (to.getTime() <= new Date(now).getTime()) {
      return {
        refused: [409, 'conflict', 'Those days still end in the past. Assign a plan instead.'],
      };
    }
    const restored = LAPSED.includes(shop.state);
    shop.periodEnd = to.toISOString();
    if (restored) shop.state = 'active';
    return { data: { periodEnd: shop.periodEnd, state: shop.state, restored } };
  }
  if (rest === 'owner-reset') {
    const phone = String(body?.phone);
    const elsewhere = Object.entries(OWNER_PHONES).some(
      ([id, each]) => id !== shop.id && each === phone,
    );
    if (elsewhere) {
      return { refused: [409, 'conflict', 'This phone number is on another Lytro account.'] };
    }
    return { data: { phoneChanged: phone !== OWNER_PHONES[shop.id] } };
  }
  if (rest === 'delete-data') {
    if (body?.confirmAddress !== shop.slug) {
      return { refused: [409, 'conflict', "That isn't this shop's address."] };
    }
    shop.state = 'archived';
    return { data: { ok: true } };
  }
  return undefined;
}
