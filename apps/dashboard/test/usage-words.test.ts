import { describe, expect, it } from 'vitest';
import { AddonKind, UsageMetric } from '@lytronix/validators';
import { usageSize } from '../src/lib/limits';
import type { AddonOffer } from '../src/types/addons';
import type { ShopUsage, UsageFigure } from '../src/types/usage';
import {
  bannerOf,
  cycleDays,
  raiseItems,
  worstFigure,
  type BannerContext,
} from '../src/views/usage/usage-words';

// The key and its values, so the wording is checked without the dictionary.
const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const GB = 1024 * 1024 * 1024;
const NOW = Date.parse('2026-10-21T06:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function figure(
  metric: UsageMetric,
  used: number,
  limit: number | null,
  given: Partial<UsageFigure> = {},
): UsageFigure {
  const serving = metric === UsageMetric.Bandwidth || metric === UsageMetric.Requests;
  const share = limit ? (used * 100) / limit : 0;
  const level = share >= 100 ? 100 : share >= 95 ? 95 : share >= 80 ? 80 : share >= 50 ? 50 : null;
  return {
    metric,
    used,
    limit,
    packLeft: serving ? 0 : null,
    stopAt: serving && limit ? limit * 1.1 : null,
    unit: metric === UsageMetric.Storage || metric === UsageMetric.Bandwidth ? 'bytes' : 'count',
    perCycle: serving,
    level,
    runsOutAt: null,
    ...given,
  };
}

function offer(
  key: string,
  kind: AddonKind,
  limitKey: string,
  unitSize: number,
  price: number,
  amount: number,
): AddonOffer {
  return {
    addon: {
      id: `id-${key}`,
      key,
      kind,
      limitKey,
      unitSize,
      price: `${String(price)}.00`,
      labelEn: `${key} en`,
      labelBn: `${key} bn`,
      retiredAt: null,
    },
    price: amount,
    expiresAt: null,
    blockedBy: null,
    amounts: [amount],
    daysLeft: kind === AddonKind.Pack ? null : 20,
    renewalPrice: kind === AddonKind.Pack ? null : price,
  };
}

const OFFERS = [
  offer('extra_products', AddonKind.Limit, 'products', 500, 149, 99),
  offer('extra_seat', AddonKind.Limit, 'staff', 1, 49, 33),
  offer('bandwidth_pack', AddonKind.Pack, 'bandwidth_gb', 10, 30, 30),
  offer('request_pack', AddonKind.Pack, 'requests_monthly', 100000, 20, 20),
];

function usage(metrics: UsageFigure[], given: Partial<ShopUsage> = {}): ShopUsage {
  return {
    // 1 to 31 October in Dhaka: the next cycle starts at its midnight.
    cycleStart: '2026-09-30T18:00:00.000Z',
    cycleEnd: '2026-10-31T18:00:00.000Z',
    metrics,
    bandwidthDays: [],
    requestDays: [],
    suggestions: null,
    fastSpendAlertedAt: null,
    packs: [
      {
        metric: UsageMetric.Bandwidth,
        offer: { addonId: 'id-bandwidth_pack', name: '10 GB', price: 30 },
        autoBuy: false,
        autoPacks: 0,
        autoBuyFailed: false,
      },
      {
        metric: UsageMetric.Requests,
        offer: { addonId: 'id-request_pack', name: '100k', price: 20 },
        autoBuy: false,
        autoPacks: 0,
        autoBuyFailed: false,
      },
    ],
    ...given,
  };
}

const OWNER: BannerContext = {
  t,
  language: 'en',
  offers: OFFERS,
  canManage: true,
  channels: { email: true, phone: true },
  smsRate: '৳0.55',
};

describe("Usage's one banner (TENANT-DASHBOARD-DESIGN §7.24, agreed for Slice 11.5c)", () => {
  it('is for the metric nearest its stop, the card order breaking a tie', () => {
    const products = figure(UsageMetric.Products, 80, 100);
    const seats = figure(UsageMetric.Seats, 2, 2);
    const stopped = figure(UsageMetric.Bandwidth, 34 * GB, 30 * GB, { level: 'stopped' });
    expect(worstFigure([products, seats])).toBe(seats);
    expect(worstFigure([products, seats, stopped])).toBe(stopped);
    const storage = figure(UsageMetric.Storage, 1.7 * GB, 2 * GB);
    expect(worstFigure([products, storage])).toBe(products);
    expect(worstFigure([figure(UsageMetric.Products, 60, 100)])).toBeNull();
  });

  it('says the room left at 80% of a total, and tells only an owner of the email', () => {
    const shop = usage([figure(UsageMetric.Products, 80, 100), figure(UsageMetric.Seats, 1, 2)]);
    expect(bannerOf(shop, OWNER)).toEqual({
      tone: 'warn',
      text: 'uRoom {"metric":"uProducts","percent":80,"count":"20"} uMailed',
      link: null,
    });
    expect(bannerOf(shop, { ...OWNER, channels: null })?.text).toBe(
      'uRoom {"metric":"uProducts","percent":80,"count":"20"}',
    );
  });

  it('dates the run-out of bandwidth from the server, or says it lasts, and offers auto-buy at 80%', () => {
    const runsOutAt = new Date(NOW + 5 * DAY_MS).toISOString();
    const pacing = usage([figure(UsageMetric.Bandwidth, 24 * GB, 30 * GB, { runsOutAt })]);
    const banner = bannerOf(pacing, OWNER);
    expect(banner?.text).toContain('uPaceOut {"date":"26 Oct","end":"31 Oct"}');
    expect(banner?.link).toEqual({
      kind: 'pack',
      metric: UsageMetric.Bandwidth,
      label: 'w80Offer',
    });
    const lasting = usage([figure(UsageMetric.Bandwidth, 24 * GB, 30 * GB)]);
    expect(bannerOf(lasting, OWNER)?.text).toContain('uPaceLasts {"end":"31 Oct"}');
    // With auto-buy on there is nothing to turn on.
    const on = usage([figure(UsageMetric.Bandwidth, 24 * GB, 30 * GB)], {
      packs: usage([]).packs.map((pack) => ({ ...pack, autoBuy: true })),
    });
    expect(bannerOf(on, OWNER)?.link).toBeNull();
  });

  it('offers the pack at 95%, and past the limit tells of the SMS where one goes', () => {
    const near = usage([figure(UsageMetric.Requests, 190_000, 200_000)]);
    expect(bannerOf(near, OWNER)).toMatchObject({
      tone: 'bad',
      link: {
        kind: 'pack',
        metric: UsageMetric.Requests,
        label: 'pkBuyLink {"size":"100,000","amount":"৳20"}',
      },
    });
    const over = usage([figure(UsageMetric.Bandwidth, 31 * GB, 30 * GB)]);
    expect(bannerOf(over, OWNER)?.text).toBe(
      'uUsedUpBw {"used":"31 GB","limit":"30 GB","stop":"33 GB","end":"31 Oct"} uMailedSms',
    );
    expect(bannerOf(over, OWNER)?.link).toEqual({
      kind: 'pack',
      metric: UsageMetric.Bandwidth,
      label: 'pkLink {"size":"10 GB","amount":"৳30"}',
    });
    expect(bannerOf(over, { ...OWNER, channels: { email: false, phone: true } })?.text).toMatch(
      / wSmsSent$/,
    );
  });

  it('sends a shop whose auto-buy could not pay to top up', () => {
    const failed = usage([figure(UsageMetric.Bandwidth, 30.4 * GB, 30 * GB)], {
      packs: usage([]).packs.map((pack) => ({ ...pack, autoBuy: true, autoBuyFailed: true })),
    });
    const banner = bannerOf(failed, OWNER);
    expect(banner?.text).toContain('uAbFailed');
    expect(banner?.link).toEqual({ kind: 'topUp', label: 'topUp' });
  });

  it("names a full total's add-on with its price for the days left, never to read-only staff", () => {
    const full = usage([figure(UsageMetric.Seats, 2, 2)]);
    expect(bannerOf(full, OWNER)).toEqual({
      tone: 'bad',
      text: 'uFullSeats {"used":"2","limit":"2"} uMailed',
      link: {
        kind: 'addon',
        key: 'extra_seat',
        label: 'addonLink {"name":"extra_seat en","amount":"৳33"}',
      },
    });
    expect(bannerOf(full, { ...OWNER, canManage: false })?.link).toBeNull();
  });

  it('says what further essential SMS cost, at the rate when it may be read, and a trial waits for a plan', () => {
    const monthly = usage([figure(UsageMetric.EssentialSmsMonthly, 10, 10)]);
    expect(bannerOf(monthly, OWNER)?.text).toBe(
      'uFullSms {"used":"10","limit":"10","amount":"৳0.55"} uMailed',
    );
    expect(bannerOf(monthly, { ...OWNER, smsRate: null })?.text).toBe(
      'uFullSmsNoRate {"used":"10","limit":"10"} uMailed',
    );
    const total = usage([figure(UsageMetric.EssentialSmsTotal, 8, 8)]);
    expect(bannerOf(total, OWNER)?.text).toBe('uFullSmsTrial {"used":"8","limit":"8"} uMailed');
  });
});

describe('"To raise it" under each metric (LIM-01, agreed for Slice 11.5c)', () => {
  const suggestions: ShopUsage['suggestions'] = {
    first: {
      kind: 'addons',
      items: [
        {
          addonId: 'id-extra_products',
          key: 'extra_products',
          name: 'Extra products',
          metric: UsageMetric.Products,
          quantity: 1,
          monthly: 149,
        },
        {
          addonId: 'id-bandwidth_pack',
          key: 'bandwidth_pack',
          name: '10 GB',
          metric: UsageMetric.Bandwidth,
          quantity: 2,
          monthly: 60,
        },
      ],
      monthly: 209,
    },
    alternative: {
      kind: 'plan',
      planId: 'growth',
      name: 'Growth',
      price: 699,
      months: 1,
      monthly: 699,
    },
  };
  const products = figure(UsageMetric.Products, 80, 100);
  const bandwidth = figure(UsageMetric.Bandwidth, 28.5 * GB, 30 * GB);
  const storage = figure(UsageMetric.Storage, 1.7 * GB, 2 * GB);
  const shop = usage([products, bandwidth, storage], { suggestions });

  it("names the metric's own add-on or pack from the suggestion, then the plan", () => {
    expect(raiseItems(shop, products, OFFERS, t, 'bn')).toEqual([
      { kind: 'addon', key: 'extra_products', text: 'uRaiseAddon {"name":"extra_products bn"}' },
      { kind: 'plan', planId: 'growth', text: 'uRaisePlan {"plan":"Growth"}' },
    ]);
    expect(raiseItems(shop, bandwidth, OFFERS, t, 'en')[0]).toEqual({
      kind: 'pack',
      metric: UsageMetric.Bandwidth,
      text: 'uRaisePacks {"count":2,"size":"10 GB","amount":"৳60"}',
    });
    // A metric the suggestion has no add-on for names the plan alone.
    expect(raiseItems(shop, storage, OFFERS, t, 'en')).toEqual([
      { kind: 'plan', planId: 'growth', text: 'uRaisePlan {"plan":"Growth"}' },
    ]);
  });

  it('names nothing below 80%, and a custom plan when nothing fits', () => {
    expect(raiseItems(shop, figure(UsageMetric.Seats, 1, 2), OFFERS, t, 'en')).toEqual([]);
    const contact = usage([products], {
      suggestions: { first: { kind: 'contact' }, alternative: null },
    });
    expect(raiseItems(contact, products, OFFERS, t, 'en')).toEqual([
      { kind: 'contact', text: 'uRaiseContact' },
    ]);
  });
});

describe('the figures as the page writes them', () => {
  it('writes bytes in the unit of their limit, as the email does', () => {
    expect(usageSize(0.9 * GB, 2 * GB)).toBe('0.9 GB');
    expect(usageSize(30 * GB, 30 * GB)).toBe('30 GB');
    expect(usageSize(300 * 1024 * 1024, 500 * 1024 * 1024)).toBe('300 MB');
  });

  it('draws a bar for each day of the cycle up to today, a quiet day as nothing', () => {
    const shop = usage([]);
    const bars = cycleDays(shop, [{ day: '2026-10-02', value: 5 }], new Date(NOW).toISOString());
    expect(bars).toHaveLength(21);
    expect(bars[0]).toEqual({ day: '2026-10-01', value: 0 });
    expect(bars[1]).toEqual({ day: '2026-10-02', value: 5 });
    expect(bars.at(-1)?.day).toBe('2026-10-21');
  });
});
