import type { Page, Route } from '@playwright/test';
import {
  drawnAddons,
  drawnAttributes,
  drawnCatalogueAddons,
  drawnChanges,
  drawnCredentialUses,
  drawnLytroPhones,
  drawnOptionSets,
  drawnPayments,
  drawnPlans,
  drawnPlanVersions,
  drawnPresets,
  drawnPrices,
  drawnRateHistory,
  drawnRates,
  drawnReceipts,
  drawnReports,
  drawnSettings,
  drawnShopPhones,
  drawnShops,
  drawnTerms,
  drawnUnread,
  drawnPaymentMethods,
  drawnWallets,
  NOW,
  shopDetail,
  type DeviceFixture,
  type PaymentFixture,
  type ReportFixture,
  type ShopFixture,
} from './console-data';
import { courierAnswer, courierDefaults, type CourierMockState } from './courier-mock';
import { noticeAnswer, noticeDefaults, type NoticeMockState } from './notice-mock';
import { shopAnswer, shopListAnswer } from './p88-shops-mock';
import {
  answerUploads,
  moneyAnswer,
  moneyDefaults,
  OPERATOR_ID,
  withShots,
  type MoneyMockState,
} from './p88-money-mock';
import { recordsAnswer, recordsDefaults, type RecordsMockState } from './p88-records-mock';
import { pricingAnswer, type PricingState } from './pricing-mock';

// The console against a mocked API: each /api/v1 call answered in the server's own envelope ({ success, statusCode,
// message, data }), so a screen's every state can be shown without a server. The sign-in follows the server's rule
// (ADM-01): five failures in fifteen minutes lock the account, wrong passwords and codes counted together.

export type Language = 'en' | 'bn';

export const EMAIL = 'ops@lytro.app';
export const PASSWORD = 'the-right-password';
export const CODE = '481902';
export const BACKUP_CODE = 'k7f29ahq3d';
export const SECRET = 'JBSWY3DPEHPK3PXP7KQ2JBSWY3DPEHPK';
export const WINDOW_SECONDS = 900;

export const DRAWN_CODES = [
  'k7f2-9ahq',
  'm3xd-21pv',
  'q8rt-5zkc',
  'w1ne-7bhs',
  'a9lm-3tgf',
  'z4cv-8qwe',
  'p6ds-0yuj',
  'h2bn-6rkx',
  'v5tg-4mlo',
  'c0ws-1ezi',
];

export const CHROME_ON_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export interface ConsoleState
  extends
    Partial<PricingState>,
    Partial<CourierMockState>,
    Partial<NoticeMockState>,
    Partial<MoneyMockState>,
    Partial<RecordsMockState> {
  language?: Language;
  /** Whether the browser starts signed in. */
  signedIn?: boolean;
  /** Whether the account has confirmed its authenticator; otherwise a first sign-in enrols. */
  enrolled?: boolean;
  /** How many tries have already failed in the window. */
  failures?: number;
  /** What's waiting: this many of the sketch's payments and open reports, if not all it draws. */
  queue?: number;
  reports?: number;
  payments?: PaymentFixture[];
  reportList?: ReportFixture[];
  shops?: ShopFixture[];
  lytroPhones?: DeviceFixture[];
  shopPhones?: DeviceFixture[];
  receipts?: Record<string, unknown>[];
  unread?: { day: string; shape: string; count: number }[];
  changes?: Record<string, unknown>[];
  credentialUses?: Record<string, unknown>[];
  addons?: Record<string, unknown>;
  /** These reads answer with this status: a server that isn't answering. */
  failing?: Partial<Record<string, number>>;
  /** Its next write of this path is refused, as the server would. */
  refuseWrite?: { path: string; status: number; code: string; message: string } | null;
  /** A test driving the clock itself; otherwise the page sits at the moment the sketch is drawn. */
  ownClock?: boolean;
  /** The moment the page sits at, when it isn't NOW: Phase 7's screens are drawn on 7 Nov. */
  now?: string;
  /** GET /auth/operator/me. */
  unusedBackupCodes?: number;
  userAgent?: string | null;
  /** The reads of who is signed in fail with this status, until a test says otherwise. */
  meFails?: number | null;
  /** Every read refuses with a 401, as an expired session does. */
  expired?: boolean;
  /** Who is signed in isn't answered until this settles. */
  holdMe?: Promise<void>;
  /** How many pairing codes have been asked for. */
  pairingCodes?: number;
}

export interface ApiLog {
  calls: { method: string; path: string; query: string; body: unknown; language: string | null }[];
  sent: (method: string, path: string) => unknown;
  state: Required<ConsoleState>;
}

function envelope(data: unknown): string {
  return JSON.stringify({ success: true, statusCode: 200, message: 'OK', data });
}

function refusal(code: string, message: string, details: Record<string, unknown> = {}): string {
  return JSON.stringify({ success: false, statusCode: 0, message, errors: { code, details } });
}

function words(language: string | null): {
  wrongPair: string;
  wrongCode: (left: number) => string;
  locked: string;
  codeIncorrect: string;
} {
  if (language === 'bn') {
    return {
      wrongPair: 'ইমেইল বা পাসওয়ার্ড মেলেনি।',
      wrongCode: (left) =>
        left === 0
          ? 'কোড মেলেনি। ১৫ মিনিট পর আবার ট্রাই করুন।'
          : `কোড মেলেনি। ১৫ মিনিট অপেক্ষার আগে আর ${String(left)} বার ট্রাই করা যাবে।`,
      locked: 'অনেকবার লগইন করতে ব্যর্থ হয়েছে। আবার চেষ্টা করার আগে অপেক্ষা করুন।',
      codeIncorrect: 'কোড ঠিক নয়।',
    };
  }
  return {
    wrongPair: "That email or password isn't right.",
    wrongCode: (left) =>
      left === 0
        ? 'That code did not match. Wait 15 minutes before trying again.'
        : `That code did not match. ${String(left)} ${left === 1 ? 'attempt' : 'attempts'} left before a 15-minute wait.`,
    locked: 'Too many failed sign-ins. Wait before trying again.',
    codeIncorrect: "That code isn't right.",
  };
}

const FAILURES_ALLOWED = 5;

/** What the sign-in routes answer, the rule included; undefined for any other route. */
function authAnswer(
  path: string,
  body: Record<string, unknown> | null,
  state: Required<ConsoleState>,
  language: string | null,
): { status: number; body: string; headers?: Record<string, string> } | undefined {
  const isCode =
    path === '/auth/operator/verify' ||
    path === '/auth/operator/enroll' ||
    path === '/auth/operator/backup-codes/regenerate';
  if (!isCode && path !== '/auth/operator/signin') return undefined;
  const said = words(language);
  if (state.failures >= FAILURES_ALLOWED) {
    return {
      status: 429,
      headers: { 'Retry-After': String(WINDOW_SECONDS) },
      body: refusal('rate_limited', said.locked),
    };
  }
  const regenerating = path === '/auth/operator/backup-codes/regenerate';
  if (body?.password !== PASSWORD || (!regenerating && body.email !== EMAIL)) {
    state.failures += 1;
    return { status: 401, body: refusal('unauthenticated', said.wrongPair) };
  }
  if (path === '/auth/operator/signin') {
    return {
      status: 200,
      body: envelope(
        state.enrolled
          ? { next: 'verify-2fa' }
          : {
              next: 'enroll-2fa',
              secret: SECRET,
              uri: `otpauth://totp/Lytronix:${EMAIL}?secret=${SECRET}&issuer=Lytronix`,
            },
      ),
    };
  }
  if (body.code !== CODE && (path === '/auth/operator/enroll' || body.code !== BACKUP_CODE)) {
    state.failures += 1;
    if (path === '/auth/operator/enroll') {
      return {
        status: 422,
        body: refusal('validation_error', said.codeIncorrect, {
          fields: [{ field: 'code', problem: 'incorrect', message: said.codeIncorrect }],
        }),
      };
    }
    const attemptsLeft = FAILURES_ALLOWED - state.failures;
    return {
      status: 401,
      body: refusal('unauthenticated', said.wrongCode(attemptsLeft), { attemptsLeft }),
    };
  }
  if (path === '/auth/operator/verify') {
    state.signedIn = true;
    return { status: 200, body: envelope({ csrfToken: 'csrf-e2e' }) };
  }
  if (path === '/auth/operator/enroll') {
    state.signedIn = true;
    state.enrolled = true;
    return { status: 200, body: envelope({ csrfToken: 'csrf-e2e', backupCodes: DRAWN_CODES }) };
  }
  state.unusedBackupCodes = DRAWN_CODES.length;
  return { status: 200, body: envelope({ backupCodes: DRAWN_CODES }) };
}

/** This many of the sketch's payments, repeated with new ids past the ones it draws. */
export function paymentsOf(count: number): PaymentFixture[] {
  const drawn = drawnPayments();
  return Array.from({ length: count }, (_, index) => {
    const each = drawn[index % drawn.length] as PaymentFixture;
    return index < drawn.length ? each : { ...each, id: `pay-${String(index)}` };
  });
}

/** This many open reports, repeated past the ones it draws. */
export function openReportsOf(count: number): ReportFixture[] {
  const drawn = drawnReports().filter((each) => each.status === 'open');
  return Array.from({ length: count }, (_, index) => {
    const each = drawn[index % drawn.length] as ReportFixture;
    return index < drawn.length ? each : { ...each, id: `rep-${String(100 + index)}` };
  });
}

function pageOf(items: unknown[], url: URL, name: string): Record<string, unknown> {
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 20);
  return {
    [name]: items.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: items.length,
    pages: Math.max(Math.ceil(items.length / limit), 1),
  };
}

type Answer = { data: unknown } | { refused: [number, string, string, Record<string, unknown>?] };

/** What the rebuilt screens read and write, the writes changing what later reads say, as the server's do. */
function consoleAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  state: Required<ConsoleState>,
): Answer | undefined {
  const failing = state.failing[path];
  if (failing !== undefined) return { refused: [failing, 'service_unavailable', ''] };
  const refuse = state.refuseWrite;
  if (method !== 'GET' && refuse?.path === path) {
    state.refuseWrite = null;
    return { refused: [refuse.status, refuse.code, refuse.message] };
  }
  if (path === '/operator/recent-changes') return { data: state.changes };
  if (path === '/operator/payment-queue') return { data: state.payments };
  const queued = /^\/operator\/payment-queue\/([^/]+)\/(approve|credit|reject)$/.exec(path);
  if (queued) {
    state.payments = state.payments.filter((each) => each.id !== queued[1]);
    return { data: { id: queued[1], status: queued[2] === 'reject' ? 'rejected' : 'verified' } };
  }
  if (path === '/operator/payment-page-reports') {
    const wanted = url.searchParams.get('status') ?? 'open';
    return { data: { reports: state.reportList.filter((each) => each.status === wanted) } };
  }
  const dismissed = /^\/operator\/payment-page-reports\/([^/]+)\/dismiss$/.exec(path);
  if (dismissed) {
    state.reportList = state.reportList.map((each) =>
      each.id === dismissed[1] ? { ...each, status: 'dismissed', handledAt: NOW } : each,
    );
    return { data: { ok: true } };
  }
  if (path === '/operator/lytro-listener/devices') {
    return {
      data: {
        devices: state.lytroPhones,
        active: state.lytroPhones.filter((each) => each.status === 'active').length,
        limit: null,
      },
    };
  }
  if (path === '/operator/lytro-listener/pairing-codes') {
    state.pairingCodes += 1;
    return {
      data: {
        code: `K7F2M9Q${String(state.pairingCodes)}`,
        expiresAt: '2026-10-21T14:40:00+06:00',
      },
    };
  }
  if (path === '/operator/lytro-listener/receipts') {
    const status = url.searchParams.get('status');
    const word = url.searchParams.get('q');
    const matching = state.receipts.filter(
      (each) =>
        (!status || each.status === status) &&
        (!word ||
          JSON.stringify([each.transactionId, each.senderNumber, each.amount]).includes(word)),
    );
    return { data: pageOf(matching, url, 'receipts') };
  }
  if (path === '/operator/listener-unread') return { data: { shapes: state.unread } };
  if (path === '/operator/listener-installations/block') {
    const before = [...state.lytroPhones, ...state.shopPhones];
    const hit = before.filter((each) => each.installationId === body?.installationId);
    for (const each of hit) each.status = 'revoked';
    return { data: { revoked: hit.length } };
  }
  const revoked = /^\/operator\/listener-devices\/([^/]+)\/revoke$/.exec(path);
  if (revoked) {
    for (const each of [...state.lytroPhones, ...state.shopPhones]) {
      if (each.id === revoked[1]) each.status = 'revoked';
    }
    return { data: { ok: true } };
  }
  const assigned = /^\/operator\/plans\/([^/]+)\/assign$/.exec(path);
  if (assigned) return { data: { id: 'assign-1', planId: assigned[1] } };
  const recorded = recordsAnswer(path, url, state);
  if (recorded) return recorded;
  const couriered = courierAnswer(method, path, url, body, state);
  if (couriered) return couriered;
  const noticed = noticeAnswer(method, path, url, body, state);
  if (noticed) return noticed;
  const money = moneyAnswer(method, path, url, body, state);
  if (money) return money;
  const priced = pricingAnswer(method, path, body, state);
  if (priced) return priced;
  if (path === '/operator/tenants') return shopListAnswer(url, state.shops);
  const shopped = /^\/operator\/tenants\/([^/]+)(?:\/(.+))?$/.exec(path);
  if (!shopped) return undefined;
  const shop = state.shops.find((each) => each.id === shopped[1]);
  if (!shop) return { refused: [404, 'not_found', 'This shop was not found.'] };
  const rest = shopped[2];
  if (rest === undefined) return { data: shopDetail(shop) };
  const p88 = shopAnswer(rest, url, body, shop, state.courierUses, state.now);
  if (p88) return p88;
  if (rest === 'addons') return { data: state.addons };
  if (rest === 'listener-devices') {
    return {
      data: {
        devices: state.shopPhones,
        active: state.shopPhones.filter((each) => each.status === 'active').length,
        limit: 1,
      },
    };
  }
  if (rest === 'gateway-credential-uses')
    return { data: pageOf(state.credentialUses, url, 'uses') };
  if (rest === 'courier-credential-uses') return { data: pageOf(state.courierUses, url, 'uses') };
  if (rest === 'suspend') {
    shop.suspension = { at: NOW, reason: String(body?.reason), by: EMAIL };
    return { data: { ok: true } };
  }
  if (rest === 'restore') {
    shop.suspension = null;
    return { data: { ok: true } };
  }
  if (rest === 'balance-adjust') {
    return {
      data: {
        id: 1,
        type: 'adjustment',
        amount: String(body?.amount),
        balanceAfter: '1350.00',
        createdAt: NOW,
      },
    };
  }
  if (rest === 'payment-page/suspend') {
    shop.paymentPageSuspension = { at: NOW, reason: String(body?.reason) };
    state.reportList = state.reportList.map((each) =>
      each.shop.id === shop.id
        ? {
            ...each,
            status: each.status === 'open' ? 'actioned' : each.status,
            handledAt: each.status === 'open' ? NOW : each.handledAt,
            shop: { ...each.shop, paymentPageSuspended: true },
          }
        : each,
    );
    return { data: { ok: true } };
  }
  if (rest === 'payment-page/restore') {
    shop.paymentPageSuspension = null;
    return { data: { ok: true } };
  }
  if (rest === 'new-shop-cap') {
    const capped = body?.capped as boolean | null;
    shop.newShopCap = { set: capped, holds: capped ?? shop.state === 'pay_as_you_go' };
    return { data: { ok: true } };
  }
  if (rest === 'limit-overrides') {
    if (method === 'GET') return { data: shop.overrides };
    const set = {
      id: `o-${String(body?.limitKey)}`,
      tenantId: shop.id,
      limitKey: body?.limitKey,
      value: body?.value,
      reason: body?.reason,
      setBy: 'op-1',
      setByEmail: EMAIL,
      setAt: NOW,
    };
    shop.overrides = [...shop.overrides.filter((each) => each.limitKey !== body?.limitKey), set];
    return { data: set };
  }
  const override = /^limit-overrides\/(.+)$/.exec(rest);
  if (override) {
    shop.overrides = shop.overrides.filter((each) => each.limitKey !== override[1]);
    return { data: { ok: true } };
  }
  return undefined;
}

/** Sets the browser's language on the first load only, so a switch the test makes survives a reload (I18N-02). */
export async function startIn(page: Page, language: Language): Promise<void> {
  await page.addInitScript((each: string) => {
    if (localStorage.getItem('lytro.operator.language') === null)
      localStorage.setItem('lytro.operator.language', each);
  }, language);
}

/** Answers every /api/v1 call as the server does, and signs the browser in unless a test says otherwise. */
export async function mockApi(page: Page, given: ConsoleState = {}): Promise<ApiLog> {
  const state: Required<ConsoleState> = {
    language: 'en',
    signedIn: true,
    enrolled: true,
    failures: 0,
    queue: 0,
    reports: 0,
    payments: given.queue === undefined ? drawnPayments() : paymentsOf(given.queue),
    reportList:
      given.reports === undefined
        ? drawnReports()
        : [
            ...openReportsOf(given.reports),
            ...drawnReports().filter((each) => each.status !== 'open'),
          ],
    shops: drawnShops(),
    lytroPhones: drawnLytroPhones(),
    shopPhones: drawnShopPhones(),
    receipts: drawnReceipts(),
    unread: drawnUnread(),
    changes: drawnChanges(),
    credentialUses: drawnCredentialUses(),
    addons: drawnAddons(),
    plans: drawnPlans(),
    planVersions: drawnPlanVersions(),
    terms: drawnTerms(),
    prices: drawnPrices(),
    rates: drawnRates(),
    rateHistory: drawnRateHistory(),
    settings: drawnSettings(),
    wallets: drawnWallets(),
    paymentMethods: drawnPaymentMethods(),
    gatewayTest: { ok: true, code: null },
    catalogueAddons: drawnCatalogueAddons(),
    presets: drawnPresets(),
    attributes: drawnAttributes(),
    optionSets: drawnOptionSets(),
    ...courierDefaults(),
    ...noticeDefaults(),
    ...moneyDefaults(),
    ...recordsDefaults(),
    now: NOW,
    failing: {},
    refuseWrite: null,
    ownClock: false,
    pairingCodes: 0,
    unusedBackupCodes: 7,
    userAgent: CHROME_ON_WINDOWS,
    meFails: null,
    expired: false,
    holdMe: Promise.resolve(),
    ...given,
  };
  // The courier routes change what they hold; a test's own copy keeps one test's changes out of the next.
  state.couriers = structuredClone(state.couriers);
  state.blocking = structuredClone(state.blocking);
  state.areas = structuredClone(state.areas);
  state.areaCounts = { ...state.areaCounts };
  state.notices = structuredClone(state.notices);
  state.rateHistory = structuredClone(state.rateHistory);
  state.manualEntries = structuredClone(state.manualEntries);
  state.walletTypes = structuredClone(state.walletTypes);
  state.payments = withShots(state.payments);
  const log: ApiLog = {
    calls: [],
    state,
    sent: (method, path) =>
      [...log.calls].reverse().find((call) => call.method === method && call.path === path)?.body,
  };
  if (state.signedIn) {
    await page.addInitScript(() => {
      sessionStorage.setItem('lytro.operator.csrf', 'csrf-e2e');
    });
  }
  await startIn(page, state.language);
  await answerUploads(page);
  if (!state.ownClock) await page.clock.setFixedTime(state.now);
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();
    const body = (request.postDataJSON() ?? null) as Record<string, unknown> | null;
    const headers = await request.allHeaders();
    const language = headers['accept-language'] ?? null;
    log.calls.push({ method, path, query: url.search, body, language });
    const ok = (data: unknown): Promise<void> =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) });
    const refused = (
      status: number,
      code: string,
      message: string,
      details: Record<string, unknown> = {},
    ): Promise<void> =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message, details),
      });

    const auth = authAnswer(path, body, state, language);
    if (auth) {
      return route.fulfill({
        status: auth.status,
        contentType: 'application/json',
        body: auth.body,
        headers: auth.headers,
      });
    }
    if (path === '/auth/operator/signout') {
      state.signedIn = false;
      return ok({ ok: true });
    }
    if (state.expired) return refused(401, 'unauthenticated', 'Sign in to continue.');
    if (path === '/auth/operator/me') {
      await state.holdMe;
      if (state.meFails !== null) return refused(state.meFails, 'service_unavailable', '');
      return ok({
        id: OPERATOR_ID,
        email: EMAIL,
        unusedBackupCodes: state.unusedBackupCodes,
        signedInAt: '2026-10-21T03:12:00.000Z',
        userAgent: state.userAgent,
      });
    }
    const answer = consoleAnswer(method, path, url, body, state);
    if (answer && 'refused' in answer) {
      const [status, code, message, details] = answer.refused;
      return refused(status, code, message, details);
    }
    if (answer) return ok(answer.data);
    return ok([]);
  });
  return log;
}
