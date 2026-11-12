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
