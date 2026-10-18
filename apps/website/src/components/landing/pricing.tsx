import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import type { PlanCatalogue } from '@/lib/api/plans-api';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { formatTaka, PricingModel } from '@/lib/pricing/pricing-model';
import type { AppUrls } from '@/lib/urls';
import { PricingCards, type PaygView, type PricingView } from './pricing-cards';

const text = {
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
  paygLines: [
    {
      bn: 'অর্ডার ডেলিভার হলে তবেই ছোট একটা ফি',
      en: 'A small fee only when an order is delivered',
    },
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
  staff: { bn: 'স্টাফ সিট', en: 'staff seats' },
  smsMonthly: { bn: 'মাসে {n}টি ফ্রি SMS', en: '{n} free SMS a month' },
  unavailable: {
    bn: 'প্ল্যানের দাম এই মুহূর্তে দেখানো যাচ্ছে না। সাইন-আপের পর ড্যাশবোর্ডে সব প্ল্যান আর দাম দেখবেন।',
    en: 'Plan prices cannot be shown right now. After sign-up you will see every plan and price in the dashboard.',
  },
  note: {
    bn: 'দাম টাকায়। কুরিয়ার আপনার নিজের অ্যাকাউন্টে বুক হয়, তাই ডেলিভারি চার্জ কুরিয়ারকে যায়, আমাদের না। প্ল্যানের লিমিট লঞ্চের প্রস্তাব, রিলিজের আগে বদলাতে পারে।',
    en: 'Prices in Taka. Couriers are booked on your own courier account, so delivery charges go to the courier, not to us. Plan limits are the launch proposal and may change before release.',
  },
  fees: {
    bn: 'সব প্ল্যানে পেমেন্ট যাচাইয়ের নিয়ম একই: হাতে যাচাই ফ্রি। লিসেনারে নিজে থেকে মিললে পেমেন্টের 0.10%, ওয়ালেট চেকআউটে 1.00%।',
    en: 'Payment verification works the same on every plan: checking by hand is free. Automatic matching by the listener costs 0.10% of the payment, a wallet checkout 1.00%.',
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
    const lines: string[] = [];
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
    if (limits.staff !== undefined)
      lines.push(`${count(limits.staff)} ${this.copy.of(text.staff)}`);
    if (limits.essential_sms_monthly !== undefined)
      lines.push(this.copy.of(text.smsMonthly).replace('{n}', count(limits.essential_sms_monthly)));
    for (const [flag, on] of Object.entries(features)) {
      const label = featureLines[flag];
      if (on && label) lines.push(this.copy.of(label));
    }
    return lines;
  }
}

export function Pricing({
  language,
  catalogue,
  urls,
}: {
  language: Language;
  catalogue: PlanCatalogue | null;
  urls: AppUrls;
}) {
  const copy = new Copy(language);
  const view = new PricingViewBuilder(copy, urls).build(catalogue);
  const payg: PaygView = {
    badge: copy.of(text.paygBadge),
    name: copy.of(text.paygName),
    description: copy.of(text.paygDescription),
    price: formatTaka(0),
    lines: text.paygLines.map((line) => copy.of(line)),
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
          {copy.of(text.fees)}
        </p>
        <p className="mx-auto mt-3 max-w-[760px] text-center text-[14px] text-neutral-700">
          {copy.of(text.note)}
        </p>
      </Container>
    </section>
  );
}
