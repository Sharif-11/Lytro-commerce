import { BRAND_IDENTITY_ADDON, CUSTOM_DOMAIN_FEATURE } from '../db/enums';
import { LIMIT_WHEN_UNSET, type PlanLimits, type UsageLimitKey } from '../db/plans/plan-limits';

/**
 * PLN-02, PLN-12, PLN-19, PLN-21 (UI/UX batch 2, 5.1): what a plan card lists, one definition for the marketing site's
 * pricing and the dashboard's plan screen. A card lists what every plan shares, then each limit the plan has (an unset
 * one read as LIMIT_WHEN_UNSET says, unlimited in words, 0 crossed out), then every feature flag a card shown carries,
 * ticked or crossed out; pay-as-you-go's card opens with its fees.
 */
export type PlanCardLanguage = 'bn' | 'en';

interface Words {
  bn: string;
  en: string;
}

/** One line of a card: its words, ticked when on and crossed out when off. */
export interface PlanCardLine {
  text: string;
  on: boolean;
}

/** What a card is built from: a plan's limits and its feature flags. */
export interface PlanCardPlan {
  limits: PlanLimits;
  features?: Record<string, boolean> | null;
}

/** The flags every card lists, ticked or crossed out: each flag with words that any card shown carries. */
export interface PlanCardFlags {
  main: string[];
  more: string[];
}

/** A platform rate as `GET /rates` gives it. */
export interface PlanCardRate {
  key: string;
  value: string | number;
}

/** A limit's words: with its figure (and for exactly one, when that reads differently), unlimited, and the thing itself. */
interface LimitWords {
  some: Words;
  one?: Words;
  unlimited: Words;
  none: Words;
}

/** Every word a card says, in Bangla and English. */
export const PLAN_CARD_WORDS = {
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
  // PYG-02: the order fee is charged when the order is handed over, never when it is placed.
  paygOrderFee: {
    bn: 'অর্ডার কুরিয়ারে বুক বা শিপ হলে অর্ডারের {pct}, কমপক্ষে {min}',
    en: 'Per order, once it is booked with a courier or shipped: {pct} of it, at least {min}',
  },
  paygOrderFeeSoft: {
    bn: 'অর্ডার কুরিয়ারে বুক বা শিপ হলে তবেই অর্ডারপ্রতি ছোট একটা ফি',
    en: 'A small fee per order, only once it is booked with a courier or shipped',
  },
  // PAYG-FAIR-USE-PLAN (PF-2 to PF-4, PF-13, PF-14, PF-17): with fair use on, an order from Lytro opened in two steps; a
  // fake one turned down free; the one top-up that opens the storefront; the API's free allowance and its price.
  paygUnlock: {
    bn: 'অর্ডার প্রতি {total}: নম্বর দেখতে {phone}, কনফার্মে {confirm}',
    en: '{total} an order: {phone} to see the phone, {confirm} to confirm',
  },
  paygRejectFree: {
    bn: 'ফেক অর্ডার নম্বর না দেখেই বাদ দিন, কোনো খরচ নেই',
    en: 'Turn a fake order down before seeing its phone, free',
  },
  paygActivation: {
    bn: 'স্টোরফ্রন্ট চালু রাখতে একবার {fee} টপ-আপ; টাকাটা ব্যালেন্সে থাকে',
    en: 'Top up {fee} once to keep the storefront on; it stays in your balance',
  },
  paygApi: {
    bn: 'মাসে ১০,০০০ API রিকোয়েস্ট ফ্রি, তারপর প্রতি ১,০০০-এ {fee}',
    en: '10,000 API requests a month free, then {fee} per 1,000',
  },
  // PYG-01: each product created is charged at this rate, which may be nothing.
  paygProductFee: { bn: 'প্রতিটি নতুন প্রোডাক্টে {fee}', en: '{fee} for each new product' },
  paygProductFree: { bn: 'প্রোডাক্ট যোগ করা ফ্রি', en: 'Adding products is free' },
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
  // D9-31: media bandwidth is no limit on any plan.
  bandwidthUnlimited: { bn: 'আনলিমিটেড ব্যান্ডউইথ', en: 'Unlimited bandwidth' },
  requests: { bn: 'মাসে {n} API রিকোয়েস্ট', en: '{n} API requests a month' },
  requestsUnlimited: { bn: 'আনলিমিটেড API রিকোয়েস্ট', en: 'Unlimited API requests' },
  requestsNone: { bn: 'API রিকোয়েস্ট', en: 'API requests' },
  phonesOne: { bn: '১টি পেমেন্ট লিসেনার', en: '1 payment listener' },
  phones: { bn: '{n}টি পেমেন্ট লিসেনার', en: '{n} payment listeners' },
  phonesUnlimited: { bn: 'আনলিমিটেড পেমেন্ট লিসেনার', en: 'Unlimited payment listeners' },
  phonesNone: { bn: 'পেমেন্ট লিসেনার', en: 'Payment listener' },
  // AUD-06: how long the shop's activity log keeps an entry.
  activityLog: { bn: '{n} দিনের অ্যাক্টিভিটি লগ', en: '{n}-day activity log' },
} as const;

// Plan feature flags the operator can set (PLN-02 `features`) and the line each one shows: in the card's main list,
// then in its quieter list. A flag with no words here is not shown, so a new flag needs its words before it appears.
const FEATURE_LINES: Record<string, Words> = {
  [CUSTOM_DOMAIN_FEATURE]: { bn: 'নিজের ডোমেইন', en: 'Custom domain' },
  priority_support: { bn: 'সেম-ডে সাপোর্ট', en: 'Same-day support' },
};
const MORE_FEATURE_LINES: Record<string, Words> = {
  [BRAND_IDENTITY_ADDON]: {
    bn: 'ব্র্যান্ড আইডেন্টিটি: আপনার রং, ফন্ট আর লোগো',
    en: 'Brand identity: your colours, fonts and logo',
  },
};

/** Taka as a card writes it, whole: "৳449". */
export function planCardTaka(amount: number): string {
  return `৳${Math.round(amount).toLocaleString('en-US')}`;
}

/** Taka keeping the paisa a fee has: "৳20", "৳0.50". */
/** PF-13: the one top-up that opens a pay-as-you-go storefront, as lytro.app names it (the operator's setting, ৳10). */
const PAYG_ACTIVATION_TOP_UP = 10;

function takaExact(value: number): string {
  return Number.isInteger(value) ? planCardTaka(value) : `৳${value.toFixed(2)}`;
}

/** "1.5%", "0.1%": a stored percent without its trailing zeros. */
function percent(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

/** A rate's value as a number, or null when the rates weren't read or don't hold it. */
function rateOf(rates: readonly PlanCardRate[] | null, key: string): number | null {
  const value = rates?.find((rate) => rate.key === key)?.value;
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Each line once: two caps of 0 on the same thing read the same. */
function unique(lines: PlanCardLine[]): PlanCardLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (seen.has(line.text)) return false;
    seen.add(line.text);
    return true;
  });
}

/**
 * A card's lines in one language. `number` writes a figure as the app writes it -- the site in Bangla digits grouped in
 * lakhs, the dashboard in its own -- and defaults to the plain English grouping.
 */
export class PlanCardLines {
  constructor(
    private readonly language: PlanCardLanguage,
    private readonly number: (value: number) => string = (value) =>
      value.toLocaleString('en-US', { maximumFractionDigits: 1 }),
  ) {}

  /** The flags the cards shown list: each flag with words that any of these plans carries. */
  flagsOf(plans: readonly PlanCardPlan[]): PlanCardFlags {
    const carried = new Set(plans.flatMap((plan) => Object.keys(plan.features ?? {})));
    return {
      main: Object.keys(FEATURE_LINES).filter((flag) => carried.has(flag)),
      more: Object.keys(MORE_FEATURE_LINES).filter((flag) => carried.has(flag)),
    };
  }

  /** One card's main list and quieter list. A plan that couldn't be read lists only what every plan shares. */
  card(
    plan: PlanCardPlan | null,
    flags: PlanCardFlags,
  ): { lines: PlanCardLine[]; more: PlanCardLine[] } {
    const w = PLAN_CARD_WORDS;
    const lines = w.shared.map((line) => this.on(this.of(line)));
    if (!plan) return { lines, more: [] };
    const limits = plan.limits;
    const flag = (words: Record<string, Words>, key: string): PlanCardLine => {
      const label = words[key];
      return { text: label ? this.of(label) : key, on: plan.features?.[key] === true };
    };

    lines.push(
      this.limitLine(this.limit(limits, 'products'), {
        some: w.products,
        unlimited: w.productsUnlimited,
        none: w.productsNone,
      }),
      ...this.periodLines(
        limits,
        [
          ['orders_handled_monthly', w.ordersMonthly],
          ['orders_handled_daily', w.ordersDaily],
          ['orders_total', w.ordersTotal],
        ],
        w.ordersUnlimited,
        w.ordersNone,
      ),
      this.on(this.seats(this.limit(limits, 'staff'))),
      ...this.periodLines(
        limits,
        [
          ['essential_sms_monthly', w.smsMonthly],
          ['essential_sms_total', w.smsTotal],
        ],
        w.smsUnlimited,
        w.smsNone,
      ),
      ...flags.main.map((key) => flag(FEATURE_LINES, key)),
    );

    const more: PlanCardLine[] = [
      this.limitLine(
        this.limit(limits, 'storage_mb'),
        { some: w.storage, unlimited: w.storageUnlimited, none: w.storageNone },
        (mb) => this.size(mb),
      ),
      // D9-31: every plan's photos and videos are served from Cloudflare's cache, uncounted.
      this.on(this.of(w.bandwidthUnlimited)),
      this.limitLine(this.limit(limits, 'requests_monthly'), {
        some: w.requests,
        unlimited: w.requestsUnlimited,
        none: w.requestsNone,
      }),
      this.limitLine(this.limit(limits, 'paired_devices'), {
        some: w.phones,
        one: w.phonesOne,
        unlimited: w.phonesUnlimited,
        none: w.phonesNone,
      }),
    ];
    if (limits.activity_retention_days !== undefined) {
      more.push(
        this.on(this.of(w.activityLog).replace('{n}', this.number(limits.activity_retention_days))),
      );
    }
    more.push(...flags.more.map((key) => flag(MORE_FEATURE_LINES, key)));
    return { lines: unique(lines), more: unique(more) };
  }

  /** PYG-01, PYG-02: pay-as-you-go's fees, as the rates stand (`GET /rates`) or in words without them. */
  paygFees(rates: readonly PlanCardRate[] | null): string[] {
    const w = PLAN_CARD_WORDS;
    const product = rateOf(rates, 'payg_product_fee');
    const productLine =
      product === null
        ? []
        : [
            product === 0
              ? this.of(w.paygProductFree)
              : this.of(w.paygProductFee).replace('{fee}', takaExact(product)),
          ];
    // PF-39: with fair use on, the shown rates are its own, and the order fee no longer.
    const phone = rateOf(rates, 'payg_unlock_phone');
    const confirm = rateOf(rates, 'payg_unlock_confirm');
    if (phone !== null && confirm !== null) {
      const api = rateOf(rates, 'payg_api_per_thousand');
      return [
        this.of(w.paygUnlock)
          .replace('{total}', takaExact(phone + confirm))
          .replace('{phone}', takaExact(phone))
          .replace('{confirm}', takaExact(confirm)),
        this.of(w.paygRejectFree),
        ...productLine,
        this.of(w.paygActivation).replace('{fee}', takaExact(PAYG_ACTIVATION_TOP_UP)),
        ...(api === null ? [] : [this.of(w.paygApi).replace('{fee}', takaExact(api))]),
      ];
    }
    const min = rateOf(rates, 'payg_order_fee_min');
    const pct = rateOf(rates, 'payg_order_fee_pct');
    const lines = [
      min !== null && pct !== null
        ? this.of(w.paygOrderFee).replace('{pct}', percent(pct)).replace('{min}', takaExact(min))
        : this.of(w.paygOrderFeeSoft),
    ];
    return [...lines, ...productLine];
  }

  private of(words: Words): string {
    return words[this.language];
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
    figure: (n: number) => string = (n) => this.number(n),
  ): PlanCardLine {
    if (value === null) return this.on(this.of(words.unlimited));
    if (value === 0) return { text: this.of(words.none), on: false };
    if (value === 1 && words.one) return this.on(this.of(words.one));
    return this.on(this.of(words.some).replace('{n}', figure(value)));
  }

  /**
   * Limits on one thing over different periods (a month, a day, in all): a line for each the plan caps, the thing
   * crossed out for a cap of 0, and one unlimited line when none is capped.
   */
  private periodLines(
    limits: PlanLimits,
    periods: readonly (readonly [UsageLimitKey, Words])[],
    unlimited: Words,
    none: Words,
  ): PlanCardLine[] {
    const capped = periods.flatMap(([key, words]) => {
      const value = this.limit(limits, key);
      return value === null ? [] : [{ value, words }];
    });
    if (capped.length === 0) return [this.on(this.of(unlimited))];
    return capped.map(({ value, words }) =>
      value === 0
        ? { text: this.of(none), on: false }
        : this.on(this.of(words).replace('{n}', this.number(value))),
    );
  }

  private on(line: string): PlanCardLine {
    return { text: line, on: true };
  }

  /** Storage as a card writes it: MB under 1 GB, GB from there ("250 MB", "2 GB", "1.5 GB"). */
  private size(mb: number): string {
    return mb < 1024
      ? `${this.number(mb)} MB`
      : `${this.number(Math.round((mb / 1024) * 10) / 10)} GB`;
  }

  /** STF-02: a plan's seats, which count the owner, as the owner and how many staff they leave room for. */
  private seats(staff: number | null): string {
    const w = PLAN_CARD_WORDS;
    if (staff === null) return this.of(w.seatsUnlimited);
    if (staff <= 1) return this.of(w.seatsJustYou);
    return this.of(w.seatsWithStaff)
      .replace('{n}', this.number(staff))
      .replace('{staff}', this.number(staff - 1));
  }
}
