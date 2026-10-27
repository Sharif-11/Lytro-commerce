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
import {
  addonOffers,
  CATALOGUE,
  renewingAddons,
  shopAddonsAnswer,
  usageAnswer,
  type AddonsFixture,
  type UsageFixture,
} from './usage';
import { accountWrite, OAUTH_PAGE, ownIdentities, type IdentityFixture } from './account';
import { drawnKeys, keysWrite, type KeyFixture } from './api-keys';
import { drawnMeta, metaAnswer, metaWrite, type MetaFixture } from './meta';
import { activityAnswer, drawnActivity, earlierActivity, type ActivityFixture } from './activity';
import {
  drawnSettings,
  settingsAnswer,
  settingsWrite,
  UPLOAD_PATH,
  type SettingsFixture,
} from './settings';
import {
  categoryList,
  drawnProducts,
  productDetail,
  productList,
  productRemove,
  productWrite,
  type ProductsFixture,
} from './products';
import { PRESETS } from './presets';
import { drawnTeam, teamAnswer, teamWrite, type TeamFixture } from './team';
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
  /** GET /usage, GET /addons and GET /addons/mine where they differ from the drawn shop's (Slice 11.5c). */
  usage?: UsageFixture & AddonsFixture;
}

export interface ShopState {
  language?: Language;
  /** The tenant's lifecycle state and how far its period end is, in days (negative: in the past). */
  state?: 'trial' | 'pay_as_you_go' | 'active' | 'grace' | 'read_only' | 'locked' | 'archived';
  periodEndDays?: number;
  isOwner?: boolean;
  permissions?: string[];
  /** How the person signed in (TEN-31) and their roles' names; a staff member is Kamal, the owner Rumana. */
  signIn?: 'own' | 'staff';
  roles?: string[];
  /** GET /activity's entries where they differ from the prototype's six, and the older page's. */
  activity?: { entries: ActivityFixture[]; earlier: ActivityFixture[] } | null;
  /** Team's people, roles and seats where they differ from the prototype's; the writes change it. */
  team?: TeamFixture | null;
  /** The shop's own settings where they differ from the prototype's; Shop details' writes change them. */
  settings?: SettingsFixture | null;
  /** The shop's API keys where they differ from the prototype's three; the page's writes change them. */
  keys?: KeyFixture[] | null;
  /** Facebook and Meta where it differs from the prototype's connected shop; the page's writes change it. */
  meta?: MetaFixture | null;
  /** The shop's products and product limit where they differ from the prototype's (Slice 11.7a). */
  products?: ProductsFixture | null;
  /** The person's ways to sign in where they differ from a phone (and an email with `money.hasEmail`). */
  identities?: IdentityFixture[] | null;
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
    signIn: state.signIn,
    roles: state.roles,
    phone: state.signIn === 'staff' ? '+8801611222333' : null,
    name: state.isOwner
      ? state.language === 'bn'
        ? 'রুমানা'
        : 'Rumana'
      : state.language === 'bn'
        ? 'কামাল'
        : 'Kamal',
    tenant: {
      id: 'tenant-1',
      slug: SLUG,
      shopName: state.settings?.shopName ?? shopName(state.language),
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
      logo: state.settings?.logo ?? null,
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
};

/** The shop's state with every field filled in: the prototype's working shop unless a test says otherwise. */
export function shopState(given: ShopState = {}): Required<ShopState> {
  return {
    language: 'bn',
    state: 'active',
    periodEndDays: 20,
    isOwner: true,
    permissions: [],
    signIn: 'own',
    roles: [],
    activity: null,
    team: null,
    settings: null,
    keys: null,
    meta: null,
    identities: null,
    products: null,
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
  if (path === '/products') {
    return productList((state.products ??= drawnProducts()), url, state.language);
  }
  if (path === '/categories')
    return categoryList((state.products ??= drawnProducts()), state.language);
  if (path === '/presets') {
    return PRESETS.map(([key, labelBn, labelEn]) => ({ key, labelBn, labelEn, defaults: {} }));
  }
  if (path === '/plans') return plans();
  if (path === '/plans/pay-as-you-go') return paygPlan();
  if (path === '/billing-terms') return terms();
  const priced = /^\/plans\/([^/]+)\/prices$/.exec(path);
  if (priced) return prices(priced[1] ?? '');
  if (path === '/billing/prices') {
    // UPG-14: the plan's renewal carries the add-ons set to renew with it.
    return (
      billingPrices(
        url.searchParams.get('billingTermId') ?? ONE_MONTH,
        ownPlan(state),
        state.state === 'active',
        money.credit ?? 299,
      ) as { move: string }[]
    ).map((option) =>
      option.move === 'renewal' ? { ...option, addons: renewingAddons(money.usage) } : option,
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
  if (path === '/addons') {
    return addonOffers({
      trial,
      grace: state.state === 'grace',
      payg: state.state === 'pay_as_you_go',
      ...money.usage,
    });
  }
  if (path === '/addons/mine') return shopAddonsAnswer(money.usage);
  const team = teamAnswer(path, state.team ?? drawnTeam(state.language));
  if (team !== undefined) return team;
  const own = settingsAnswer(path, state.settings ?? drawnSettings(state.language));
  if (own !== undefined) return own;
  if (path === '/api-keys') return state.keys ?? drawnKeys();
  const meta = metaAnswer(path, state.meta ?? drawnMeta());
  if (meta !== undefined) return meta;
  if (path === '/activity') {
    const activity = state.activity ?? {
      entries: drawnActivity(state.language),
      earlier: earlierActivity(state.language),
    };
    return activityAnswer(url, activity.entries, activity.earlier);
  }
  if (path === '/me/identities') {
    return { identities: state.identities ?? ownIdentities(money.hasEmail ?? false) };
  }
  if (path === '/auth/providers') return { providers: ['google', 'facebook'] };
  return FIRST_BUILD_READS[path] ?? {};
}

/** Every call the mock answered, for a test to check what was sent. */
export interface ApiLog {
  /** Each call, with its query string (`?active=true`, or '' for none). */
  calls: { method: string; path: string; query: string; body: unknown }[];
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
  const team = (state.team ??= drawnTeam(state.language));
  const settings = (state.settings ??= drawnSettings(state.language));
  const keys = (state.keys ??= drawnKeys());
  const meta = (state.meta ??= drawnMeta());
  const identities = (state.identities ??= ownIdentities(money.hasEmail ?? false));
  // A connect leaves for the provider (AUTH-27); a blank page stands in for it.
  await page.route(`**${OAUTH_PAGE}**`, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>provider</p>' }),
  );
  // The browser sends an upload's file to the link it was given (R2 in production).
  await page.route(`**${UPLOAD_PATH}`, (route: Route) => route.fulfill({ status: 200 }));
  const log: ApiLog = {
    calls: [],
    sent: (method, path) =>
      [...log.calls].reverse().find((call) => call.method === method && call.path === path)?.body,
  };
  await page.addInitScript(() => {
    sessionStorage.setItem('lytro.tenant.csrf', 'csrf-e2e');
  });
  await startIn(page, state.language);
  // The add-on request a purchase pays for (Slice 11.5c).
  let quoted: { key: string; quantity: number; amount: string; renews: boolean } | null = null;
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();
    const body = (request.postDataJSON() ?? null) as Record<string, string | number> | null;
    log.calls.push({ method, path, query: url.search, body });
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
    if (method === 'POST' && (path === '/addons/quote' || path === '/addons/packs')) {
      // BIL-09: a price changed since it was shown is refused once, with the new amount.
      const usage = (money.usage ??= {});
      const changedTo = usage.amountChangedTo;
      if (changedTo && Number(body?.amount) !== Number(changedTo)) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: refusal('conflict', 'The amount changed.', { amount: changedTo }),
        });
      }
      const item = CATALOGUE.find((each) => each.id === body?.addonId) ?? CATALOGUE[0];
      const amount = `${String(body?.amount ?? 0)}.00`;
      const quantity = Number(body?.quantity ?? 1);
      if (path === '/addons/packs') {
        const left = usage.packsLeft ?? {};
        usage.packsLeft =
          item?.limitKey === 'bandwidth_gb'
            ? { ...left, bandwidth: (left.bandwidth ?? 0) + (item.unitSize ?? 0) * quantity }
            : { ...left, requests: (left.requests ?? 0) + (item?.unitSize ?? 0) * quantity };
        return ok({
          payment: { ...(payment('addon', null, null, amount) as object), status: 'verified' },
          invoice: { id: 'invoice-216', number: 216, amount },
        });
      }
      quoted = {
        key: item?.key ?? '',
        quantity,
        amount,
        renews: (request.postDataJSON() as { renews?: unknown } | null)?.renews !== false,
      };
      return ok({
        payment: payment('addon', null, null, amount),
        addon: { ...item, price: `${String(item?.price ?? 0)}.00`, retiredAt: null },
        quantity,
        expiresAt: new Date(Date.now() + 20 * DAY_MS).toISOString(),
      });
    }
    if (method === 'POST' && path === '/addons/purchase' && quoted) {
      const usage = (money.usage ??= {});
      const bought = quoted;
      if (body?.method === 'wallet') {
        // BIL-02: the payment waits in the operator's queue; the list read after it shows it being checked.
        const item = CATALOGUE.find((each) => each.key === bought.key);
        money.payments = [
          listedPayment({
            id: 'pay_addon_1',
            kind: 'addon',
            state: 'checking',
            amount: bought.amount,
            planId: null,
            billingTermId: null,
            planName: null,
            billingTerm: null,
            method: 'wallet',
            transactionId: String(body.transactionId ?? ''),
            submittedAt: new Date().toISOString(),
            addons: item
              ? [
                  {
                    id: 'pa-1',
                    key: item.key,
                    labelEn: item.labelEn,
                    labelBn: item.labelBn,
                    quantity: bought.quantity,
                    price: bought.amount,
                    status: 'pending',
                  },
                ]
              : [],
          }),
          ...(money.payments ?? drawnPayments()),
        ];
        return ok({
          payment: { ...(payment('addon', null, null, bought.amount) as object) },
          invoice: null,
        });
      }
      usage.owned = [
        ...(usage.owned ?? []),
        {
          key: bought.key,
          quantity: bought.quantity,
          renewal: bought.renews ? 'with_plan' : 'off',
        },
      ];
      return ok({
        payment: { ...(payment('addon', null, null, bought.amount) as object), status: 'verified' },
        invoice: { id: 'invoice-215', number: 215, amount: bought.amount },
      });
    }
    const renewal = /^\/addons\/mine\/p-([^/]+)$/.exec(path);
    if (method === 'PATCH' && renewal) {
      const usage = (money.usage ??= {});
      const renews = (request.postDataJSON() as { renews?: unknown } | null)?.renews === true;
      usage.owned = (usage.owned ?? []).map((each) =>
        each.key === renewal[1] ? { ...each, renewal: renews ? 'with_plan' : 'off' } : each,
      );
      return ok(shopAddonsAnswer(usage));
    }
    if (method === 'PATCH' && path === '/addons/auto-buy') {
      // PLN-15: the usage read after it shows the switch as set.
      const usage = (money.usage ??= {});
      const wanted = (request.postDataJSON() as { bandwidth?: unknown } | null)?.bandwidth;
      if (typeof wanted === 'boolean') usage.autoBuy = { ...usage.autoBuy, bandwidth: wanted };
      return ok([]);
    }
    // Slice 11.7a: a product's own read, and the editor's writes.
    const products = (state.products ??= drawnProducts());
    const one = /^\/products\/([^/]+)$/.exec(path);
    if (method === 'GET' && one && one[1] !== 'new') {
      const product = products.products.find((each) => each.id === one[1]);
      return product
        ? ok(productDetail(product, state.language))
        : route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: refusal('not_found', 'This product was not found.'),
          });
    }
    if (method === 'DELETE' && one) {
      productRemove(products, one[1] ?? '', url.searchParams.get('hard') === 'true');
      return ok({ ok: true });
    }
    const produced = productWrite(
      method,
      path,
      request.postDataJSON() as Record<string, unknown> | null,
      products,
      state.language,
    );
    if (produced && 'refused' in produced) {
      const { status, code, message, details } = produced.refused;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message, details),
      });
    }
    if (produced) return ok(produced.data);
    const written = teamWrite(
      method,
      path,
      request.postDataJSON() as Record<string, unknown> | null,
      team,
    );
    if (written && 'refused' in written) {
      const { status, code, message, details } = written.refused;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message, details),
      });
    }
    if (written) return ok(written.data);
    const saved = settingsWrite(
      method,
      path,
      request.postDataJSON() as Record<string, unknown> | null,
      settings,
    );
    if (saved) return ok(saved.data);
    const keyed = keysWrite(
      method,
      path,
      request.postDataJSON() as Record<string, unknown> | null,
      keys,
    );
    if (keyed && 'refused' in keyed) {
      const { status, code, message, details } = keyed.refused;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message, details),
      });
    }
    if (keyed) return ok(keyed.data);
    const met = metaWrite(
      method,
      path,
      request.postDataJSON() as Record<string, unknown> | null,
      meta,
    );
    if (met && 'refused' in met) {
      const { status, code, message, details } = met.refused;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message, details),
      });
    }
    if (met) return ok(met.data);
    const accounted = accountWrite(
      method,
      path,
      request.postDataJSON() as Record<string, unknown> | null,
      identities,
    );
    if (accounted && 'refused' in accounted) {
      const { status, code, message, details } = accounted.refused;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message, details),
      });
    }
    if (accounted) return ok(accounted.data);
    if (method === 'POST' && path.startsWith('/billing/')) return ok({ ok: true });
    return ok(shopAnswer(path, url, state));
  });
  return log;
}
