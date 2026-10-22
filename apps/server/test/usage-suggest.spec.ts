import { UsageMetric, type PlanLimits } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/common/time';
import { GB } from '../src/modules/media/services/media-bandwidth';
import { suggest, type PlanOption } from '../src/modules/usage/services/suggest';
import { noticeText, smsDue } from '../src/modules/usage/services/usage-notice-text';
import type { ShopUsage, UsageFigure } from '../src/modules/usage/types/usage';
import type { UsageNotice } from '../src/modules/usage-warnings/types/usage-notice';

// LIM-01 (the rule agreed for Phase 3 Slice 10): the cheapest plan a month that leaves every metric clear of its limit,
// and the next as the alternative; the words of each notice; which go by SMS.

function plan(
  name: string,
  rank: number,
  price: number,
  limits: PlanLimits,
  months = 1,
): PlanOption {
  return { planId: name.toLowerCase(), name, rank, limits, price, months };
}

const STARTER = plan('Starter', 1, 449, {
  products: 100,
  staff: 2,
  storage_mb: 2048,
  bandwidth_gb: 30,
});
const GROWTH = plan('Growth', 2, 699, {
  products: 1000,
  staff: 5,
  storage_mb: 5120,
  bandwidth_gb: 100,
});
const PRO = plan('Pro', 3, 999, {
  products: 5000,
  staff: 15,
  storage_mb: 20480,
  bandwidth_gb: 500,
});
const PLANS = [PRO, STARTER, GROWTH];

function figure(metric: UsageMetric, used: number, limit: number | null): UsageFigure {
  return {
    metric,
    used,
    limit,
    packLeft: null,
    stopAt: null,
    unit: 'count',
    perCycle: false,
    level: null,
  };
}

describe('what a shop near its limit is offered (LIM-01)', () => {
  it('offers nothing while every metric is under 80 percent', () => {
    expect(suggest([figure(UsageMetric.Products, 79, 100)], { rank: 1 }, PLANS)).toBeNull();
  });

  it('offers the cheapest plan above the shop that fits, and the next as the alternative', () => {
    const offered = suggest(
      [figure(UsageMetric.Products, 95, 100), figure(UsageMetric.Seats, 1, 2)],
      { rank: 1 },
      PLANS,
    );
    expect(offered).toEqual({
      first: {
        kind: 'plan',
        planId: 'growth',
        name: 'Growth',
        price: 699,
        months: 1,
        monthly: 699,
      },
      alternative: {
        kind: 'plan',
        planId: 'pro',
        name: 'Pro',
        price: 999,
        months: 1,
        monthly: 999,
      },
    });
  });

  it('skips a plan that would leave any metric near its limit again', () => {
    // 900 products, after a downgrade: Growth's 1,000 would be at 90 percent at once.
    const offered = suggest([figure(UsageMetric.Products, 900, 100)], { rank: 1 }, PLANS);
    expect(offered?.first).toMatchObject({ name: 'Pro' });
    expect(offered?.alternative).toBeNull();
  });

  it('judges every metric the shop uses, not only the one that warned', () => {
    // Seats are near too: Growth's 5 would be at 80 percent, so Pro is the fix.
    const offered = suggest(
      [figure(UsageMetric.Products, 95, 100), figure(UsageMetric.Seats, 4, 4)],
      { rank: 1 },
      PLANS,
    );
    expect(offered?.first).toMatchObject({ name: 'Pro' });
  });

  it('offers a trial the cheapest plan that fits, whatever its rank', () => {
    const offered = suggest([figure(UsageMetric.Products, 18, 20)], { rank: null }, PLANS);
    expect(offered?.first).toMatchObject({ name: 'Starter', price: 449 });
    expect(offered?.alternative).toMatchObject({ name: 'Growth' });
  });

  it('compares plans by their price a month, a longer term divided by its months', () => {
    const yearly = plan('Yearly', 2, 4200, { products: 1000, staff: 5 }, 12);
    const offered = suggest([figure(UsageMetric.Products, 95, 100)], { rank: 1 }, [GROWTH, yearly]);
    expect(offered?.first).toMatchObject({ name: 'Yearly', monthly: 350 });
  });

  it('sends a shop on the largest plan to the operator for a custom one', () => {
    const offered = suggest([figure(UsageMetric.Seats, 15, 15)], { rank: 3 }, PLANS);
    expect(offered).toEqual({ first: { kind: 'contact' }, alternative: null });
  });
});

const NOW = new Date('2026-10-21T12:00:00Z');

function usage(overrides: Partial<ShopUsage> = {}): ShopUsage {
  return {
    cycleStart: new Date(NOW.getTime() - 10 * DAY_MS),
    cycleEnd: new Date(NOW.getTime() + 20 * DAY_MS),
    metrics: [],
    bandwidthDays: [],
    suggestions: null,
    fastSpendAlertedAt: null,
    packs: [],
    ...overrides,
  };
}

function notice(
  metric: UsageMetric,
  level: UsageNotice['level'],
  used: number,
  limit: number,
): UsageNotice {
  return { tenantId: 't', metric, level, used, limit, cycleStart: NOW.toISOString() };
}

describe('what a usage notice says (LIM-01, BND-03, RTE-03, RTE-12)', () => {
  it('says how much is used, and what would give room', () => {
    const text = noticeText(
      notice(UsageMetric.Products, 80, 16, 20),
      'Rupa Fashion',
      usage({
        suggestions: {
          first: {
            kind: 'plan',
            planId: 's',
            name: 'Starter',
            price: 449,
            months: 1,
            monthly: 449,
          },
          alternative: { kind: 'contact' },
        },
      }),
      NOW,
      10,
    );
    expect(text.subject).toBe('Rupa Fashion: 80% of your products used');
    expect(text.body).toBe(
      'Rupa Fashion has used 16 of its 20 products (80%). For more room: Starter, 449 TK for a month, ' +
        'or contact Lytro for a custom plan.',
    );
  });

  it('gives a metric that serves shoppers its pace through the cycle', () => {
    // 0.8 GB in 10 days is 0.08 GB a day: the last 0.2 GB lasts about 3 days.
    const text = noticeText(
      notice(UsageMetric.Bandwidth, 80, 0.8 * GB, GB),
      'Rupa Fashion',
      usage(),
      NOW,
      10,
    );
    expect(text.body).toContain('has used 0.8 GB of its 1.0 GB media bandwidth (80%).');
    expect(text.body).toContain("At this cycle's pace it runs out in about 3 days");
  });

  it('tells of the limit, the grace still served, and the stop', () => {
    const atLimit = noticeText(
      notice(UsageMetric.Bandwidth, 100, GB, GB),
      'Rupa Fashion',
      usage(),
      NOW,
      10,
    );
    expect(atLimit.body).toContain('images and videos are still shown for now, up to 1.1 GB');
    expect(atLimit.sms).toBe(
      'Lytro: Rupa Fashion has used all its media bandwidth. It keeps working up to 110%, then stops. ' +
        'Get more room from your dashboard.',
    );
    const stopped = noticeText(
      notice(UsageMetric.Requests, 'stopped', 2_200, 2_000),
      'Rupa Fashion',
      usage(),
      NOW,
      10,
    );
    expect(stopped.subject).toBe(
      'Rupa Fashion: your catalogue has stopped answering your website and storefront',
    );
  });

  it('tells of a fast hour of API requests without refusing anything', () => {
    const text = noticeText(
      notice(UsageMetric.Requests, 'fast_spend', 12_000, 200_000),
      'Rupa Fashion',
      usage(),
      NOW,
      10,
    );
    expect(text.subject).toBe('Rupa Fashion: 12000 API requests in one hour');
    expect(text.body).toContain('6% of the 200000 its cycle allows. Nothing is refused');
  });

  it('keeps every message plain ASCII, so an SMS is one plain part', () => {
    const text = noticeText(
      notice(UsageMetric.Bandwidth, 'stopped', 2 * GB, GB),
      'Shop',
      usage(),
      NOW,
      10,
    );
    expect(/^[\x20-\x7e]*$/.test(text.sms)).toBe(true);
    expect(/^[\x20-\x7e]*$/.test(text.body)).toBe(true);
  });
});

describe('which notices go by SMS (agreed for Slice 10)', () => {
  it('sends bandwidth and requests at their limit and stop, and at 95 percent to an owner with no email', () => {
    expect(smsDue(notice(UsageMetric.Bandwidth, 100, 1, 1), true)).toBe(true);
    expect(smsDue(notice(UsageMetric.Requests, 'stopped', 1, 1), true)).toBe(true);
    expect(smsDue(notice(UsageMetric.Bandwidth, 95, 1, 1), false)).toBe(true);
    expect(smsDue(notice(UsageMetric.Bandwidth, 95, 1, 1), true)).toBe(false);
    expect(smsDue(notice(UsageMetric.Requests, 80, 1, 1), false)).toBe(false);
  });

  it('never sends the rest by SMS, nor a fast-spend alert', () => {
    expect(smsDue(notice(UsageMetric.Products, 95, 1, 1), false)).toBe(false);
    expect(smsDue(notice(UsageMetric.Storage, 95, 1, 1), false)).toBe(false);
    expect(smsDue(notice(UsageMetric.Requests, 'fast_spend', 1, 1), false)).toBe(false);
  });
});
