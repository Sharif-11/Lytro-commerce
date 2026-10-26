import type { Page, Route } from '@playwright/test';
import {
  billingPrices,
  ONE_MONTH,
  paygPlan,
  PLAN_NAME,
  plans,
  priceOf,
  prices,
  STARTER,
  termOf,
  terms,
} from './catalogue';
import { addonOffers, usageAnswer, type UsageFixture } from './usage';
import {
  drawnLedger,
  drawnPayments,
  invoiceOf,
  payment as listedPayment,
  type PaymentFixture,
} from './payments';

// The dashboard against a mocked API: each /api/v1 call answered from these fixtures, in the server's own envelope
// ({ success, statusCode, message, data }), so a screen's every state can be shown without a server. The figures
// are the prototype's own shop (docs/brand/lytro-dashboard.html), so a screen can be set beside its drawing.

export type Language = 'bn' | 'en';

export const SLUG = 'megh';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Money hub's side of the shop (Slice 11.5b), where a test needs it to differ from the working shop's. */
export interface MoneyState {
  /** The plan the shop is on, when it has one: Starter unless a test says otherwise. */
  plan?: string;
  /** GET /billing/downgrade: a move down (to a plan) or to pay-as-you-go waiting for the period's end. */
  scheduled?: { kind: 'downgrade' | 'pay_as_you_go_switch'; targetPlanId: string | null } | null;
  /** LIF-01: the subscription stops at the period's end. */
  cancelled?: boolean;
  /** DWN-12: the last downgrade's checklist. */
  checklist?: unknown;
  /** What a move down would leave over (POST /billing/downgrade/preview). */
  over?: { key: string; used: number; limit: number }[];
  /** The balance, in taka with paisa. */
  balance?: string;
  /** The unused-time credit an upgrade carries (UPG-03). */
  credit?: number;
  /** BIL-09: the server works out this amount instead of the one shown, and says so once. */
  amountChangedTo?: string | null;
  /** BIL-19: the shop's payments to Lytro, newest first; the prototype's list when left out. */
  payments?: PaymentFixture[];
  /** GET /home's rejected or lapsed payment, for Home's row and the Billing chip's count. */
  needing?: { id: string; kind: string; amount: string; state: string } | null;
  /** BAL-14: the statement's entries, newest first; the prototype's when left out. */
  ledger?: unknown[];
  /** LIF-16: the owner's export requests, newest first. */
  exports?: unknown[];
  /** Whether the owner has an email the server writes to. */
  hasEmail?: boolean;
  /** LIF-24. */
  suspended?: boolean;
  /** PYG-09: an archived shop that was on pay-as-you-go, closed by its owner, with no plan or period. */
  closed?: boolean;
  /** LIF-12: an archived or locked shop's deletion date, in days from now. */
  deletesInDays?: number | null;
  /** GET /usage and GET /addons where they differ from the drawn shop's (Slice 11.5c). */
  usage?: UsageFixture;
}

export interface ShopState {
  language?: Language;
  /** The tenant's lifecycle state and how far its period end is, in days (negative: in the past). */
  state?: 'trial' | 'pay_as_you_go' | 'active' | 'grace' | 'read_only' | 'locked' | 'archived';
  periodEndDays?: number;
  isOwner?: boolean;
  permissions?: string[];
  /** GET /home's stock part; null when the person may not see stock. */
  stock?: { low: number; out: number } | null;
  /** GET /home's other parts where they differ from the working shop's. */
  home?: Record<string, unknown>;
  money?: MoneyState;
}

export function envelope(data: unknown, statusCode = 200): string {
  return JSON.stringify({ success: true, statusCode, message: 'OK', data });
}

/** A refusal in the server's error envelope (API-CONTRACT §2.6), with its message already worded. */
export function refusal(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): string {
  return JSON.stringify({ success: false, statusCode: 0, message, errors: { code, details } });
}

function shopName(language: Language): string {
  return language === 'bn' ? 'মেঘ ফ্যাশন' : 'Megh Fashion';
}

// A paid plan's states, whose term and lapse stages /me names (TRM-12, LIF-26).
const PAID = ['active', 'grace', 'read_only', 'locked', 'archived'];
const STEPS_AHEAD = ['active', 'grace', 'read_only'];

export function me(state: Required<ShopState>): unknown {
  const closed = state.money.closed ?? false;
  const paid = PAID.includes(state.state) && !closed;
  const deletes = state.money.deletesInDays;
  return {
    subscriber: { id: 'sub-1' },
    isOwner: state.isOwner,
    permissions: state.permissions,
    name: state.language === 'bn' ? 'রুমানা' : 'Rumana',
    tenant: {
      id: 'tenant-1',
      slug: SLUG,
      shopName: shopName(state.language),
      state: state.state,
      suspended: state.money.suspended ?? false,
      planName:
        state.state === 'pay_as_you_go' || closed
          ? 'Pay-as-you-go'
          : (PLAN_NAME[state.money.plan ?? STARTER] ?? 'Starter'),
      periodEnd:
        state.state === 'pay_as_you_go' || closed
          ? null
          : new Date(Date.now() + state.periodEndDays * DAY_MS).toISOString(),
      autoRenewEnabled: false,
      logo: null,
      brand: null,
      billingTerm: paid ? termOf(ONE_MONTH) : null,
      lapseStages: STEPS_AHEAD.includes(state.state)
        ? { grace: 3, readOnly: 4, locked: 8, archived: 45 }
        : null,
      deletesAt:
        deletes === undefined || deletes === null
          ? null
          : new Date(Date.now() + deletes * DAY_MS).toISOString(),
    },
    shops: [
      { slug: SLUG, shopName: shopName(state.language), role: state.isOwner ? 'owner' : 'staff' },
    ],
    hasDeletedShop: false,
  };
}

const DHAKA_CITY = { en: 'Dhaka city', bn: 'ঢাকা সিটি' };

/** SUP-01's first group, all done: the working shop's checklist folds into the side column. */
const READY = {
  deliveryCharges: { area: DHAKA_CITY, inside: '70.00', outside: '130.00' },
  firstProduct: true,
  logo: true,
  linkShared: true,
  apiKey: false,
};

function home(state: Required<ShopState>): unknown {
  return {
    products: { total: 6, active: 5 },
    stock: state.stock ? { ...state.stock, expiringBatches: 0 } : null,
    balance: { amount: '412.50', low: false, freeSms: { used: 6, limit: 10 } },
    topUpsBeingChecked: { count: 1, amount: '500.00' },
    paymentsBeingChecked: null,
    paymentNeedingYou: state.money.needing ?? null,
    staffWithoutPassword: 0,
    fastSpendAlertedAt: null,
    // The checklist is the owner's alone (SUP-01).
    checklist: state.isOwner ? READY : null,
    ...state.home,
  };
}

/** The prototype's "new shop, day one": a trial with 27 days left, nothing made or sold yet, two items ticked. */
export const DAY_ONE: ShopState = {
  state: 'trial',
  periodEndDays: 27,
  stock: { low: 0, out: 0 },
  home: {
    products: { total: 0, active: 0 },
    balance: { amount: '0.00', low: false, freeSms: { used: 0, limit: 10 } },
    topUpsBeingChecked: { count: 0, amount: '0.00' },
    checklist: { ...READY, firstProduct: false, logo: false, linkShared: false },
  },
};

function products(language: Language, search: string): unknown {
  const jacket = {
    id: 'p-2',
    name: language === 'bn' ? 'ডেনিম জ্যাকেট' : 'Denim jacket',
    slug: 'denim-jacket',
    basePrice: '1890.00',
    minPrice: '1890.00',
    maxPrice: '1890.00',
    active: true,
    stockState: 'low',
    primaryCategoryId: 'c-jackets',
    variantCount: 4,
    image: null,
    createdAt: new Date().toISOString(),
  };
  const matches = /jack|জ্যাক/i.test(search) ? [jacket] : [];
  return { products: matches, page: 1, limit: 20, total: matches.length, pages: 1 };
}

function categories(language: Language): unknown {
  return [{ id: 'c-jackets', parentId: null, name: language === 'bn' ? 'জ্যাকেট' : 'Jackets' }];
}

/** RAT-01's pay-as-you-go fees and the other rates, as the platform sets them by default. */
const RATES = [
  ['sms_per_unit', '0.5500'],
  ['fraud_check', '3.0000'],
  ['ai_reply', '0.4000'],
  ['payg_order_fee_min', '20.0000'],
  ['payg_order_fee_pct', '1.5000'],
  ['payg_product_fee', '10.0000'],
].map(([key, value]) => ({ key, value, effectiveFrom: '2026-10-01T00:00:00.000Z' }));

function wallets(language: Language): unknown {
  return [
    {
      id: 'w-1',
      provider: 'bKash',
      number: '01700000000',
      label: language === 'bn' ? 'মার্চেন্ট' : 'Merchant',
    },
    { id: 'w-2', provider: 'Nagad', number: '01800000000', label: null },
  ];
}

// What the first build's screens read: Menu's live lines.
const FIRST_BUILD_READS: Record<string, unknown> = {
  '/balance/essential-sms': { monthlyUsed: 6, totalUsed: 6, monthlyLimit: 10, totalLimit: null },
  '/billing/invoices': [],
  '/staff': { seats: { used: 2, total: 2 }, staff: [] },
};

/** The shop's state with every field filled in: the prototype's working shop unless a test says otherwise. */
export function shopState(given: ShopState = {}): Required<ShopState> {
  return {
    language: 'bn',
    state: 'active',
    periodEndDays: 20,
    isOwner: true,
    permissions: [],
    stock: { low: 1, out: 1 },
    home: {},
    ...given,
    money: { ...given.money },
  };
}

/** The plan a shop's own state has: none on a trial or pay-as-you-go. */
function ownPlan(state: Required<ShopState>): string | null {
  if (state.money.closed) return null;
  return state.state === 'trial' || state.state === 'pay_as_you_go'
    ? null
    : (state.money.plan ?? STARTER);
}

function payment(
  kind: string,
  planId: string | null,
  termId: string | null,
  amount: string,
): unknown {
  return {
    id: 'payment-1',
    tenantId: 'tenant-1',
    kind,
    planId,
    billingTermId: termId,
    amount,
    creditAmount: '0.00',
    quotedAt: new Date().toISOString(),
    status: 'pending',
    senderNumber: null,
    transactionId: null,
    verifiedBy: null,
    verifiedAt: null,
    submittedAt: null,
    note: null,
    cancelReason: null,
    createdAt: new Date().toISOString(),
  };
}

/** What a signed-in shop's GET answers: the fixtures, else an empty success. */
export function shopAnswer(path: string, url: URL, state: Required<ShopState>): unknown {
  const money = state.money;
  if (path === '/me') return me(state);
  if (path === '/home') return home(state);
  if (path === '/products') return products(state.language, url.searchParams.get('search') ?? '');
  if (path === '/categories') return categories(state.language);
  if (path === '/plans') return plans();
  if (path === '/plans/pay-as-you-go') return paygPlan();
  if (path === '/billing-terms') return terms();
  const priced = /^\/plans\/([^/]+)\/prices$/.exec(path);
  if (priced) return prices(priced[1] ?? '');
  if (path === '/billing/prices') {
    return billingPrices(
      url.searchParams.get('billingTermId') ?? ONE_MONTH,
      ownPlan(state),
      state.state === 'active',
      money.credit ?? 299,
    );
  }
  if (path === '/billing/downgrade') {
    const change = money.scheduled;
    return change
      ? {
          id: 'change-1',
          tenantId: 'tenant-1',
          kind: change.kind,
          targetPlanId: change.targetPlanId,
          effectiveAt: new Date(Date.now() + state.periodEndDays * DAY_MS).toISOString(),
          createdAt: new Date().toISOString(),
        }
      : null;
  }
  if (path === '/billing/cancellation') {
    return { cancelledAt: money.cancelled ? new Date().toISOString() : null };
  }
  if (path === '/billing/downgrade/checklist') return { checklist: money.checklist ?? null };
  if (path === '/balance') {
    return {
      amount: money.balance ?? '412.50',
      frozen: false,
      topUpMin: 100,
      topUpMax: 50000,
      feesThisMonth: '612.00',
    };
  }
  if (path === '/balance/current-rates') return RATES;
  if (path === '/platform-wallets') return wallets(state.language);
  if (path === '/exports') return money.exports ?? [];
  if (path === '/billing/payments') {
    const wanted = url.searchParams.get('state');
    const all = (money.payments ??= drawnPayments());
    const payments = wanted ? all.filter((each) => each.state === wanted) : all;
    return { payments, page: 1, limit: 20, total: payments.length, pages: 1 };
  }
  const invoice = /^\/billing\/invoices\/([^/]+)$/.exec(path);
  if (invoice) return invoiceOf(invoice[1] ?? '');
  if (path === '/balance/ledger') {
    const types = url.searchParams.get('type')?.split(',') ?? [];
    const entries = (money.ledger ?? drawnLedger()) as { type: string }[];
    return {
      entries: types.length ? entries.filter((each) => types.includes(each.type)) : entries,
      nextCursor: null,
    };
  }
  const trial = state.state === 'trial';
  if (path === '/usage') return usageAnswer({ trial, ...money.usage });
  if (path === '/addons') return addonOffers({ trial, ...money.usage });
  if (path === '/me/identities') {
    return {
      identities: [
        { id: 'i-1', kind: 'phone', value: '+8801711234567' },
        ...(money.hasEmail ? [{ id: 'i-2', kind: 'email', value: 'rumana@example.com' }] : []),
      ],
    };
  }
  return FIRST_BUILD_READS[path] ?? {};
}

/** Every call the mock answered, for a test to check what was sent. */
export interface ApiLog {
  calls: { method: string; path: string; body: unknown }[];
  sent: (method: string, path: string) => unknown;
}

/** Sets the browser's language on the first load only, so a switch the test makes survives a reload (I18N-02). */
export async function startIn(page: Page, language: Language): Promise<void> {
  await page.addInitScript((each: string) => {
    if (localStorage.getItem('lytro.language') === null)
      localStorage.setItem('lytro.language', each);
  }, language);
}

/**
 * Signs the browser in (the CSRF copy a reload keeps, SEC-14), sets its language, and answers every /api/v1 call
 * as the shop does: the reads from the fixtures, the payment requests as the server makes them (BIL-09).
 */
export async function mockApi(page: Page, given: ShopState = {}): Promise<ApiLog> {
  const state = shopState(given);
  const money = state.money;
  const log: ApiLog = {
    calls: [],
    sent: (method, path) =>
      [...log.calls].reverse().find((call) => call.method === method && call.path === path)?.body,
  };
  await page.addInitScript(() => {
    sessionStorage.setItem('lytro.tenant.csrf', 'csrf-e2e');
  });
  await startIn(page, state.language);
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();
    const body = (request.postDataJSON() ?? null) as Record<string, string | number> | null;
    log.calls.push({ method, path, body });
    const ok = (data: unknown): Promise<void> =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) });

    if (method === 'POST' && (path === '/billing/quote' || path === '/billing/upgrade/quote')) {
      const planId = String(body?.planId ?? '');
      const termId = String(body?.billingTermId ?? ONE_MONTH);
      const changedTo = money.amountChangedTo;
      if (changedTo && Number(body?.amount) !== Number(changedTo)) {
        // A day of credit less: the prices read after this carry the new figure.
        money.credit = priceOf(planId, termId) - Number(changedTo);
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: refusal('conflict', 'The amount changed.', { amount: changedTo }),
        });
      }
      const upgrade = path === '/billing/upgrade/quote';
      const price = priceOf(planId, termId);
      const amount = `${String(upgrade ? price - (money.credit ?? 299) : price)}.00`;
      const quote = payment(upgrade ? 'upgrade' : 'renewal', planId, termId, amount) as object;
      return ok(
        upgrade
          ? {
              ...quote,
              periodStart: new Date().toISOString(),
              periodEnd: new Date(Date.now() + 30 * DAY_MS).toISOString(),
            }
          : quote,
      );
    }
    if (
      method === 'POST' &&
      (path === '/billing/purchase' || path === '/billing/upgrade/confirm')
    ) {
      const viaBalance = body?.method === 'balance';
      return ok({
        ...(payment('renewal', STARTER, ONE_MONTH, '449.00') as object),
        status: viaBalance ? 'verified' : 'pending',
      });
    }
    if (method === 'POST' && path === '/billing/downgrade/preview') return ok(money.over ?? []);
    if (method === 'POST' && path === '/balance/top-up/quote') {
      return ok(
        listedPayment({
          id: 'payment-1',
          kind: 'top_up',
          state: 'awaiting',
          amount: `${String(body?.amount ?? 0)}.00`,
        }),
      );
    }
    if (method === 'POST' && path === '/balance/top-up/confirm') return ok({ ok: true });
    const cancelled = /^\/(?:billing\/payments|balance\/top-up)\/([^/]+)\/cancel$/.exec(path);
    if (method === 'POST' && cancelled) {
      // BIL-19: the list read after it shows the request cancelled by the shop.
      money.payments = (money.payments ?? drawnPayments()).map((each) =>
        each.id === cancelled[1]
          ? {
              ...each,
              state: 'cancelled',
              status: 'cancelled',
              cancelReason: 'seller',
              verifiedAt: new Date().toISOString(),
            }
          : each,
      );
      return ok({ ok: true });
    }
    if (method === 'POST' && path === '/exports') {
      const requested = {
        id: 'export-1',
        tenantId: 'tenant-1',
        status: 'pending',
        fileSizeBytes: null,
        contentType: null,
        failureReason: null,
        requestedAt: new Date().toISOString(),
        readyAt: null,
        expiresAt: null,
      };
      // The list read after it holds the new request, being made.
      money.exports = [requested, ...(money.exports ?? [])];
      return ok(requested);
    }
    if (method === 'PATCH' && path === '/addons/auto-buy') {
      // PLN-15: the usage read after it shows the switch as set.
      const usage = (money.usage ??= {});
      const wanted = (request.postDataJSON() as { bandwidth?: unknown } | null)?.bandwidth;
      if (typeof wanted === 'boolean') usage.autoBuy = { ...usage.autoBuy, bandwidth: wanted };
      return ok([]);
    }
    if (method === 'POST' && path.startsWith('/billing/')) return ok({ ok: true });
    return ok(shopAnswer(path, url, state));
  });
  return log;
}
