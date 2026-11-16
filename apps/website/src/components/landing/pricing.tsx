import { PlanCardLines } from '@lytronix/validators';
import type { Plan, PlanCatalogue, PlatformRate } from '@/lib/api/plans-api';
import { Copy } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { formatTaka, PricingModel } from '@/lib/pricing/pricing-model';
import type { AppUrls } from '@/lib/urls';
import {
  PricingCards,
  type PaygView,
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
  paygCta: { bn: 'ফ্রি দোকান খুলুন', en: 'Open a free shop' },
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
  // PLN-02 (UI/UX batch 2): what each card lists, one definition shared with the dashboard's plan screen.
  private readonly lines: PlanCardLines;

  constructor(
    private readonly copy: Copy,
    private readonly urls: AppUrls,
  ) {
    this.lines = new PlanCardLines(copy.language, (value) => copy.number(value));
  }

  cards(
    catalogue: PlanCatalogue | null,
    paygPlan: Plan | null,
    rates: readonly PlatformRate[] | null,
  ): PricingCardsView {
    const model = catalogue ? new PricingModel(catalogue) : null;
    const defaultTermId = model?.defaultTermId() ?? null;
    const priced = model && defaultTermId ? model.plans : [];
    const flags = this.lines.flagsOf([
      ...priced.map((item) => item.plan),
      ...(paygPlan ? [paygPlan] : []),
    ]);

    const paygCard = this.lines.card(paygPlan, flags);
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
        ...this.lines.card(plan, flags),
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
    return this.lines.paygFees(rates);
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
