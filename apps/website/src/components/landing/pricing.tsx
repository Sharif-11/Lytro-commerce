import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import type { PlanCatalogue, PlatformRate } from '@/lib/api/plans-api';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { formatTaka, PricingModel } from '@/lib/pricing/pricing-model';
import type { AppUrls } from '@/lib/urls';
import { PricingCards, type PaygView, type PricingView } from './pricing-cards';

const text = {
  storefrontIncluded: { bn: 'নিজের স্টোরফ্রন্ট সহ', en: 'Your own storefront included' },
  eyebrow: { bn: 'প্রাইসিং', en: 'Pricing' },
  title: {
    bn: 'আগে কাজ করে কিনা দেখুন, তারপর সিদ্ধান্ত নিন',
    en: 'See it work first, then decide',
  },
  lead: {
    bn: 'সব প্ল্যান একই ৩০ দিনের ট্রায়াল দিয়ে শুরু। প্ল্যান না নিলে এমনিতেই পে-অ্যাজ-ইউ-গো-তে থাকবেন।',
    en: 'Every plan starts with the same 30-day trial. If you never pick a plan, you simply stay on pay-as-you-go.',
  },
  paygBadge: { bn: 'বেশিরভাগ সেলার এখান থেকেই শুরু', en: 'Most sellers start here' },
  paygName: { bn: 'পে-অ্যাজ-ইউ-গো', en: 'Pay-as-you-go' },
  paygDescription: {
    bn: 'যে দোকান আগে দেখে তারপর দিতে চায়',
    en: 'For a shop that wants to try before paying',
  },
  // PYG-02: the order fee is charged when the order is handed over, never when it is placed.
  paygOrderFee: {
    bn: 'অর্ডার কুরিয়ারে বুক বা শিপ হলে অর্ডারের {pct}, কমপক্ষে {min}',
    en: 'Per order, once it is booked with a courier or shipped: {pct} of it, at least {min}',
  },
  paygOrderFeeSoft: {
    bn: 'অর্ডার কুরিয়ারে বুক বা শিপ হলে তবেই অর্ডারপ্রতি ছোট একটা ফি',
    en: 'A small fee per order, only once it is booked with a courier or shipped',
  },
  // PYG-01: each product created is charged at this rate, which may be nothing.
  paygProductFee: { bn: 'প্রতিটি নতুন প্রোডাক্টে {fee}', en: '{fee} for each new product' },
  paygProductFree: { bn: 'প্রোডাক্ট যোগ করা ফ্রি', en: 'Adding products is free' },
  paygLines: [
    {
      bn: 'স্টোরফ্রন্ট, অর্ডার, কুরিয়ার বুকিং, ফেক অর্ডার চেক',
      en: 'Storefront, orders, courier booking, fake-order check',
    },
    { bn: 'বিকাশ-নগদ পেমেন্ট ম্যাচিং', en: 'bKash and Nagad payment matching' },
    {
      bn: 'SMS আর পেইড ফিচারের জন্য ব্যালেন্স টপ-আপ',
      en: 'Top up a balance for SMS and paid features',
    },
  ],
  paygCta: { bn: 'ফ্রি দোকান খুলুন', en: 'Open a free shop' },
  unlimited: { bn: 'সীমাহীন', en: 'Unlimited' },
  products: { bn: 'প্রোডাক্ট', en: 'products' },
  ordersMonthly: { bn: 'মাসে {n} অর্ডার হ্যান্ডলিং', en: '{n} orders handled a month' },
  // STF-02: seats count the owner, so one seat is the owner alone.
  seatsJustYou: { bn: '১টি সিট: শুধু আপনি', en: '1 seat: just you' },
  seatsWithStaff: {
    bn: '{n}টি সিট: আপনি + {staff} জন স্টাফ',
    en: '{n} seats: you + {staff} staff',
  },
  seatsUnlimited: { bn: 'সীমাহীন স্টাফ', en: 'Unlimited staff' },
  smsMonthly: { bn: 'মাসে {n}টি ফ্রি SMS', en: '{n} free SMS a month' },
  unavailable: {
    bn: 'প্ল্যানের দাম এই মুহূর্তে দেখানো যাচ্ছে না। সাইন-আপের পর ড্যাশবোর্ডে সব প্ল্যান আর দাম দেখবেন।',
    en: 'Plan prices cannot be shown right now. After sign-up you will see every plan and price in the dashboard.',
  },
  note: {
    bn: 'দাম টাকায়। কুরিয়ার আপনার নিজের অ্যাকাউন্টে বুক হয়, তাই ডেলিভারি চার্জ কুরিয়ারকে যায়, আমাদের না। প্ল্যানের লিমিট লঞ্চের প্রস্তাব, রিলিজের আগে বদলাতে পারে।',
    en: 'Prices in Taka. Couriers are booked on your own courier account, so delivery charges go to the courier, not to us. Plan limits are the launch proposal and may change before release.',
  },
  // RAT-15, RAT-16: the verification fees as the rates stand, or in words when the rates can't be read.
  fees: {
    bn: 'সব প্ল্যানে পেমেন্ট যাচাইয়ের নিয়ম একই: হাতে যাচাই ফ্রি। লিসেনারে নিজে থেকে মিললে পেমেন্টের {listener}, ওয়ালেট চেকআউটে {gateway}।',
    en: 'Payment verification works the same on every plan: checking by hand is free. Automatic matching by the listener costs {listener} of the payment, a wallet checkout {gateway}.',
  },
  feesSoft: {
    bn: 'সব প্ল্যানে পেমেন্ট যাচাইয়ের নিয়ম একই: হাতে যাচাই ফ্রি। লিসেনার বা ওয়ালেট চেকআউটে নিজে থেকে মিললে পেমেন্টের ওপর ছোট একটা পার্সেন্টেজ।',
    en: 'Payment verification works the same on every plan: checking by hand is free. Automatic matching by the listener or a wallet checkout costs a small percentage of the payment.',
  },
} as const;

// Plan feature flags the operator can set, and the line each one shows (PLN-02 `features`). Unknown flags
// are not shown, so a new flag needs a label here before it appears on the page.
const featureLines: Record<string, Bilingual> = {
  custom_domain: { bn: 'নিজের ডোমেইন', en: 'Custom domain' },
  priority_support: { bn: 'সেম-ডে সাপোর্ট', en: 'Same-day support' },
};

export class PricingViewBuilder {
  constructor(
    private readonly copy: Copy,
    private readonly urls: AppUrls,
  ) {}

  build(catalogue: PlanCatalogue | null): PricingView | null {
    if (!catalogue) return null;
    const model = new PricingModel(catalogue);
    const defaultTermId = model.defaultTermId();
    if (!defaultTermId || model.plans.length === 0) return null;

    const terms = model.terms.map((term) => ({
      id: term.id,
      label: this.copy.language === 'bn' ? term.labelBn : term.labelEn,
      months: term.months,
      savingPercent: Math.max(
        0,
        ...model.plans.flatMap((plan) =>
          plan.terms.filter((p) => p.term.id === term.id).map((p) => p.savingPercent),
        ),
      ),
    }));

    const plans = model.plans.map((priced) => {
      const prices: PricingView['plans'][number]['prices'] = {};
      const signInUrls: PricingView['plans'][number]['signInUrls'] = {};
      for (const item of priced.terms) {
        prices[item.term.id] = { total: formatTaka(item.price), monthly: formatTaka(item.monthly) };
        signInUrls[item.term.id] = this.urls.signIn({
          planId: priced.plan.id,
          termId: item.term.id,
        });
      }
      return {
        id: priced.plan.id,
        name: priced.plan.name,
        description: priced.plan.description,
        lines: this.lines(priced.plan.limits, priced.plan.features ?? {}),
        prices,
        signInUrls,
      };
    });

    return { terms, defaultTermId, plans };
  }

  private lines(
    limits: PlanCatalogue['plans'][number]['limits'],
    features: Record<string, boolean>,
  ): string[] {
    // SFT-17: on every plan at no extra cost, so every card says so.
    const lines: string[] = [this.copy.of(text.storefrontIncluded)];
    const count = (value: number | null) =>
      value === null
        ? this.copy.of(text.unlimited)
        : this.copy.count(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (limits.products !== undefined)
      lines.push(`${count(limits.products)} ${this.copy.of(text.products)}`);
    if (limits.orders_handled_monthly !== undefined)
      lines.push(
        this.copy.of(text.ordersMonthly).replace('{n}', count(limits.orders_handled_monthly)),
      );
    if (limits.staff !== undefined) lines.push(this.seats(limits.staff));
    if (limits.essential_sms_monthly !== undefined)
      lines.push(this.copy.of(text.smsMonthly).replace('{n}', count(limits.essential_sms_monthly)));
    for (const [flag, on] of Object.entries(features)) {
      const label = featureLines[flag];
      if (on && label) lines.push(this.copy.of(label));
    }
    return lines;
  }

  /** STF-02: a plan's seats, which count the owner, as the owner and how many staff they leave room for. */
  private seats(staff: number | null): string {
    if (staff === null) return this.copy.of(text.seatsUnlimited);
    if (staff <= 1) return this.copy.of(text.seatsJustYou);
    return this.copy
      .of(text.seatsWithStaff)
      .replace('{n}', this.copy.count(staff))
      .replace('{staff}', this.copy.count(staff - 1));
  }

  /** PYG-01, PYG-02: pay-as-you-go's lines, its fees as the rates stand (`GET /rates`) or in words without them. */
  paygLines(rates: readonly PlatformRate[] | null): string[] {
    const min = rateOf(rates, 'payg_order_fee_min');
    const pct = rateOf(rates, 'payg_order_fee_pct');
    const product = rateOf(rates, 'payg_product_fee');
    const lines = [
      min !== null && pct !== null
        ? this.copy
            .of(text.paygOrderFee)
            .replace('{pct}', percent(pct))
            .replace('{min}', takaExact(min))
        : this.copy.of(text.paygOrderFeeSoft),
    ];
    if (product !== null) {
      lines.push(
        product === 0
          ? this.copy.of(text.paygProductFree)
          : this.copy.of(text.paygProductFee).replace('{fee}', takaExact(product)),
      );
    }
    return [...lines, ...text.paygLines.map((line) => this.copy.of(line))];
  }

  /** RAT-15, RAT-16: the note under the cards, with the verification fees as the rates stand. */
  feesNote(rates: readonly PlatformRate[] | null): string {
    const listener = rateOf(rates, 'listener_verification_pct');
    const gateway = rateOf(rates, 'gateway_verification_pct');
    if (listener === null || gateway === null) return this.copy.of(text.feesSoft);
    return this.copy
      .of(text.fees)
      .replace('{listener}', percent(listener))
      .replace('{gateway}', percent(gateway));
  }
}

/** A rate's value as a number, or null when the rates weren't read or don't hold it. */
function rateOf(rates: readonly PlatformRate[] | null, key: string): number | null {
  const value = rates?.find((rate) => rate.key === key)?.value;
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** "1.5%", "0.1%": a stored percent without its trailing zeros. */
function percent(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

/** Taka as the site writes it, keeping paisa a fee has: "৳20", "৳0.50". */
function takaExact(value: number): string {
  return Number.isInteger(value) ? formatTaka(value) : `৳${value.toFixed(2)}`;
}

export function Pricing({
  language,
  catalogue,
  rates,
  urls,
}: {
  language: Language;
  catalogue: PlanCatalogue | null;
  rates: readonly PlatformRate[] | null;
  urls: AppUrls;
}) {
  const copy = new Copy(language);
  const builder = new PricingViewBuilder(copy, urls);
  const view = builder.build(catalogue);
  const payg: PaygView = {
    badge: copy.of(text.paygBadge),
    name: copy.of(text.paygName),
    description: copy.of(text.paygDescription),
    price: formatTaka(0),
    lines: builder.paygLines(rates),
    cta: copy.of(text.paygCta),
    signInUrl: urls.signIn(),
  };

  return (
    <section id="pricing" className="scroll-mt-16 bg-neutral-50">
      <Container className="py-16 sm:py-20">
        <SectionHeading
          eyebrow={copy.of(text.eyebrow)}
          title={copy.of(text.title)}
          lead={copy.of(text.lead)}
        />
        <PricingCards language={language} payg={payg} view={view} />
        {!view ? (
          <p className="mx-auto mt-6 max-w-[640px] rounded-control bg-accent-100 px-4 py-3 text-center text-[14px] text-accent-700">
            {copy.of(text.unavailable)}
          </p>
        ) : null}
        <p className="mx-auto mt-8 max-w-[760px] text-center text-[14px] text-neutral-700">
          {builder.feesNote(rates)}
        </p>
        <p className="mx-auto mt-3 max-w-[760px] text-center text-[14px] text-neutral-700">
          {copy.of(text.note)}
        </p>
      </Container>
    </section>
  );
}
