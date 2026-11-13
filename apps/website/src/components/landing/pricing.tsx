import {
  BRAND_IDENTITY_ADDON,
  CUSTOM_DOMAIN_FEATURE,
  LIMIT_WHEN_UNSET,
  type PlanLimits,
  type UsageLimitKey,
} from '@lytronix/validators';
import type { Plan, PlanCatalogue, PlatformRate } from '@/lib/api/plans-api';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { formatTaka, PricingModel } from '@/lib/pricing/pricing-model';
import type { AppUrls } from '@/lib/urls';
import {
  PricingCards,
  type PaygView,
  type PlanLine,
  type PricingPlanView,
  type PricingView,
} from './pricing-cards';

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
  // PLN-21: the badge on the plan the operator marked as suggested.
  suggested: { bn: 'সাজেস্টেড প্ল্যান', en: 'Suggested plan' },
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
  // What every plan gives, pay-as-you-go included: listed on every card so none looks as if it lacked them.
  shared: [
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
  products: { bn: '{n} প্রোডাক্ট', en: '{n} products' },
  productsUnlimited: { bn: 'আনলিমিটেড প্রোডাক্ট', en: 'Unlimited products' },
  productsNone: { bn: 'প্রোডাক্ট', en: 'Products' },
  ordersMonthly: { bn: 'মাসে {n} অর্ডার হ্যান্ডলিং', en: '{n} orders handled a month' },
  ordersDaily: { bn: 'দিনে {n} অর্ডার হ্যান্ডলিং', en: '{n} orders handled a day' },
  ordersTotal: { bn: 'সব মিলিয়ে {n} অর্ডার হ্যান্ডলিং', en: '{n} orders handled in all' },
  ordersUnlimited: { bn: 'আনলিমিটেড অর্ডার হ্যান্ডলিং', en: 'Unlimited orders handled' },
  ordersNone: { bn: 'অর্ডার হ্যান্ডলিং', en: 'Orders handled' },
  // STF-02: seats count the owner, so one seat is the owner alone.
  seatsJustYou: { bn: '১টি সিট: শুধু আপনি', en: '1 seat: just you' },
  seatsWithStaff: {
    bn: '{n}টি সিট: আপনি + {staff} জন স্টাফ',
    en: '{n} seats: you + {staff} staff',
  },
  seatsUnlimited: { bn: 'আনলিমিটেড স্টাফ', en: 'Unlimited staff' },
  smsMonthly: { bn: 'মাসে {n}টি ফ্রি SMS', en: '{n} free SMS a month' },
  smsTotal: { bn: 'সব মিলিয়ে {n}টি ফ্রি SMS', en: '{n} free SMS in all' },
  smsUnlimited: { bn: 'আনলিমিটেড ফ্রি SMS', en: 'Unlimited free SMS' },
  smsNone: { bn: 'ফ্রি SMS', en: 'Free SMS' },
  storage: { bn: '{n} স্টোরেজ', en: '{n} storage' },
  storageUnlimited: { bn: 'আনলিমিটেড স্টোরেজ', en: 'Unlimited storage' },
  storageNone: { bn: 'স্টোরেজ', en: 'Storage' },
  bandwidth: { bn: 'মাসে {n} GB ব্যান্ডউইথ', en: '{n} GB bandwidth a month' },
  bandwidthUnlimited: { bn: 'আনলিমিটেড ব্যান্ডউইথ', en: 'Unlimited bandwidth' },
  bandwidthNone: { bn: 'ব্যান্ডউইথ', en: 'Bandwidth' },
  requests: { bn: 'মাসে {n} API রিকোয়েস্ট', en: '{n} API requests a month' },
  requestsUnlimited: { bn: 'আনলিমিটেড API রিকোয়েস্ট', en: 'Unlimited API requests' },
  requestsNone: { bn: 'API রিকোয়েস্ট', en: 'API requests' },
  phonesOne: { bn: '১টি পেমেন্ট লিসেনার', en: '1 payment listener' },
  phones: { bn: '{n}টি পেমেন্ট লিসেনার', en: '{n} payment listeners' },
  phonesUnlimited: { bn: 'আনলিমিটেড পেমেন্ট লিসেনার', en: 'Unlimited payment listeners' },
  phonesNone: { bn: 'পেমেন্ট লিসেনার', en: 'Payment listener' },
  // AUD-06: how long the shop's activity log keeps an entry.
  activityLog: { bn: '{n} দিনের অ্যাক্টিভিটি লগ', en: '{n}-day activity log' },
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

// Plan feature flags the operator can set (PLN-02 `features`) and the line each one shows: in the card's main list,
// then in its quieter list. A flag with no words here is not shown, so a new flag needs its words before it appears.
const featureLines: Record<string, Bilingual> = {
  [CUSTOM_DOMAIN_FEATURE]: { bn: 'নিজের ডোমেইন', en: 'Custom domain' },
  priority_support: { bn: 'সেম-ডে সাপোর্ট', en: 'Same-day support' },
};
const moreFeatureLines: Record<string, Bilingual> = {
  [BRAND_IDENTITY_ADDON]: {
    bn: 'ব্র্যান্ড আইডেন্টিটি: আপনার রং, ফন্ট আর লোগো',
    en: 'Brand identity: your colours, fonts and logo',
  },
};

/** The flags every card lists, ticked or crossed out: each flag with words that any card shown carries. */
interface CardFlags {
  main: string[];
  more: string[];
}

/** A limit's words: with its figure (and for exactly one, when that reads differently), when it is unlimited, and
    the thing itself, crossed out when it is 0. */
interface LimitWords {
  some: Bilingual;
  one?: Bilingual;
  unlimited: Bilingual;
  none: Bilingual;
}

/** The pricing section's cards, pay-as-you-go first and then each plan for sale. */
export interface PricingCardsView {
  payg: PaygView;
  view: PricingView | null;
}

/**
 * Every plan card from the plans as the operator set them (PLN-02, PLN-12, PLN-21): the same rules for every card,
 * pay-as-you-go included. A card lists what every plan shares, then each limit the plan has (an unset one read as
 * LIMIT_WHEN_UNSET says, unlimited in words, 0 crossed out), then every feature flag a card shown carries, ticked or
 * crossed out. The plan marked as suggested is the highlighted one.
 */
export class PricingViewBuilder {
  constructor(
    private readonly copy: Copy,
    private readonly urls: AppUrls,
  ) {}

  cards(
    catalogue: PlanCatalogue | null,
    paygPlan: Plan | null,
    rates: readonly PlatformRate[] | null,
  ): PricingCardsView {
    const model = catalogue ? new PricingModel(catalogue) : null;
    const defaultTermId = model?.defaultTermId() ?? null;
    const priced = model && defaultTermId ? model.plans : [];
    const flags = this.flagsOf([
      ...priced.map((item) => item.plan),
      ...(paygPlan ? [paygPlan] : []),
    ]);

    const paygCard = this.card(paygPlan, flags);
    const payg: PaygView = {
      name: this.copy.of(text.paygName),
      description: this.copy.of(text.paygDescription),
      price: formatTaka(0),
      hot: paygPlan?.suggested === true,
      lines: [...this.paygFees(rates).map((line) => ({ text: line, on: true })), ...paygCard.lines],
      more: paygCard.more,
      cta: this.copy.of(text.paygCta),
      signInUrl: this.urls.signIn(),
    };
    if (!model || !defaultTermId || priced.length === 0) return { payg, view: null };

    const terms = model.terms.map((term) => ({
      id: term.id,
      label: this.copy.language === 'bn' ? term.labelBn : term.labelEn,
      months: term.months,
      savingPercent: Math.max(
        0,
        ...priced.flatMap((plan) =>
          plan.terms.filter((p) => p.term.id === term.id).map((p) => p.savingPercent),
        ),
      ),
    }));

    const plans = priced.map(({ plan, terms: planTerms }): PricingPlanView => {
      const prices: PricingPlanView['prices'] = {};
      const signInUrls: PricingPlanView['signInUrls'] = {};
      for (const item of planTerms) {
        prices[item.term.id] = { total: formatTaka(item.price), monthly: formatTaka(item.monthly) };
        signInUrls[item.term.id] = this.urls.signIn({ planId: plan.id, termId: item.term.id });
      }
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        hot: plan.suggested === true,
        ...this.card(plan, flags),
        prices,
        signInUrls,
      };
    });

    return { payg, view: { terms, defaultTermId, plans } };
  }

  /** The badge on the highlighted card. */
  suggestedBadge(): string {
    return this.copy.of(text.suggested);
  }

  /** PYG-01, PYG-02: pay-as-you-go's fees, as the rates stand (`GET /rates`) or in words without them. */
  paygFees(rates: readonly PlatformRate[] | null): string[] {
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
    return lines;
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

  private flagsOf(plans: readonly Plan[]): CardFlags {
    const carried = new Set(plans.flatMap((plan) => Object.keys(plan.features ?? {})));
    return {
      main: Object.keys(featureLines).filter((flag) => carried.has(flag)),
      more: Object.keys(moreFeatureLines).filter((flag) => carried.has(flag)),
    };
  }

  /** One card's main list and quieter list. A plan that couldn't be read lists only what every plan shares. */
  private card(plan: Plan | null, flags: CardFlags): { lines: PlanLine[]; more: PlanLine[] } {
    const lines = text.shared.map((line) => this.on(this.copy.of(line)));
    if (!plan) return { lines, more: [] };
    const limits = plan.limits;
    const flag = (words: Record<string, Bilingual>, key: string): PlanLine => {
      const label = words[key];
      return { text: label ? this.copy.of(label) : key, on: plan.features?.[key] === true };
    };

    lines.push(
      this.limitLine(this.limit(limits, 'products'), {
        some: text.products,
        unlimited: text.productsUnlimited,
        none: text.productsNone,
      }),
      ...this.periodLines(
        limits,
        [
          ['orders_handled_monthly', text.ordersMonthly],
          ['orders_handled_daily', text.ordersDaily],
          ['orders_total', text.ordersTotal],
        ],
        text.ordersUnlimited,
        text.ordersNone,
      ),
      this.on(this.seats(this.limit(limits, 'staff'))),
      ...this.periodLines(
        limits,
        [
          ['essential_sms_monthly', text.smsMonthly],
          ['essential_sms_total', text.smsTotal],
        ],
        text.smsUnlimited,
        text.smsNone,
      ),
      ...flags.main.map((key) => flag(featureLines, key)),
    );

    const more: PlanLine[] = [
      this.limitLine(
        this.limit(limits, 'storage_mb'),
        { some: text.storage, unlimited: text.storageUnlimited, none: text.storageNone },
        (mb) => this.size(mb),
      ),
      this.limitLine(this.limit(limits, 'bandwidth_gb'), {
        some: text.bandwidth,
        unlimited: text.bandwidthUnlimited,
        none: text.bandwidthNone,
      }),
      this.limitLine(this.limit(limits, 'requests_monthly'), {
        some: text.requests,
        unlimited: text.requestsUnlimited,
        none: text.requestsNone,
      }),
      this.limitLine(this.limit(limits, 'paired_devices'), {
        some: text.phones,
        one: text.phonesOne,
        unlimited: text.phonesUnlimited,
        none: text.phonesNone,
      }),
    ];
    if (limits.activity_retention_days !== undefined) {
      more.push(
        this.on(
          this.copy
            .of(text.activityLog)
            .replace('{n}', this.copy.number(limits.activity_retention_days)),
        ),
      );
    }
    more.push(...flags.more.map((key) => flag(moreFeatureLines, key)));
    return { lines: unique(lines), more: unique(more) };
  }

  /** PLN-19: a limit as the plan sets it; one it doesn't set means what LIMIT_WHEN_UNSET says. */
  private limit(limits: PlanLimits, key: UsageLimitKey): number | null {
    const value = limits[key];
    return value === undefined ? LIMIT_WHEN_UNSET[key] : value;
  }

  /** A limit as a line: its figure, unlimited in words, or the thing crossed out when it is 0. */
  private limitLine(
    value: number | null,
    words: LimitWords,
    figure: (n: number) => string = (n) => this.copy.number(n),
  ): PlanLine {
    if (value === null) return this.on(this.copy.of(words.unlimited));
    if (value === 0) return { text: this.copy.of(words.none), on: false };
    if (value === 1 && words.one) return this.on(this.copy.of(words.one));
    return this.on(this.copy.of(words.some).replace('{n}', figure(value)));
  }

  /**
   * Limits on one thing over different periods (a month, a day, in all): a line for each the plan caps, the thing
   * crossed out for a cap of 0, and one unlimited line when none is capped.
   */
  private periodLines(
    limits: PlanLimits,
    periods: readonly (readonly [UsageLimitKey, Bilingual])[],
    unlimited: Bilingual,
    none: Bilingual,
  ): PlanLine[] {
    const capped = periods.flatMap(([key, words]) => {
      const value = this.limit(limits, key);
      return value === null ? [] : [{ value, words }];
    });
    if (capped.length === 0) return [this.on(this.copy.of(unlimited))];
    return capped.map(({ value, words }) =>
      value === 0
        ? { text: this.copy.of(none), on: false }
        : this.on(this.copy.of(words).replace('{n}', this.copy.number(value))),
    );
  }

  private on(line: string): PlanLine {
    return { text: line, on: true };
  }

  /** Storage as the site writes it: MB under 1 GB, GB from there ("250 MB", "2 GB", "1.5 GB"). */
  private size(mb: number): string {
    return mb < 1024
      ? `${this.copy.number(mb)} MB`
      : `${this.copy.number(Math.round((mb / 1024) * 10) / 10)} GB`;
  }

  /** STF-02: a plan's seats, which count the owner, as the owner and how many staff they leave room for. */
  private seats(staff: number | null): string {
    if (staff === null) return this.copy.of(text.seatsUnlimited);
    if (staff <= 1) return this.copy.of(text.seatsJustYou);
    return this.copy
      .of(text.seatsWithStaff)
      .replace('{n}', this.copy.number(staff))
      .replace('{staff}', this.copy.number(staff - 1));
  }
}

/** Each line once: two caps of 0 on the same thing read the same. */
function unique(lines: PlanLine[]): PlanLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (seen.has(line.text)) return false;
    seen.add(line.text);
    return true;
  });
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
  paygPlan,
  rates,
  urls,
}: {
  language: Language;
  catalogue: PlanCatalogue | null;
  /** PYG-01: pay-as-you-go's own limits, for its card; null when they couldn't be read. */
  paygPlan: Plan | null;
  rates: readonly PlatformRate[] | null;
  urls: AppUrls;
}) {
  const copy = new Copy(language);
  const builder = new PricingViewBuilder(copy, urls);
  const { payg, view } = builder.cards(catalogue, paygPlan, rates);

  // The sketch's section head; the cards add the term toggle under it, since the toggle and the cards share a state.
  const head = (
    <>
      <span className="eyebrow">
        <i />
        <span>{copy.of(text.eyebrow)}</span>
      </span>
      <h2>{copy.of(text.title)}</h2>
      <p>{copy.of(text.lead)}</p>
    </>
  );

  return (
    <section className="sec tint" id="pricing">
      <div className="wrap">
        <PricingCards
          language={language}
          head={head}
          badge={builder.suggestedBadge()}
          payg={payg}
          view={view}
        />
        {!view ? <p className="pwarn">{copy.of(text.unavailable)}</p> : null}
        <p className="pnote">{builder.feesNote(rates)}</p>
        <p className="pnote">{copy.of(text.note)}</p>
      </div>
    </section>
  );
}
