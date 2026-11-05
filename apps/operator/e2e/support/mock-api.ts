import type { Page, Route } from '@playwright/test';

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

export interface ConsoleState {
  language?: Language;
  /** Whether the browser starts signed in. */
  signedIn?: boolean;
  /** Whether the account has confirmed its authenticator; otherwise a first sign-in enrols. */
  enrolled?: boolean;
  /** How many tries have already failed in the window. */
  failures?: number;
  /** What's waiting: the payment queue's rows and the open page reports. */
  queue?: number;
  reports?: number;
  /** GET /auth/operator/me. */
  unusedBackupCodes?: number;
  userAgent?: string | null;
  /** The reads of who is signed in fail with this status, until a test says otherwise. */
  meFails?: number | null;
  /** Every read refuses with a 401, as an expired session does. */
  expired?: boolean;
  /** Who is signed in isn't answered until this settles. */
  holdMe?: Promise<void>;
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

/** The rows the frame's count reads; the screens that show them are rebuilt in the next parts. */
function queueRows(count: number): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `pay-${String(index)}`,
    tenantId: `tenant-${String(index)}`,
    kind: 'renewal',
    amount: '449.00',
    status: 'pending',
    shopName: `Shop ${String(index)}`,
    shopSlug: `shop-${String(index)}`,
    wallet: null,
    createdAt: '2026-11-04T08:00:00.000Z',
  }));
}

function reportRows(count: number): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `report-${String(index)}`,
    reason: 'scam',
    createdAt: '2026-11-04T08:00:00.000Z',
  }));
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
    queue: 3,
    reports: 2,
    unusedBackupCodes: 7,
    userAgent: CHROME_ON_WINDOWS,
    meFails: null,
    expired: false,
    holdMe: Promise.resolve(),
    ...given,
  };
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
    const refused = (status: number, code: string, message: string): Promise<void> =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message),
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
        email: EMAIL,
        unusedBackupCodes: state.unusedBackupCodes,
        signedInAt: '2026-10-21T03:12:00.000Z',
        userAgent: state.userAgent,
      });
    }
    if (path === '/operator/payment-queue') return ok(queueRows(state.queue));
    if (path === '/operator/payment-page-reports')
      return ok({ reports: reportRows(state.reports) });
    if (path === '/operator/tenants') {
      return ok({ entries: [], nextCursor: null });
    }
    return ok([]);
  });
  return log;
}
