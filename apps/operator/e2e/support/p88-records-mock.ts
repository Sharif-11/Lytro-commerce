// OPERATOR-CONSOLE-DESIGN v7's Records sample data (the sketch's P88_REV, P88_REV_YEAR, P88_SHOPS_RP, P88_CONSUMERS,
// P88_AUDIT and P88_MEDIA), answered the way Slice 8.4's reports and audit log and Slice 8.6's media costs answer them.

type Words = readonly [string, string];

export interface AuditFixture {
  id: number;
  at: string;
  who: string | null;
  type: 'operator' | 'system' | 'shop_owner';
  action: string;
  shop: string | null;
  target: string;
  /** Each reason in both languages; the answer gives the one the page asked in. */
  summary: Record<string, unknown>;
}

export interface RecordsMockState {
  auditEntries: AuditFixture[];
  mediaCosts: Record<string, unknown>;
  /** Every report reads as a period in which nothing moved. */
  reportsEmpty: boolean;
}

/** The signed-in operator, as GET /auth/operator/me answers, and a second one. */
// The signed-in operator, one id for every mock (console-data.ts).
import { OPERATOR_ID } from './console-data';

export { OPERATOR_ID };
export const NADIA_ID = '00000000-0000-4000-8000-0000000000a2';

const SHOPS: Record<string, { name: string; slug: string }> = {
  'ten-0001': { name: 'Rahim Fashion', slug: 'rahim-fashion' },
  'ten-0007': { name: 'Dhaka Gadget House', slug: 'dhaka-gadget' },
  'ten-0019': { name: 'Sadia Collection', slug: 'sadia-collection' },
  'ten-0028': { name: 'Keya Boutique', slug: 'keya-boutique' },
  'ten-0034': { name: 'Faiza Shoes', slug: 'faiza-shoes' },
  'ten-0051': { name: 'Joy Pharmacy', slug: 'joy-pharmacy' },
};

const reason = (en: string, bn: string): Words => [en, bn];

export function drawnAudit(): AuditFixture[] {
  return [
    {
      id: 9412,
      at: '2026-10-21T14:12:00+06:00',
      who: 'ops@lytro.app',
      type: 'operator',
      action: 'plan_extended',
      shop: 'ten-0019',
      target: 'tenant',
      summary: {
        days: 7,
        from: '2026-10-19',
        to: '2026-10-26',
        reason: reason(
          "bKash was down for two days; the owner couldn't renew",
          'দুই দিন bKash বন্ধ ছিল; ওনার রিনিউ করতে পারেননি',
        ),
        restored: true,
      },
    },
    {
      id: 9409,
      at: '2026-10-21T13:40:00+06:00',
      who: 'ops@lytro.app',
      type: 'operator',
      action: 'manual_entry_recorded',
      shop: 'ten-0028',
      target: 'tenant',
      summary: {
        entryId: 'me-29',
        kind: 'renewal',
        amount: '4741.00',
        transactionId: 'NGD8K2P0XQ',
        reason: reason(
          'Paid to the Nagad number by mistake; statement checked',
          'ভুল করে Nagad নম্বরে পাঠিয়েছেন; স্টেটমেন্ট মিলিয়ে দেখা',
        ),
      },
    },
    {
      id: 9401,
      at: '2026-10-21T12:05:00+06:00',
      who: null,
      type: 'system',
      action: 'usage_fast_spend_alerted',
      shop: 'ten-0034',
      target: 'tenant',
      summary: { requests: 6000, limit: 10000, operators: 2 },
    },
    {
      id: 9398,
      at: '2026-10-21T11:30:00+06:00',
      who: 'ops@lytro.app',
      type: 'operator',
      action: 'settings_changed',
      shop: null,
      target: 'setting',
      summary: {
        key: 'media_budget_usd',
        oldValue: 10,
        newValue: 15,
        reason: reason('Two new shops with video', 'ভিডিওসহ দুটো নতুন শপ'),
      },
    },
    {
      id: 9390,
      at: '2026-10-21T10:02:00+06:00',
      who: 'nadia@lytro.app',
      type: 'operator',
      action: 'plan_payment_verified',
      shop: 'ten-0051',
      target: 'plan_payment',
      summary: { kind: 'renewal', amount: '449.00', tenantId: 'ten-0051' },
    },
    {
      id: 9377,
      at: '2026-10-20T19:44:00+06:00',
      who: null,
      type: 'shop_owner',
      action: 'notice_acknowledged',
      shop: 'ten-0001',
      target: 'notice',
      summary: { tenantId: 'ten-0001' },
    },
    {
      id: 9361,
      at: '2026-10-20T15:10:00+06:00',
      who: 'ops@lytro.app',
      type: 'operator',
      action: 'balance_adjusted',
      shop: 'ten-0001',
      target: 'tenant',
      summary: {
        amount: '-150.00',
        reason: reason('SMS charged twice on 18 Oct', '১৮ অক্টোবর SMS দুবার চার্জ হয়েছে'),
      },
    },
    {
      id: 9350,
      at: '2026-10-19T17:25:00+06:00',
      who: 'ops@lytro.app',
      type: 'operator',
      action: 'payment_method_type_retired',
      shop: null,
      target: 'payment_method_type',
      summary: {
        method: 'upay',
        reason: reason(
          'Upay settlements to shops have stalled for a month',
          'এক মাস ধরে শপগুলোতে Upay-এর সেটলমেন্ট আটকে আছে',
        ),
      },
    },
    {
      id: 9322,
      at: '2026-10-19T11:00:00+06:00',
      who: 'ops@lytro.app',
      type: 'operator',
      action: 'plan_payment_verified',
      shop: 'ten-0001',
      target: 'plan_payment',
      summary: { kind: 'renewal', amount: '449.00', tenantId: 'ten-0001' },
    },
    {
      id: 9301,
      at: '2026-10-12T10:05:00+06:00',
      who: 'nadia@lytro.app',
      type: 'operator',
      action: 'tenant_suspended',
      shop: 'ten-0007',
      target: 'tenant',
      summary: {
        reason: reason(
          'Counterfeit chargers reported by two shoppers; listings under review',
          'দুজন ক্রেতা নকল চার্জারের অভিযোগ করেছেন; লিস্টিং রিভিউ চলছে',
        ),
      },
    },
  ];
}

function actorIdOf(email: string | null): string | null {
  if (email === 'ops@lytro.app') return OPERATOR_ID;
  if (email === 'nadia@lytro.app') return NADIA_ID;
  return null;
}

function entryOf(fixture: AuditFixture, language: string) {
  const index = language === 'bn' ? 1 : 0;
  const summary = Object.fromEntries(
    Object.entries(fixture.summary).map(([key, value]) => [
      key,
      Array.isArray(value) ? (value as unknown as Words)[index] : value,
    ]),
  );
  const shop = fixture.shop ? SHOPS[fixture.shop] : undefined;
  return {
    id: fixture.id,
    actorType: fixture.type,
    actorId: actorIdOf(fixture.who),
    actorEmail: fixture.who,
    action: fixture.action,
    targetType: fixture.target,
    targetId: fixture.shop ?? (fixture.target === 'setting' ? null : 'pm-upay'),
    result: 'success',
    summary,
    createdAt: new Date(fixture.at).toISOString(),
    shop: fixture.shop && shop ? { id: fixture.shop, ...shop } : null,
  };
}

// The sketch's revenue by week this month, and by month this year.
type Bucket = {
  from: string;
  to: string;
  wallet: Record<string, number>;
  balance: Record<string, number>;
  givenBack: number;
  manual: Record<string, number>;
};

const MONTH: Bucket[] = [
  {
    from: '2026-10-01',
    to: '2026-10-02',
    wallet: { purchase: 1347, renewal: 898, upgrade: 0, addon: 99 },
    balance: {
      plan_payment: 449,
      addon: 0,
      sms: 212.3,
      verification_fee: 40,
      order_fee: 96,
      product_fee: 0,
      ai: 16,
      fraud_check: 12,
    },
    givenBack: 0,
    manual: { plans: 0, plansReversed: 0, topUps: 0, topUpsReversed: 0 },
  },
  {
    from: '2026-10-03',
    to: '2026-10-09',
    wallet: { purchase: 4490, renewal: 6286, upgrade: 1500, addon: 495 },
    balance: {
      plan_payment: 1796,
      addon: 198,
      sms: 905.6,
      verification_fee: 160,
      order_fee: 412,
      product_fee: 30,
      ai: 74,
      fraud_check: 46,
    },
    givenBack: 38.5,
    manual: { plans: 449, plansReversed: 0, topUps: 1000, topUpsReversed: 0 },
  },
  {
    from: '2026-10-10',
    to: '2026-10-16',
    wallet: { purchase: 5388, renewal: 7633, upgrade: 0, addon: 297 },
    balance: {
      plan_payment: 2245,
      addon: 99,
      sms: 1012.2,
      verification_fee: 200,
      order_fee: 468,
      product_fee: 25,
      ai: 88,
      fraud_check: 58,
    },
    givenBack: 0,
    manual: { plans: 0, plansReversed: 0, topUps: 500, topUpsReversed: 0 },
  },
  {
    from: '2026-10-17',
    to: '2026-10-21',
    wallet: { purchase: 3592, renewal: 4939, upgrade: 700, addon: 198 },
    balance: {
      plan_payment: 1347,
      addon: 99,
      sms: 688.4,
      verification_fee: 120,
      order_fee: 301,
      product_fee: 10,
      ai: 52,
      fraud_check: 30,
    },
    givenBack: 12.2,
    manual: { plans: 5190, plansReversed: 0, topUps: 2000, topUpsReversed: 500 },
  },
];

const YEAR: Bucket[] = Array.from({ length: 10 }, (_, i) => {
  const month = String(i + 1).padStart(2, '0');
  return {
    from: `2026-${month}-01`,
    to: i === 9 ? '2026-10-21' : `2026-${month}-28`,
    wallet: {
      purchase: 6000 + i * 1300,
      renewal: 4000 + i * 1900,
      upgrade: i % 3 ? 700 : 0,
      addon: 300 + i * 90,
    },
    balance: {
      plan_payment: 1200 + i * 520,
      sms: 900 + i * 260,
      verification_fee: 80 + i * 40,
      order_fee: 300 + i * 150,
      ai: i > 7 ? 120 : 0,
      fraud_check: i > 7 ? 90 : 0,
    },
    givenBack: i * 9,
    manual: {
      plans: i === 9 ? 5639 : i % 4 ? 449 : 0,
      plansReversed: 0,
      topUps: i % 2 ? 1000 : 0,
      topUpsReversed: i === 9 ? 500 : 0,
    },
  };
});

const money = (value: number): string => value.toFixed(2);

function moneyOf(record: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, money(value)]));
}

function sumOf(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function figuresOf(bucket: Omit<Bucket, 'from' | 'to'>) {
  const earned =
    sumOf(Object.values(bucket.wallet)) +
    sumOf(Object.values(bucket.balance)) -
    bucket.givenBack +
    (bucket.manual.plans ?? 0) -
    (bucket.manual.plansReversed ?? 0);
  return {
    wallet: moneyOf(bucket.wallet),
    // The server leaves out a kind nothing was spent on.
    balance: moneyOf(Object.fromEntries(Object.entries(bucket.balance).filter(([, v]) => v > 0))),
    givenBack: money(bucket.givenBack),
    manual: moneyOf(bucket.manual),
    earned: money(earned),
  };
}

function totalOf(buckets: Bucket[]): Omit<Bucket, 'from' | 'to'> {
  const add = (key: 'wallet' | 'balance' | 'manual') =>
    buckets.reduce<Record<string, number>>((sum, bucket) => {
      for (const [kind, value] of Object.entries(bucket[key])) sum[kind] = (sum[kind] ?? 0) + value;
      return sum;
    }, {});
  return {
    wallet: add('wallet'),
    balance: add('balance'),
    givenBack: sumOf(buckets.map((bucket) => bucket.givenBack)),
    manual: add('manual'),
  };
}

const ZERO: Omit<Bucket, 'from' | 'to'> = {
  wallet: { purchase: 0, renewal: 0, upgrade: 0, addon: 0 },
  balance: {},
  givenBack: 0,
  manual: { plans: 0, plansReversed: 0, topUps: 0, topUpsReversed: 0 },
};

function revenueOf(url: URL, empty: boolean) {
  const from = url.searchParams.get('dateFrom') ?? '2026-10-01';
  const to = url.searchParams.get('dateTo') ?? '2026-10-21';
  const buckets = from.slice(0, 7) === '2026-01' ? YEAR : MONTH;
  if (empty) {
    return {
      dateFrom: from,
      dateTo: to,
      buckets: buckets.map((bucket) => ({ from: bucket.from, to: bucket.to, ...figuresOf(ZERO) })),
      total: figuresOf(ZERO),
      recordedSince: null,
    };
  }
  return {
    dateFrom: from,
    dateTo: to,
    buckets: buckets.map((bucket) => ({ from: bucket.from, to: bucket.to, ...figuresOf(bucket) })),
    total: figuresOf(totalOf(buckets)),
    recordedSince: '2026-10-03',
  };
}

const MOVES: [string, string, number, number, number][] = [
  ['2026-10-01', '2026-10-02', 9, 2, 1],
  ['2026-10-03', '2026-10-09', 21, 5, 3],
  ['2026-10-10', '2026-10-16', 17, 4, 2],
  ['2026-10-17', '2026-10-21', 12, 3, 2],
];

function shopsOf(url: URL, empty: boolean) {
  const buckets = MOVES.map(([from, to, opened, becamePaying, lapsed]) => ({
    from,
    to,
    opened: empty ? 0 : opened,
    becamePaying: empty ? 0 : becamePaying,
    lapsed: empty ? 0 : lapsed,
  }));
  const states: [string, number][] = [
    ['trial', 118],
    ['pay_as_you_go', 44],
    ['active', 201],
    ['grace', 14],
    ['read_only', 9],
    ['locked', 7],
    ['archived', 19],
  ];
  return {
    dateFrom: url.searchParams.get('dateFrom') ?? '2026-10-01',
    dateTo: url.searchParams.get('dateTo') ?? '2026-10-21',
    now: {
      total: empty ? 0 : 412,
      byState: empty ? [] : states.map(([state, count]) => ({ state, count })),
      byPlan: empty
        ? []
        : [
            { planId: 'p-trial', planName: 'Trial', payAsYouGo: false, count: 118 },
            { planId: 'p-payg', planName: 'Pay-as-you-go', payAsYouGo: true, count: 44 },
            { planId: 'p-starter', planName: 'Starter', payAsYouGo: false, count: 168 },
            { planId: 'p-growth', planName: 'Growth', payAsYouGo: false, count: 61 },
            { planId: 'p-pro', planName: 'Pro', payAsYouGo: false, count: 21 },
          ],
    },
    buckets,
    total: {
      opened: sumOf(buckets.map((bucket) => bucket.opened)),
      becamePaying: sumOf(buckets.map((bucket) => bucket.becamePaying)),
      lapsed: sumOf(buckets.map((bucket) => bucket.lapsed)),
    },
  };
}

const CONSUMERS = [
  'Faiza Shoes',
  'Dhaka Gadget House',
  'Arif Electronics',
  'Rahim Fashion',
  'Tanvir Mobiles',
  'Joy Pharmacy',
  'Nusrat Cosmetics',
  'Sadia Collection',
  'Mim Bakery',
  'Keya Boutique',
  'Shapla Crafts',
  'Rupa Sarees',
  'Hasan Tea House',
  'Bornali Jewellers',
  'Green Leaf Organics',
  'Moon Kids Wear',
  'Sylhet Spices',
  'Padma Fish Mart',
  'Chattala Furniture',
  'Kona Handloom',
];
const PHONES = [
  '01611223300',
  '01819220011',
  '01716880011',
  '01712345678',
  '01713552200',
  '01755123321',
  '01611908070',
  '01815345678',
  '01822450045',
  '01911223344',
  '01733118899',
  '01914560012',
  '01552700300',
  '01675220099',
  '01788441122',
  '01815990011',
  '01711554433',
  '01921667788',
  '01818303030',
  '01631909012',
];

function consumersOf(url: URL, empty: boolean) {
  const metric = url.searchParams.get('metric') ?? 'storage';
  const top = metric === 'sms' ? 4200 : metric === 'bandwidth' ? 98e9 : 7.9e9;
  return {
    dateFrom: url.searchParams.get('dateFrom') ?? '2026-10-01',
    dateTo: url.searchParams.get('dateTo') ?? '2026-10-21',
    metric,
    shops: empty
      ? []
      : CONSUMERS.map((name, index) => ({
          id: `ten-c${String(index)}`,
          name,
          slug: name.toLowerCase().replace(/[^a-z]+/g, '-'),
          ownerPhone: PHONES[index] ?? null,
          value: Math.round(top / (1 + index * 0.55)),
        })),
  };
}

const TOP_SHOPS: [string, number, number][] = [
  ['Faiza Shoes', 1.84e6, 98e9],
  ['Dhaka Gadget House', 1.21e6, 71e9],
  ['Arif Electronics', 0.96e6, 52e9],
  ['Rahim Fashion', 0.88e6, 47e9],
  ['Tanvir Mobiles', 0.61e6, 33e9],
  ['Joy Pharmacy', 0.52e6, 21e9],
  ['Nusrat Cosmetics', 0.47e6, 26e9],
  ['Sadia Collection', 0.41e6, 19e9],
  ['Mim Bakery', 0.33e6, 12e9],
  ['Keya Boutique', 0.29e6, 14e9],
];

/** The sketch's p88-media: this period, read 21 of 31 days, well under a $10 budget. */
export function drawnMediaCosts(): Record<string, unknown> {
  return {
    period: { dateFrom: '2026-10-01', dateTo: '2026-10-31', days: 31, daysRecorded: 21 },
    connected: true,
    readAt: '2026-10-21T14:05:00+06:00',
    budget: {
      amount: '10.00',
      alertPercent: 80,
      alertAt: '8.00',
      usedPercent: 58,
      alertEmail: 'ops@lytro.app',
      alertSentAt: null,
    },
    r2: {
      classA: { operations: 620_000, billableMillions: 0, cost: '0.00' },
      classB: { operations: 4_100_000, billableMillions: 0, cost: '0.00' },
      storage: { gbMonths: 23.4, billableGbMonths: 14, cost: '0.21' },
      cost: '0.21',
      buckets: [
        {
          bucket: 'lytro-media',
          classA: 588100,
          classB: 3912000,
          freeOps: 40210,
          gbMonths: 21.9,
          latestBytes: 34.1e9,
          objects: 81240,
        },
        {
          bucket: 'lytro-evidence',
          classA: 2410,
          classB: 1880,
          freeOps: 0,
          gbMonths: 0.04,
          latestBytes: 0.06e9,
          objects: 312,
        },
        {
          bucket: '',
          classA: 1210,
          classB: 0,
          freeOps: 18,
          gbMonths: 0,
          latestBytes: 0,
          objects: 0,
        },
      ],
    },
    workers: {
      requests: 11_300_000,
      bytes: 612e9,
      billableMillions: 2,
      monthly: '5.00',
      cost: '5.60',
    },
    total: '5.81',
    topShops: TOP_SHOPS.map(([name, requests, bytes], index) => ({
      tenantId: `ten-m${String(index)}`,
      name,
      slug: name.toLowerCase().replace(/[^a-z]+/g, '-'),
      requests,
      bytes,
    })),
    periods: [
      { dateFrom: '2026-10-01', dateTo: '2026-10-31' },
      { dateFrom: '2026-09-01', dateTo: '2026-09-30' },
      { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    ],
    prices: {
      r2ClassAPerMillion: 4.5,
      r2ClassBPerMillion: 0.36,
      r2StoragePerGbMonth: 0.015,
      r2FreeClassAMillions: 1,
      r2FreeClassBMillions: 10,
      r2FreeStorageGbMonths: 10,
      workersMonthly: 5,
      workersIncludedMillions: 10,
      workersPerMillion: 0.3,
    },
  };
}

/** The sketch's p88-media-alert: past 80% of the budget, the alert sent on 19 Oct. */
export function alertedMediaCosts(): Record<string, unknown> {
  const drawn = drawnMediaCosts();
  return {
    ...drawn,
    budget: {
      ...(drawn.budget as Record<string, unknown>),
      usedPercent: 84,
      alertSentAt: '2026-10-19T09:00:00+06:00',
    },
    total: '8.40',
  };
}

/** The sketch's p88-media-noemail: no address for the alert. */
export function noEmailMediaCosts(): Record<string, unknown> {
  const drawn = drawnMediaCosts();
  return { ...drawn, budget: { ...(drawn.budget as Record<string, unknown>), alertEmail: null } };
}

/** The sketch's p88-media-off: no Cloudflare token, so only the Worker's requests count. */
export function offMediaCosts(): Record<string, unknown> {
  const drawn = drawnMediaCosts();
  return {
    ...drawn,
    connected: false,
    r2: { ...(drawn.r2 as Record<string, unknown>), buckets: [] },
  };
}

export function recordsDefaults(): RecordsMockState {
  return { auditEntries: drawnAudit(), mediaCosts: drawnMediaCosts(), reportsEmpty: false };
}

/** What the Records routes answer; undefined for any other route. */
export function recordsAnswer(
  path: string,
  url: URL,
  state: RecordsMockState & { language: string },
): { data: unknown } | undefined {
  if (path === '/operator/reports/revenue') return { data: revenueOf(url, state.reportsEmpty) };
  if (path === '/operator/reports/shops') return { data: shopsOf(url, state.reportsEmpty) };
  if (path === '/operator/reports/consumers') {
    return { data: consumersOf(url, state.reportsEmpty) };
  }
  if (path === '/operator/media-costs') return { data: state.mediaCosts };
  if (path !== '/operator/audit') return undefined;
  const wanted = (key: string) => url.searchParams.get(key);
  const from = wanted('dateFrom');
  const to = wanted('dateTo');
  const items = state.auditEntries
    .map((fixture) => entryOf(fixture, state.language))
    .filter(
      (entry) =>
        (!wanted('tenantId') || entry.shop?.id === wanted('tenantId')) &&
        (!wanted('actorId') || entry.actorId === wanted('actorId')) &&
        (!wanted('action') || entry.action === wanted('action')) &&
        (!from || entry.createdAt.slice(0, 10) >= from) &&
        (!to || entry.createdAt.slice(0, 10) <= to),
    );
  // The sketch's log runs on past what it draws: a first page has more behind it, the next none.
  if (wanted('cursor')) return { data: { items: [], next: null } };
  return { data: { items, next: items.length ? 9300 : null } };
}
