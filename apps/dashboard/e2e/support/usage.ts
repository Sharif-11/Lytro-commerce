import { GROWTH } from './catalogue';

// The usage page and the add-on catalogue against a mocked API (Slice 11.5c), the figures the prototype draws for
// Megh Fashion on Starter: 80 of 100 products, a seat of two, 0.9 of 2 GB stored, 18.6 of 30 GB of bandwidth, 48,210
// of 200,000 requests and 6 of 10 free SMS, 20 days into a cycle, with the sketch's day bars.

const GB = 1024 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Metric =
  | 'products'
  | 'seats'
  | 'storage'
  | 'bandwidth'
  | 'requests'
  | 'essential_sms_monthly'
  | 'essential_sms_total';

/** The usage page's state where a test needs it to differ from the drawn shop's. */
export interface UsageFixture {
  /** Each metric's use, in its own unit: GB for storage and bandwidth. */
  used?: Partial<Record<Metric, number>>;
  /** Each metric's limit (the allowance, for bandwidth and requests), likewise; null is unlimited. */
  limits?: Partial<Record<Metric, number | null>>;
  /** The server's run-out date for bandwidth or requests, in days from now. */
  runsOutDays?: Partial<Record<'bandwidth' | 'requests', number>>;
  /** Auto-buy for bandwidth: on, could not pay, packs bought this cycle. */
  autoBuy?: { bandwidth?: boolean; failed?: boolean; packs?: number };
  /** A trial: its free SMS a total of 8, and nothing for sale. */
  trial?: boolean;
}

const DRAWN_USED: Record<Metric, number> = {
  products: 80,
  seats: 1,
  storage: 0.9,
  bandwidth: 18.6,
  requests: 48_210,
  essential_sms_monthly: 6,
  essential_sms_total: 0,
};
const DRAWN_LIMITS: Record<Metric, number> = {
  products: 100,
  seats: 2,
  storage: 2,
  bandwidth: 30,
  requests: 200_000,
  essential_sms_monthly: 10,
  essential_sms_total: 8,
};
const BYTES: ReadonlySet<Metric> = new Set(['storage', 'bandwidth']);
const SERVING: ReadonlySet<Metric> = new Set(['bandwidth', 'requests']);
// The sketch's bars: GB of bandwidth, and thousands of requests, a day.
const BANDWIDTH_DAYS = [
  0.6, 0.9, 0.5, 1.1, 1.4, 0.8, 1.6, 1.2, 0.7, 1.3, 1.9, 0.9, 1.1, 1.7, 2.2, 1.4, 0.9, 1.2, 0.8,
  1.8, 2.4,
];
const REQUEST_DAYS = [
  1.2, 1.5, 1.0, 1.9, 2.2, 1.4, 2.6, 2.0, 1.3, 2.1, 3.0, 1.6, 1.9, 2.7, 3.4, 2.3, 1.5, 2.0, 1.4,
  2.9, 3.6,
];

// The add-on each limit's near metric is offered, as the server's suggestion names it (LIM-01).
const RAISES: Partial<
  Record<Metric, { addonId: string; key: string; name: string; monthly: number }>
> = {
  products: {
    addonId: 'a-products',
    key: 'extra_products',
    name: 'Extra 500 products',
    monthly: 149,
  },
  seats: { addonId: 'a-seat', key: 'extra_seat', name: 'One seat', monthly: 49 },
  storage: { addonId: 'a-storage', key: 'extra_storage', name: '1 GB storage', monthly: 29 },
  bandwidth: {
    addonId: 'a-bandwidth',
    key: 'bandwidth_pack',
    name: '10 GB bandwidth',
    monthly: 30,
  },
  requests: { addonId: 'a-requests', key: 'request_pack', name: '100,000 requests', monthly: 20 },
};

const dhakaDay = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(ms));

function levelOf(used: number, limit: number | null, serving: boolean): number | string | null {
  if (!limit) return null;
  const share = (used * 100) / limit;
  if (serving && share >= 110) return 'stopped';
  return [100, 95, 80, 50].find((step) => share >= step) ?? null;
}

// The metric each limit add-on raises, and by how much of the metric's own unit one adds (LIM-02).
const RAISED_BY: Record<string, { metric: Metric; per: (unitSize: number) => number }> = {
  products: { metric: 'products', per: (unitSize) => unitSize },
  staff: { metric: 'seats', per: (unitSize) => unitSize },
  storage_mb: { metric: 'storage', per: (unitSize) => unitSize / 1024 },
};

/** What the add-ons the shop has add to a metric's limit, as the server counts them in. */
function addedBy(owned: readonly OwnedFixture[], metric: Metric): number {
  return owned.reduce((sum, each) => {
    const item = CATALOGUE.find((entry) => entry.key === each.key);
    const raises = item?.limitKey ? RAISED_BY[item.limitKey] : undefined;
    if (!item || !raises || raises.metric !== metric) return sum;
    return sum + raises.per(item.unitSize ?? 0) * (each.quantity ?? 1);
  }, 0);
}

/**
 * GET /usage for the fixture: the drawn shop where it says nothing else, its limits raised by the add-ons it has
 * unless a test gives the limit whole.
 */
export function usageAnswer(fixture: UsageFixture & AddonsFixture = {}): unknown {
  const firstDay = dhakaDay(Date.now() - 20 * DAY_MS);
  const cycleStart = new Date(`${firstDay}T00:00:00+06:00`).toISOString();
  const cycleEnd = new Date(Date.parse(cycleStart) + 31 * DAY_MS).toISOString();
  const metrics: Metric[] = fixture.trial
    ? ['products', 'seats', 'storage', 'bandwidth', 'requests', 'essential_sms_total']
    : ['products', 'seats', 'storage', 'bandwidth', 'requests', 'essential_sms_monthly'];
  const figures = metrics.map((metric) => {
    const scale = BYTES.has(metric) ? GB : 1;
    const used = (fixture.used?.[metric] ?? DRAWN_USED[metric]) * scale;
    const given = fixture.limits?.[metric];
    const limit =
      given === null
        ? null
        : (given ?? DRAWN_LIMITS[metric] + addedBy(fixture.owned ?? [], metric)) * scale;
    const serving = SERVING.has(metric);
    const days = serving ? fixture.runsOutDays?.[metric as 'bandwidth' | 'requests'] : undefined;
    return {
      metric,
      used,
      limit,
      packLeft: serving ? 0 : null,
      stopAt: serving && limit !== null ? limit * 1.1 : null,
      unit: BYTES.has(metric) ? 'bytes' : 'count',
      perCycle: serving || metric === 'essential_sms_monthly',
      level: levelOf(used, limit, serving),
      runsOutAt: days === undefined ? null : new Date(Date.now() + days * DAY_MS).toISOString(),
    };
  });
  const near = figures.filter(
    (figure) => figure.limit !== null && figure.used * 100 >= figure.limit * 80,
  );
  const items = near.map((figure) => RAISES[figure.metric]);
  const growth = {
    kind: 'plan',
    planId: GROWTH,
    name: 'Growth',
    price: 699,
    months: 1,
    monthly: 699,
  };
  const addons = items.every(Boolean)
    ? {
        kind: 'addons',
        items: near.map((figure) => ({
          ...RAISES[figure.metric],
          metric: figure.metric,
          quantity: 1,
        })),
        monthly: items.reduce((sum, item) => sum + (item?.monthly ?? 0), 0),
      }
    : null;
  const auto = fixture.autoBuy ?? {};
  return {
    cycleStart,
    cycleEnd,
    metrics: figures,
    bandwidthDays: BANDWIDTH_DAYS.map((value, index) => ({
      day: dhakaDay(Date.parse(cycleStart) + index * DAY_MS),
      bytes: Math.round(value * GB),
      requests: 0,
    })),
    requestDays: REQUEST_DAYS.map((value, index) => ({
      day: dhakaDay(Date.parse(cycleStart) + index * DAY_MS),
      requests: Math.round(value * 1000),
    })),
    suggestions: near.length
      ? addons
        ? { first: addons, alternative: growth }
        : { first: growth, alternative: null }
      : null,
    fastSpendAlertedAt: null,
    packs: [
      {
        metric: 'bandwidth',
        offer: fixture.trial
          ? null
          : { addonId: 'a-bandwidth', name: '10 GB bandwidth', price: 30 },
        autoBuy: auto.bandwidth ?? false,
        autoPacks: auto.packs ?? 0,
        autoBuyFailed: auto.failed ?? false,
      },
      {
        metric: 'requests',
        offer: fixture.trial
          ? null
          : { addonId: 'a-requests', name: '100,000 requests', price: 20 },
        autoBuy: false,
        autoPacks: 0,
        autoBuyFailed: false,
      },
    ],
  };
}

interface CatalogueItem {
  id: string;
  key: string;
  kind: 'limit' | 'pack' | 'feature';
  limitKey: string | null;
  unitSize: number | null;
  price: number;
  labelEn: string;
  labelBn: string;
}

/** The catalogue as the prototype names it (PLN-13): ৳149, ৳49 and ৳29 a month, the brand, and the two packs. */
export const CATALOGUE: CatalogueItem[] = [
  {
    id: 'a-products',
    key: 'extra_products',
    kind: 'limit',
    limitKey: 'products',
    unitSize: 500,
    price: 149,
    labelEn: 'Extra 500 products',
    labelBn: 'আরও 500 প্রোডাক্ট',
  },
  {
    id: 'a-seat',
    key: 'extra_seat',
    kind: 'limit',
    limitKey: 'staff',
    unitSize: 1,
    price: 49,
    labelEn: 'One seat',
    labelBn: 'একটা সিট',
  },
  {
    id: 'a-storage',
    key: 'extra_storage',
    kind: 'limit',
    limitKey: 'storage_mb',
    unitSize: 1024,
    price: 29,
    labelEn: '1 GB storage',
    labelBn: '1 GB স্টোরেজ',
  },
  {
    id: 'a-bandwidth',
    key: 'bandwidth_pack',
    kind: 'pack',
    limitKey: 'bandwidth_gb',
    unitSize: 10,
    price: 30,
    labelEn: '10 GB bandwidth',
    labelBn: '10 GB ব্যান্ডউইথ',
  },
  {
    id: 'a-requests',
    key: 'request_pack',
    kind: 'pack',
    limitKey: 'requests_monthly',
    unitSize: 100_000,
    price: 20,
    labelEn: '100,000 requests',
    labelBn: '1,00,000 রিকোয়েস্ট',
  },
  {
    id: 'a-brand',
    key: 'brand_identity',
    kind: 'feature',
    limitKey: null,
    unitSize: null,
    price: 149,
    labelEn: 'Brand identity',
    labelBn: 'ব্র্যান্ড আইডেন্টিটি',
  },
];

/** An add-on the shop has (GET /addons/mine), by its catalogue key. */
export interface OwnedFixture {
  key: string;
  quantity?: number;
  /** How it renews: with_plan, from_balance, off, retired, unlimited or balance_short. */
  renewal?: string;
  /** Days to its end; 20, the drawn shop's period, when left out. */
  endsInDays?: number;
  /** Within 7 days of an end it will not renew past. */
  endsSoon?: boolean;
}

/** The add-ons screen's state (Slice 11.5c), where a test needs it to differ from a shop with none. */
export interface AddonsFixture {
  owned?: OwnedFixture[];
  /** What is left of the packs: GB of bandwidth, requests. */
  packsLeft?: { bandwidth?: number; requests?: number };
  /** An item's reason it cannot be bought, by key (a limit already unlimited on Pro, say). */
  blocked?: Record<string, string>;
  /** BIL-09: the server works out this amount for the next request instead of the one shown, and says so once. */
  amountChangedTo?: string | null;
}

/** Where the shop stands, as the add-on routes see it: a trial and grace buy none, pay-as-you-go its own 30 days. */
export interface Standing {
  trial?: boolean;
  grace?: boolean;
  payg?: boolean;
}

function itemOf(key: string): CatalogueItem {
  const item = CATALOGUE.find((each) => each.key === key);
  if (!item) throw new Error(`no add-on ${key}`);
  return item;
}

/** GET /addons/mine for the fixture. */
export function shopAddonsAnswer(fixture: AddonsFixture & UsageFixture = {}): unknown {
  const owned = (fixture.owned ?? []).map((each) => {
    const item = itemOf(each.key);
    const renewal = each.renewal ?? 'with_plan';
    return {
      id: `p-${each.key}`,
      addonId: item.id,
      key: item.key,
      kind: item.kind,
      labelEn: item.labelEn,
      labelBn: item.labelBn,
      limitKey: item.limitKey,
      unitSize: item.unitSize,
      quantity: each.quantity ?? 1,
      startsAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
      expiresAt: new Date(Date.now() + (each.endsInDays ?? 20) * DAY_MS).toISOString(),
      renews: renewal !== 'off',
      renewal,
      endsSoon: each.endsSoon ?? false,
    };
  });
  return {
    addons: owned,
    brandIdentity: owned.some((each) => each.key === 'brand_identity'),
    packs: [
      {
        metric: 'bandwidth',
        left: Math.round((fixture.packsLeft?.bandwidth ?? 0) * GB),
        autoBuy: fixture.autoBuy?.bandwidth ?? false,
      },
      { metric: 'requests', left: fixture.packsLeft?.requests ?? 0, autoBuy: false },
    ],
  };
}

/** UPG-14: what the plan's renewal carries -- every add-on set to renew with it -- as GET /billing/prices lists it. */
export function renewingAddons(fixture: AddonsFixture = {}): unknown[] {
  return (fixture.owned ?? [])
    .filter((each) => ['with_plan', 'balance_short', undefined].includes(each.renewal))
    .map((each) => {
      const item = itemOf(each.key);
      const quantity = each.quantity ?? 1;
      return {
        addonId: item.id,
        key: item.key,
        labelEn: item.labelEn,
        quantity,
        amount: `${String(item.price * quantity)}.00`,
      };
    });
}

/**
 * GET /addons: each item priced as the server prices it -- 20 of the period's 30 days left, each quantity rounded once
 * on its total; on pay-as-you-go a whole month for its own 30 days; a pack its whole price -- or no price and why: a
 * trial or grace buys none, a feature the shop has is not sold twice.
 */
export function addonOffers(fixture: AddonsFixture & UsageFixture & Standing = {}): unknown {
  return CATALOGUE.map((item) => {
    const addon = { ...item, price: `${String(item.price)}.00`, retiredAt: null };
    const has = (fixture.owned ?? []).some((each) => each.key === item.key);
    const blockedBy =
      fixture.trial || fixture.grace
        ? 'AddonNotAvailable'
        : (fixture.blocked?.[item.key] ??
          (item.kind === 'feature' && has ? 'AddonAlreadyActive' : null));
    if (blockedBy) {
      return {
        addon,
        price: null,
        expiresAt: null,
        blockedBy,
        amounts: [],
        daysLeft: null,
        renewalPrice: null,
      };
    }
    const pack = item.kind === 'pack';
    const most = item.kind === 'feature' ? 1 : 10;
    const share = fixture.payg ? 1 : 20 / 30;
    const amounts = Array.from({ length: most }, (_, index) =>
      pack ? item.price * (index + 1) : Math.round(item.price * (index + 1) * share),
    );
    const days = fixture.payg ? 30 : 20;
    return {
      addon,
      price: amounts[0],
      expiresAt: pack ? null : new Date(Date.now() + days * DAY_MS).toISOString(),
      blockedBy: null,
      amounts,
      daysLeft: pack ? null : days,
      renewalPrice: pack ? null : item.price,
    };
  });
}
