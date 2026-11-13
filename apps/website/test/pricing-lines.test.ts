import { describe, expect, it } from 'vitest';
import { PricingViewBuilder } from '../src/components/landing/pricing';
import type { PlanLine } from '../src/components/landing/pricing-cards';
import type { Plan, PlanCatalogue } from '../src/lib/api/plans-api';
import { Copy } from '../src/lib/i18n/copy';
import type { Language } from '../src/lib/i18n/language';
import type { AppUrls } from '../src/lib/urls';

const urls = { signIn: () => '#' } as unknown as AppUrls;
const builder = (language: Language) => new PricingViewBuilder(new Copy(language), urls);
const texts = (lines: readonly PlanLine[] | undefined) => (lines ?? []).map((line) => line.text);
const crossed = (lines: readonly PlanLine[] | undefined) =>
  (lines ?? []).filter((line) => !line.on).map((line) => line.text);

const MONTH = {
  id: 'month',
  labelBn: 'মাসিক',
  labelEn: 'Monthly',
  months: 1,
  visible: true,
  displayOrder: 1,
};

const plan = (
  name: string,
  rank: number,
  limits: Record<string, number | null>,
  extra: Partial<Plan> = {},
): Plan => ({
  id: name,
  name,
  description: null,
  rank,
  forSale: true,
  limits,
  ...extra,
});

const catalogueOf = (...plans: Plan[]): PlanCatalogue => ({
  plans,
  terms: [MONTH],
  prices: plans.map((each) => ({ planId: each.id, billingTermId: 'month', price: '449.00' })),
});

// The rates as seeded (0026, 0099, 0101), as GET /rates gives them.
const RATES = [
  { key: 'payg_order_fee_min', value: '20.0000' },
  { key: 'payg_order_fee_pct', value: '1.5000' },
  { key: 'payg_product_fee', value: '0.0000' },
  { key: 'listener_verification_pct', value: '0.1000' },
  { key: 'gateway_verification_pct', value: '1.0000' },
];

const SHARED_BN = [
  'স্টোরফ্রন্ট, অর্ডার, কুরিয়ার বুকিং, ফেক অর্ডার চেক',
  'বিকাশ-নগদ পেমেন্ট ম্যাচিং',
  'SMS আর পেইড ফিচারের জন্য ব্যালেন্স টপ-আপ',
];

describe('what every plan shares, on every card', () => {
  it.each([
    ['bn', SHARED_BN],
    [
      'en',
      [
        'Storefront, orders, courier booking, fake-order check',
        'bKash and Nagad payment matching',
        'Top up a balance for SMS and paid features',
      ],
    ],
  ] as const)(
    'opens every paid card, and follows the fees on pay-as-you-go, in %s',
    (language, shared) => {
      const catalogue = catalogueOf(
        plan('Starter', 1, { products: 100 }),
        plan('Growth', 2, { products: 1000 }),
      );
      const payg = plan('Pay-as-you-go', 0, { products: 25 }, { forSale: false });
      const { payg: paygCard, view } = builder(language).cards(catalogue, payg, RATES);
      for (const card of view?.plans ?? []) {
        expect(texts(card.lines).slice(0, 3)).toEqual(shared);
        expect(card.lines.slice(0, 3).every((line) => line.on)).toBe(true);
      }
      expect(texts(paygCard.lines).slice(2, 5)).toEqual(shared);
      expect(JSON.stringify(view)).not.toMatch(/নিজের স্টোরফ্রন্ট সহ|Your own storefront included/);
    },
  );

  it("lists only what every plan shares on pay-as-you-go when its limits can't be read", () => {
    const { payg } = builder('bn').cards(null, null, RATES);
    expect(texts(payg.lines)).toEqual([
      'অর্ডার কুরিয়ারে বুক বা শিপ হলে অর্ডারের 1.5%, কমপক্ষে ৳20',
      'প্রোডাক্ট যোগ করা ফ্রি',
      ...SHARED_BN,
    ]);
    expect(payg.more).toEqual([]);
    expect(payg.hot).toBe(false);
  });
});

describe("a plan's seats (STF-02: they count the owner)", () => {
  it.each([
    ['en', 1, '1 seat: just you'],
    ['en', 3, '3 seats: you + 2 staff'],
    ['bn', 3, '৩টি সিট: আপনি + ২ জন স্টাফ'],
    ['en', null, 'Unlimited staff'],
  ] as const)('in %s, %s seats read "%s"', (language, staff, line) => {
    const { view } = builder(language).cards(
      catalogueOf(plan('Starter', 1, { staff })),
      null,
      null,
    );
    expect(texts(view?.plans[0]?.lines)).toContain(line);
  });
});

describe("pay-as-you-go's fees and the verification note (PYG-01, PYG-02, RAT-15, RAT-16)", () => {
  const en = builder('en');

  it('charges an order when it is handed over, from the rates as they stand', () => {
    const lines = en.paygFees(RATES);
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
    expect(en.paygFees(rates)[1]).toBe('৳0.50 for each new product');
    expect(builder('bn').paygFees(rates)[1]).toBe('প্রতিটি নতুন প্রোডাক্টে ৳0.50');
  });

  it('says it in words, with no figures and no product line, when the rates cannot be read', () => {
    expect(en.paygFees(null)).toEqual([
      'A small fee per order, only once it is booked with a courier or shipped',
    ]);
    expect(en.feesNote(null)).toMatch(/a small percentage of the payment\.$/);
  });

  it('gives the verification fees as the rates stand', () => {
    expect(en.feesNote(RATES)).toBe(
      'Payment verification works the same on every plan: checking by hand is free. Automatic matching by the listener costs 0.1% of the payment, a wallet checkout 1%.',
    );
  });
});

// Staging's plans as GET /plans and GET /plans/pay-as-you-go gave them on 2026-11-13: only Starter on sale, a daily
// order cap, both SMS caps, no feature flags, and no plan marked as suggested yet.
const STAGING_STARTER = plan(
  'Starter',
  2,
  {
    products: 100,
    orders_total: null,
    orders_handled_monthly: null,
    orders_handled_daily: 60,
    staff: 1,
    paired_devices: 1,
    storage_mb: 2048,
    bandwidth_gb: 50,
    essential_sms_total: 4,
    essential_sms_monthly: 8,
    requests_monthly: 1_000_000,
    activity_retention_days: 90,
  },
  { id: '1ce400d6-8b29-4802-9fc5-679569db0853', description: 'most popular one', features: {} },
);
const STAGING_PAYG = plan(
  'Pay-as-you-go',
  1,
  {
    products: 25,
    orders_total: null,
    orders_handled_monthly: null,
    orders_handled_daily: null,
    staff: 1,
    paired_devices: 1,
    storage_mb: 500,
    bandwidth_gb: 10,
    essential_sms_total: 5,
    essential_sms_monthly: 3,
    requests_monthly: 200_000,
    activity_retention_days: 30,
  },
  { id: 'b2bce6a6-41c6-417c-9fb1-4e407956c75a', description: '', forSale: false, features: {} },
);

describe("staging's plans, as the cards read them", () => {
  const { payg, view } = builder('bn').cards(catalogueOf(STAGING_STARTER), STAGING_PAYG, RATES);

  it('lists every limit Starter sets, its daily order cap and both SMS caps among them', () => {
    expect(texts(view?.plans[0]?.lines)).toEqual([
      ...SHARED_BN,
      '১০০ প্রোডাক্ট',
      'দিনে ৬০ অর্ডার হ্যান্ডলিং',
      '১টি সিট: শুধু আপনি',
      'মাসে ৮টি ফ্রি SMS',
      'সব মিলিয়ে ৪টি ফ্রি SMS',
    ]);
    expect(texts(view?.plans[0]?.more)).toEqual([
      '২ GB স্টোরেজ',
      'মাসে ৫০ GB ব্যান্ডউইথ',
      'মাসে ১০,০০,০০০ API রিকোয়েস্ট',
      '১টি পেমেন্ট লিসেনার',
      '৯০ দিনের অ্যাক্টিভিটি লগ',
    ]);
  });

  it("lists pay-as-you-go's own limits by the same rules, after its fees", () => {
    expect(texts(payg.lines)).toEqual([
      'অর্ডার কুরিয়ারে বুক বা শিপ হলে অর্ডারের 1.5%, কমপক্ষে ৳20',
      'প্রোডাক্ট যোগ করা ফ্রি',
      ...SHARED_BN,
      '২৫ প্রোডাক্ট',
      'আনলিমিটেড অর্ডার হ্যান্ডলিং',
      '১টি সিট: শুধু আপনি',
      'মাসে ৩টি ফ্রি SMS',
      'সব মিলিয়ে ৫টি ফ্রি SMS',
    ]);
    expect(texts(payg.more)).toEqual([
      '৫০০ MB স্টোরেজ',
      'মাসে ১০ GB ব্যান্ডউইথ',
      'মাসে ২,০০,০০০ API রিকোয়েস্ট',
      '১টি পেমেন্ট লিসেনার',
      '৩০ দিনের অ্যাক্টিভিটি লগ',
    ]);
  });

  it('shows no feature rows, nothing crossed out and no highlighted card', () => {
    expect(crossed([...(view?.plans[0]?.lines ?? []), ...payg.lines])).toEqual([]);
    expect(view?.plans[0]?.hot).toBe(false);
    expect(payg.hot).toBe(false);
  });
});

describe('feature flags (PLN-02): every flag a shown card carries, on every card', () => {
  const catalogue = catalogueOf(
    plan('Starter', 1, {}, { features: { custom_domain: false } }),
    plan('Growth', 2, {}, { features: { custom_domain: true, priority_support: false } }),
    plan(
      'Pro',
      3,
      {},
      {
        features: {
          custom_domain: true,
          priority_support: true,
          brand_identity: true,
          beta_reports: true,
        },
      },
    ),
  );
  const payg = plan('Pay-as-you-go', 0, {}, { forSale: false, features: {} });
  const { payg: paygCard, view } = builder('bn').cards(catalogue, payg, RATES);
  const flagRows = (lines: readonly PlanLine[] | undefined) =>
    (lines ?? []).filter((line) =>
      ['নিজের ডোমেইন', 'সেম-ডে সাপোর্ট', 'ব্র্যান্ড আইডেন্টিটি: আপনার রং, ফন্ট আর লোগো'].includes(
        line.text,
      ),
    );

  it('ticks a flag the plan has and crosses out one it lacks or has off', () => {
    const [starter, growth, pro] = view?.plans ?? [];
    expect(flagRows(starter?.lines)).toEqual([
      { text: 'নিজের ডোমেইন', on: false },
      { text: 'সেম-ডে সাপোর্ট', on: false },
    ]);
    expect(flagRows(growth?.lines)).toEqual([
      { text: 'নিজের ডোমেইন', on: true },
      { text: 'সেম-ডে সাপোর্ট', on: false },
    ]);
    expect(flagRows(pro?.lines)).toEqual([
      { text: 'নিজের ডোমেইন', on: true },
      { text: 'সেম-ডে সাপোর্ট', on: true },
    ]);
    expect(flagRows(pro?.more)).toEqual([
      { text: 'ব্র্যান্ড আইডেন্টিটি: আপনার রং, ফন্ট আর লোগো', on: true },
    ]);
    expect(flagRows(starter?.more)).toEqual([
      { text: 'ব্র্যান্ড আইডেন্টিটি: আপনার রং, ফন্ট আর লোগো', on: false },
    ]);
  });

  it('lists them on pay-as-you-go too, crossed out, and never a flag without words', () => {
    expect(flagRows([...paygCard.lines, ...paygCard.more]).map((line) => line.on)).toEqual([
      false,
      false,
      false,
    ]);
    expect(JSON.stringify({ paygCard, view })).not.toMatch(/beta_reports/);
  });
});

describe('limit values (PLN-19)', () => {
  it('crosses out a limit of 0, naming the thing', () => {
    const { view } = builder('bn').cards(
      catalogueOf(
        plan('Starter', 1, {
          products: 0,
          orders_handled_daily: 0,
          essential_sms_monthly: 0,
          storage_mb: 0,
          paired_devices: 0,
        }),
      ),
      null,
      null,
    );
    expect(crossed(view?.plans[0]?.lines)).toEqual(['প্রোডাক্ট', 'অর্ডার হ্যান্ডলিং', 'ফ্রি SMS']);
    expect(crossed(view?.plans[0]?.more)).toEqual(['স্টোরেজ', 'পেমেন্ট লিসেনার']);
  });

  it('says unlimited in the word sellers use', () => {
    const { view } = builder('bn').cards(
      catalogueOf(
        plan('Starter', 1, {
          products: null,
          orders_handled_monthly: null,
          essential_sms_monthly: null,
          essential_sms_total: null,
          storage_mb: null,
          paired_devices: null,
        }),
      ),
      null,
      null,
    );
    const all = texts([...(view?.plans[0]?.lines ?? []), ...(view?.plans[0]?.more ?? [])]);
    expect(all).toEqual(
      expect.arrayContaining([
        'আনলিমিটেড প্রোডাক্ট',
        'আনলিমিটেড অর্ডার হ্যান্ডলিং',
        'আনলিমিটেড ফ্রি SMS',
        'আনলিমিটেড স্টোরেজ',
        'আনলিমিটেড পেমেন্ট লিসেনার',
      ]),
    );
    expect(JSON.stringify(view)).not.toMatch(/সীমাহীন/);
  });

  it('reads a limit the plan does not set as LIMIT_WHEN_UNSET says', () => {
    const { view } = builder('en').cards(catalogueOf(plan('Old', 1, {})), null, null);
    expect(texts(view?.plans[0]?.lines).slice(3)).toEqual([
      'Unlimited products',
      'Unlimited orders handled',
      '1 seat: just you',
      'Unlimited free SMS',
    ]);
    expect(texts(view?.plans[0]?.more)).toEqual([
      'Unlimited storage',
      'Unlimited bandwidth',
      '20,000 API requests a month',
      '1 payment listener',
    ]);
  });

  it('writes figures as each language reads them, Bangla in lakhs', () => {
    const { view } = builder('bn').cards(
      catalogueOf(
        plan('Starter', 1, { products: 1000, requests_monthly: 200_000, paired_devices: 3 }),
      ),
      null,
      null,
    );
    expect(texts(view?.plans[0]?.lines)).toContain('১,০০০ প্রোডাক্ট');
    expect(texts(view?.plans[0]?.more)).toEqual(
      expect.arrayContaining(['মাসে ২,০০,০০০ API রিকোয়েস্ট', '৩টি পেমেন্ট লিসেনার']),
    );
  });
});

describe('the suggested plan (PLN-21)', () => {
  it('highlights the plan the operator marked, and only that one', () => {
    const { payg, view } = builder('en').cards(
      catalogueOf(
        plan('Starter', 1, {}, { suggested: true }),
        plan('Growth', 2, {}, { suggested: false }),
      ),
      plan('Pay-as-you-go', 0, {}, { forSale: false, suggested: false }),
      null,
    );
    expect(view?.plans.map((card) => card.hot)).toEqual([true, false]);
    expect(payg.hot).toBe(false);
  });

  it('can highlight pay-as-you-go', () => {
    const { payg, view } = builder('en').cards(
      catalogueOf(plan('Starter', 1, {})),
      plan('Pay-as-you-go', 0, {}, { forSale: false, suggested: true }),
      null,
    );
    expect(payg.hot).toBe(true);
    expect(view?.plans[0]?.hot).toBe(false);
  });

  it('highlights nothing when no plan is marked', () => {
    const { payg, view } = builder('en').cards(
      catalogueOf(plan('Starter', 1, {}), plan('Growth', 2, {})),
      plan('Pay-as-you-go', 0, {}, { forSale: false }),
      null,
    );
    expect([payg.hot, ...(view?.plans.map((card) => card.hot) ?? [])]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('badges it in each language', () => {
    expect(builder('bn').suggestedBadge()).toBe('সাজেস্টেড প্ল্যান');
    expect(builder('en').suggestedBadge()).toBe('Suggested plan');
  });
});
