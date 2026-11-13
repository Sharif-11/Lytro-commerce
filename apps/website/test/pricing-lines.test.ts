import { describe, expect, it } from 'vitest';
import { PricingViewBuilder } from '../src/components/landing/pricing';
import type { PlanCatalogue } from '../src/lib/api/plans-api';
import { Copy } from '../src/lib/i18n/copy';
import type { AppUrls } from '../src/lib/urls';

// SFT-17: the storefront is on every plan at no extra cost, so every paid card says so, whatever else it lists.
const plan = (id: string, rank: number, limits: Record<string, number | null>) => ({
  id,
  name: id,
  description: null,
  rank,
  forSale: true,
  limits,
});
const catalogue = {
  plans: [
    plan('Starter', 1, { products: 100 }),
    plan('Growth', 2, { products: 1000 }),
    plan('Pro', 3, {}),
  ],
  terms: [
    {
      id: 'month',
      labelBn: 'মাসিক',
      labelEn: 'Monthly',
      months: 1,
      visible: true,
      displayOrder: 1,
    },
  ],
  prices: ['Starter', 'Growth', 'Pro'].map((planId) => ({
    planId,
    billingTermId: 'month',
    price: '449.00',
  })),
} as unknown as PlanCatalogue;
const urls = { signIn: () => '#' } as unknown as AppUrls;

describe('the plan cards (SFT-17)', () => {
  it.each([
    ['en', 'Your own storefront included'],
    ['bn', 'নিজের স্টোরফ্রন্ট সহ'],
  ] as const)('lists the storefront first on every paid card, in %s', (language, line) => {
    const view = new PricingViewBuilder(new Copy(language), urls).build(catalogue);
    expect(view?.plans.map((card) => card.name)).toEqual(['Starter', 'Growth', 'Pro']);
    for (const card of view?.plans ?? []) expect(card.lines[0]).toBe(line);
  });
});

const withStaff = (staff: number | null) =>
  ({
    ...catalogue,
    plans: [plan('Starter', 1, { staff })],
    prices: [{ planId: 'Starter', billingTermId: 'month', price: '449.00' }],
  }) as unknown as PlanCatalogue;

describe("a plan's seats (STF-02: they count the owner)", () => {
  it.each([
    ['en', 1, '1 seat: just you'],
    ['en', 3, '3 seats: you + 2 staff'],
    ['bn', 3, '৩টি সিট: আপনি + ২ জন স্টাফ'],
    ['en', null, 'Unlimited staff'],
  ] as const)('in %s, %s seats read "%s"', (language, staff, line) => {
    const view = new PricingViewBuilder(new Copy(language), urls).build(withStaff(staff));
    expect(view?.plans[0]?.lines).toContain(line);
  });
});

// The rates as seeded (0026, 0099, 0101), as GET /rates gives them.
const RATES = [
  { key: 'payg_order_fee_min', value: '20.0000' },
  { key: 'payg_order_fee_pct', value: '1.5000' },
  { key: 'payg_product_fee', value: '0.0000' },
  { key: 'listener_verification_pct', value: '0.1000' },
  { key: 'gateway_verification_pct', value: '1.0000' },
];

describe("pay-as-you-go's fees and the verification note (PYG-01, PYG-02, RAT-15, RAT-16)", () => {
  const en = new PricingViewBuilder(new Copy('en'), urls);

  it('charges an order when it is handed over, from the rates as they stand', () => {
    const lines = en.paygLines(RATES);
    expect(lines[0]).toBe(
      'Per order, once it is booked with a courier or shipped: 1.5% of it, at least ৳20',
    );
    expect(lines[1]).toBe('Adding products is free');
    expect(lines.join(' ')).not.toMatch(/delivered/);
  });

  it('names a product fee once there is one, keeping its paisa', () => {
    const rates = RATES.map((rate) =>
      rate.key === 'payg_product_fee' ? { ...rate, value: '0.5000' } : rate,
    );
    expect(en.paygLines(rates)[1]).toBe('৳0.50 for each new product');
    expect(new PricingViewBuilder(new Copy('bn'), urls).paygLines(rates)[1]).toBe(
      'প্রতিটি নতুন প্রোডাক্টে ৳0.50',
    );
  });

  it('says it in words, with no figures and no product line, when the rates cannot be read', () => {
    const lines = en.paygLines(null);
    expect(lines[0]).toBe(
      'A small fee per order, only once it is booked with a courier or shipped',
    );
    expect(lines).not.toContain('Adding products is free');
    expect(en.feesNote(null)).toMatch(/a small percentage of the payment\.$/);
  });

  it('gives the verification fees as the rates stand', () => {
    expect(en.feesNote(RATES)).toBe(
      'Payment verification works the same on every plan: checking by hand is free. Automatic matching by the listener costs 0.1% of the payment, a wallet checkout 1%.',
    );
  });
});

// Starter as seeded (0003, 0064), pay-as-you-go as seeded (0028, 0064).
const STARTER_LIMITS = {
  products: 1000,
  staff: 2,
  storage_mb: 2048,
  bandwidth_gb: 30,
  requests_monthly: 200_000,
  paired_devices: 1,
};

describe('what else a plan gives, in its quieter list (small fixes 14(d))', () => {
  const withLimits = (limits: Record<string, number | null>, features?: Record<string, boolean>) =>
    ({
      ...catalogue,
      plans: [{ ...plan('Starter', 1, limits), features }],
      prices: [{ planId: 'Starter', billingTermId: 'month', price: '449.00' }],
    }) as unknown as PlanCatalogue;

  it('lists storage, bandwidth, API requests and phones, as each language reads figures', () => {
    const en = new PricingViewBuilder(new Copy('en'), urls).build(withLimits(STARTER_LIMITS));
    expect(en?.plans[0]?.more).toEqual([
      '2 GB storage',
      '30 GB bandwidth a month',
      '200,000 API requests a month',
      '1 payment listener',
    ]);
    const bn = new PricingViewBuilder(new Copy('bn'), urls).build(withLimits(STARTER_LIMITS));
    expect(bn?.plans[0]?.more).toEqual([
      '২ GB স্টোরেজ',
      'মাসে ৩০ GB ব্যান্ডউইথ',
      'মাসে ২,০০,০০০ API রিকোয়েস্ট',
      '১টি পেমেন্ট লিসেনার',
    ]);
    // Bangla figures are grouped too, in lakhs.
    expect(bn?.plans[0]?.lines).toContain('১,০০০ প্রোডাক্ট');
  });

  it('says unlimited in the word sellers use, and brand identity when the plan includes it', () => {
    const view = new PricingViewBuilder(new Copy('bn'), urls).build(
      withLimits({ storage_mb: null, paired_devices: 3, products: null }, { brand_identity: true }),
    );
    expect(view?.plans[0]?.more).toEqual([
      'আনলিমিটেড স্টোরেজ',
      '৩টি পেমেন্ট লিসেনার',
      'ব্র্যান্ড আইডেন্টিটি: আপনার রং, ফন্ট আর লোগো',
    ]);
    expect(view?.plans[0]?.lines).toContain('আনলিমিটেড প্রোডাক্ট');
    expect(JSON.stringify(view)).not.toMatch(/সীমাহীন/);
  });

  it("gives pay-as-you-go's own limits, and nothing when they can't be read", () => {
    const payg = {
      id: 'payg',
      name: 'Pay-as-you-go',
      description: null,
      rank: 0,
      forSale: false,
      limits: {
        products: 25,
        staff: 1,
        storage_mb: 250,
        bandwidth_gb: 10,
        requests_monthly: 100_000,
        paired_devices: 1,
      },
    };
    const en = new PricingViewBuilder(new Copy('en'), urls);
    expect(en.paygMore(payg)).toEqual([
      'Up to 25 products',
      '1 seat: just you',
      '250 MB storage',
      '10 GB bandwidth a month',
      '100,000 API requests a month',
      '1 payment listener',
    ]);
    expect(en.paygMore(null)).toEqual([]);
  });
});
