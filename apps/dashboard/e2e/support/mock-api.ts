import type { Page, Route } from '@playwright/test';

// The dashboard against a mocked API: each /api/v1 call answered from these fixtures, in the server's own envelope
// ({ success, statusCode, message, data }), so a screen's every state can be shown without a server. The figures
// are the prototype's own shop (docs/brand/lytro-dashboard.html), so a screen can be set beside its drawing.

export type Language = 'bn' | 'en';

export const SLUG = 'megh';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShopState {
  language?: Language;
  /** The tenant's lifecycle state and how far its period end is, in days (negative: in the past). */
  state?: 'trial' | 'pay_as_you_go' | 'active' | 'grace' | 'read_only' | 'locked';
  periodEndDays?: number;
  isOwner?: boolean;
  permissions?: string[];
  /** GET /home's stock part; null when the person may not see stock. */
  stock?: { low: number; out: number } | null;
  /** GET /home's other parts where they differ from the working shop's. */
  home?: Record<string, unknown>;
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

export function me(state: Required<ShopState>): unknown {
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
      suspended: false,
      planName: 'Starter',
      periodEnd: new Date(Date.now() + state.periodEndDays * DAY_MS).toISOString(),
      autoRenewEnabled: false,
      logo: null,
      brand: null,
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

// What the first build's screens read: Balance, for the + menu's Top up, which opens there; and Menu's live lines.
const FIRST_BUILD_READS: Record<string, unknown> = {
  '/balance': { amount: '412.50', frozen: false },
  '/balance/essential-sms': { monthlyUsed: 6, totalUsed: 6, monthlyLimit: 10, totalLimit: null },
  '/balance/current-rates': [],
  '/balance/ledger': { entries: [], nextCursor: null },
  '/billing/invoices': [],
  '/me/identities': { identities: [{ id: 'i-1', kind: 'phone', value: '+8801711234567' }] },
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
  };
}

/** What a signed-in shop's call answers: /me, /home, products and categories from the fixtures, else an empty success. */
export function shopAnswer(path: string, url: URL, state: Required<ShopState>): unknown {
  if (path === '/me') return me(state);
  if (path === '/home') return home(state);
  if (path === '/products') return products(state.language, url.searchParams.get('search') ?? '');
  if (path === '/categories') return categories(state.language);
  return FIRST_BUILD_READS[path] ?? {};
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
 * as the shop does.
 */
export async function mockApi(page: Page, given: ShopState = {}): Promise<void> {
  const state = shopState(given);
  await page.addInitScript(() => {
    sessionStorage.setItem('lytro.tenant.csrf', 'csrf-e2e');
  });
  await startIn(page, state.language);
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(shopAnswer(path, url, state)),
    });
  });
}
