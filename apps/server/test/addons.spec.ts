import { InvoiceKind, UsageMetric, type PlanLimits } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/common/time';
import { addonPrice, renewalPrice } from '../src/modules/billing/services/addon-price';
import { unusedPlanValue } from '../src/modules/billing/services/plan-credit';
import type { InvoiceRecord } from '../src/modules/payments/types/invoice';
import { suggest, type AddonOption, type PlanOption } from '../src/modules/usage/services/suggest';
import { noticeText } from '../src/modules/usage/services/usage-notice-text';
import type { UsageFigure } from '../src/modules/usage/types/usage';

// Phase 3 Slice 10a.1: what an add-on costs for the rest of a period (PLN-14), the upgrade credit it never becomes part
// of (UPG-03, KNOWN-GAPS §84), and the add-ons the usage suggestion weighs against the plans (LIM-01).

const NOW = new Date('2026-10-22T06:00:00Z');
const days = (count: number): Date => new Date(NOW.getTime() + count * DAY_MS);

describe('what an add-on costs for the rest of the period (PLN-14)', () => {
  it('costs a month at its price, and part of one by the days left', () => {
    expect(addonPrice('149.00', 1, { start: days(0), end: days(30), months: 1 }, NOW)).toBe(149);
    // 149 x 20/30 = 99.33.
    expect(addonPrice('149.00', 1, { start: days(-10), end: days(20), months: 1 }, NOW)).toBe(99);
  });

  it('multiplies by the quantity, and rounds half up to whole taka', () => {
    // 49 x 3 x 15/30 = 73.5.
    expect(addonPrice('49.00', 3, { start: days(-15), end: days(15), months: 1 }, NOW)).toBe(74);
  });

  it("prices a longer term's period at its months, by its own days", () => {
    // 29 x 12 x 100/365 = 95.34.
    expect(addonPrice('29.00', 1, { start: days(-265), end: days(100), months: 12 }, NOW)).toBe(95);
  });

  it('charges the time before a period paid early begins, at the same rate (BIL-10)', () => {
    // A renewal paid 10 days early: 40 days left of a 30-day period, 149 x 40/30 = 198.67.
    expect(addonPrice('149.00', 1, { start: days(10), end: days(40), months: 1 }, NOW)).toBe(199);
  });

  it('counts a period with no term in months of 30 days', () => {
    // 149 x 45/30 = 223.5.
    expect(addonPrice('149.00', 1, { start: days(-5), end: days(45), months: null }, NOW)).toBe(
      224,
    );
  });

  it("costs a whole next period at its price times the quantity and the term's months, one on its own (Slice 11.5c)", () => {
    // Two renewed with a 3-month plan; one in its own 30 days, on pay-as-you-go.
    expect(renewalPrice('149.00', 2, 3)).toBe('894.00');
    expect(renewalPrice('49.00', 1, 1)).toBe('49.00');
  });
});

let nextNumber = 1;

function invoice(
  kind: InvoiceKind,
  amount: string,
  creditAmount: string,
  from: number,
  to: number,
): InvoiceRecord {
  return {
    id: String(nextNumber),
    tenantId: 't',
    number: nextNumber++,
    kind,
    planPaymentId: null,
    planSnapshot: kind === InvoiceKind.Addon ? null : {},
    amount,
    creditAmount,
    billingTermLabel: kind === InvoiceKind.Addon ? null : '1 month',
    shopName: 'Shop',
    ownerName: null,
    planName: kind === InvoiceKind.Addon ? null : 'Plan',
    planVersion: kind === InvoiceKind.Addon ? null : 1,
    periodStart: days(from),
    periodEnd: days(to),
    discountAmount: '0.00',
    paymentMethod: 'balance',
    paymentReference: null,
    issuedAt: days(from),
    lines: [],
  };
}

describe('the plan time an upgrade credits (UPG-03, KNOWN-GAPS §84)', () => {
  it('credits the unused days of the period paid for', () => {
    // 449 x 20/30 = 299.33: the SRS's Example A.
    const paid = [invoice(InvoiceKind.Purchase, '449.00', '0.00', -10, 20)];
    expect(unusedPlanValue(paid, NOW)).toBe(299);
  });

  it("never counts an add-on's invoice, however new", () => {
    const paid = [
      invoice(InvoiceKind.Purchase, '449.00', '0.00', -10, 20),
      invoice(InvoiceKind.Addon, '99.00', '0.00', 0, 20),
    ];
    expect(unusedPlanValue(paid, NOW)).toBe(299);
  });

  it('counts an earlier upgrade at its full price, and the period it replaced not again', () => {
    // Bought 449 for days -15..15, upgraded on day -5 for 400 after a 299 credit, to days -5..25: 699 x 25/30 =
    // 582.5. The first period was already the upgrade's credit; counting it again would add 224.5.
    const paid = [
      invoice(InvoiceKind.Purchase, '449.00', '0.00', -15, 15),
      invoice(InvoiceKind.Upgrade, '400.00', '299.00', -5, 25),
    ];
    expect(unusedPlanValue(paid, NOW)).toBe(583);
  });

  it('counts a period renewed early in full, beside what is left of the running one (BIL-10)', () => {
    // 449 x 20/30 + 449 = 748.33.
    const paid = [
      invoice(InvoiceKind.Purchase, '449.00', '0.00', -10, 20),
      invoice(InvoiceKind.Renewal, '449.00', '0.00', 20, 50),
    ];
    expect(unusedPlanValue(paid, NOW)).toBe(748);
  });

  it('credits nothing for a period that has ended', () => {
    const paid = [invoice(InvoiceKind.Purchase, '449.00', '0.00', -40, -10)];
    expect(unusedPlanValue(paid, NOW)).toBe(0);
  });
});

function plan(name: string, rank: number, price: number, limits: PlanLimits): PlanOption {
  return { planId: name.toLowerCase(), name, rank, limits, price, months: 1 };
}

const STARTER = plan('Starter', 1, 449, { products: 100, staff: 2, storage_mb: 2048 });
const GROWTH = plan('Growth', 2, 699, { products: 1000, staff: 5, storage_mb: 5120 });
const PLANS = [STARTER, GROWTH];

const EXTRA_PRODUCTS: AddonOption = {
  addonId: 'a1',
  key: 'extra_products',
  name: 'Extra products',
  limitKey: 'products',
  unitSize: 500,
  monthly: 149,
};
const EXTRA_SEAT: AddonOption = {
  addonId: 'a2',
  key: 'extra_seat',
  name: 'Extra seat',
  limitKey: 'staff',
  unitSize: 1,
  monthly: 49,
};
const ADDONS = { planMonthly: 449, addons: [EXTRA_PRODUCTS, EXTRA_SEAT] };

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
    runsOutAt: null,
  };
}

describe('the add-ons a shop near its limit is offered beside the plans (LIM-01, PLN-13)', () => {
  it('offers add-ons on the shop’s own plan when they cost less a month than the next plan', () => {
    // Starter with one extra-products add-on is 449 + 149 = 598 a month, under Growth's 699.
    const offered = suggest([figure(UsageMetric.Products, 95, 100)], { rank: 1 }, PLANS, ADDONS);
    expect(offered).toEqual({
      first: {
        kind: 'addons',
        items: [
          {
            addonId: 'a1',
            key: 'extra_products',
            name: 'Extra products',
            metric: UsageMetric.Products,
            quantity: 1,
            monthly: 149,
          },
        ],
        monthly: 149,
      },
      alternative: {
        kind: 'plan',
        planId: 'growth',
        name: 'Growth',
        price: 699,
        months: 1,
        monthly: 699,
      },
    });
  });

  it('buys enough of each to leave every near metric under 80 percent again, each named by its metric', () => {
    // 1,400 products on 600 (a plan of 100 with one add-on already): two more make 1,600, still 87.5 percent; three.
    const offered = suggest(
      [figure(UsageMetric.Products, 1400, 600), figure(UsageMetric.Seats, 2, 2)],
      { rank: 1 },
      PLANS,
      ADDONS,
    );
    expect(offered?.first).toMatchObject({
      kind: 'addons',
      items: [
        { key: 'extra_products', metric: UsageMetric.Products, quantity: 3, monthly: 447 },
        { key: 'extra_seat', metric: UsageMetric.Seats, quantity: 1, monthly: 49 },
      ],
      monthly: 496,
    });
  });

  it('leaves add-ons out when a near metric has none, or one purchase would not be enough', () => {
    const noAddon = suggest(
      [figure(UsageMetric.Products, 95, 100), figure(UsageMetric.Requests, 95, 100)],
      { rank: 1 },
      PLANS,
      ADDONS,
    );
    expect(noAddon?.first).toMatchObject({ kind: 'plan', name: 'Growth' });
    // 6,000 products on 100 would need 15 add-ons; one purchase buys at most 10.
    const tooMany = suggest([figure(UsageMetric.Products, 6000, 100)], { rank: 1 }, PLANS, ADDONS);
    expect(tooMany).toEqual({ first: { kind: 'contact' }, alternative: null });
  });

  it('prefers the add-ons on a tie, and offers none to a shop that cannot buy them', () => {
    const tie = suggest([figure(UsageMetric.Products, 95, 100)], { rank: 1 }, PLANS, {
      planMonthly: 550,
      addons: [EXTRA_PRODUCTS],
    });
    expect(tie?.first).toMatchObject({ kind: 'addons' });
    expect(tie?.alternative).toMatchObject({ kind: 'plan', name: 'Growth' });
    const none = suggest([figure(UsageMetric.Products, 95, 100)], { rank: 1 }, PLANS, null);
    expect(none?.first).toMatchObject({ kind: 'plan', name: 'Growth' });
  });

  it('words the add-ons in the notice', () => {
    const offered = suggest([figure(UsageMetric.Products, 80, 100)], { rank: 1 }, PLANS, ADDONS);
    const text = noticeText(
      {
        tenantId: 't',
        metric: UsageMetric.Products,
        level: 80,
        used: 80,
        limit: 100,
        cycleStart: NOW.toISOString(),
      },
      'Rupa Fashion',
      {
        cycleStart: days(-10),
        cycleEnd: days(20),
        metrics: [],
        bandwidthDays: [],
        requestDays: [],
        suggestions: offered,
        fastSpendAlertedAt: null,
        packs: [],
      },
      NOW,
      10,
    );
    expect(text.body).toBe(
      'Rupa Fashion has used 80 of its 100 products (80%). For more room: add the Extra products add-on to your ' +
        'plan, 149 TK a month, or Growth, 699 TK for a month.',
    );
  });
});
