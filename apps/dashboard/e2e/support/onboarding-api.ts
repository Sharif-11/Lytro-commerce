import type { Page, Route } from '@playwright/test';
import { plans, prices, priceOf, STARTER, terms, TWELVE_MONTHS } from './catalogue';
import { envelope, refusal, shopAnswer, shopState, SLUG, startIn, type Language } from './mock-api';

// The sign-in and sign-up steps against a mocked API (TENANT-DASHBOARD-DESIGN §6): a journey that starts signed out
// or part way, remembers what the person did (signed in, created the shop), and answers as the server would at each
// point. The figures are the prototype's own -- Starter at ৳449 a month, ৳4,741 for 12 months -- so a step can be
// set beside its drawing. Once the shop exists, the shop's own calls are answered as the shell's tests answer them.

export { STARTER, TWELVE_MONTHS } from './catalogue';

export interface Journey {
  language?: Language;
  /** Starts signed in (a step after sign-in, opened directly). */
  signedIn?: boolean;
  /** The shop exists already. */
  hasShop?: boolean;
  /** LIF-21: an earlier shop of this account was deleted. */
  hasDeletedShop?: boolean;
  /** /me's shops once signed in with a shop; the prototype's own one by default. */
  shops?: { slug: string; shopName: string; role: 'owner' | 'staff' }[];
  /** Addresses the server says are not free; each answers with `<address>-2`. */
  takenAddresses?: string[];
  /** The verify step's code is wrong. */
  wrongCode?: boolean;
  /** AUTH-30 refuses a new shop. */
  refuseShop?: boolean;
  /** The sign-in providers the server offers. */
  providers?: string[];
}

/** Types a code into the six boxes, from the first (each digit moves to the next box). */
export async function typeCode(page: Page, code: string): Promise<void> {
  await page.getByRole('textbox', { name: /1\/6$/ }).click();
  await page.keyboard.type(code);
}

/** Every call the journey answered, for a test to check what was sent. */
export interface JourneyLog {
  calls: { method: string; path: string; body: unknown }[];
  sent: (method: string, path: string) => unknown;
}

function quote(body: { planId: string; billingTermId: string }): unknown {
  return {
    id: 'payment-1',
    tenantId: 'tenant-1',
    kind: 'purchase',
    planId: body.planId,
    billingTermId: body.billingTermId,
    amount: `${String(priceOf(body.planId, body.billingTermId))}.00`,
    creditAmount: '0.00',
    quotedAt: new Date().toISOString(),
    status: 'quoted',
    senderNumber: null,
    transactionId: null,
    verifiedBy: null,
  };
}

const PRESETS: [string, string, string][] = [
  ['clothing', 'পোশাক', 'Clothing'],
  ['shoes_bags', 'জুতা ও ব্যাগ', 'Shoes and bags'],
  ['cosmetics', 'কসমেটিক্স', 'Cosmetics'],
  ['electronics', 'ইলেকট্রনিক্স', 'Electronics'],
  ['mobiles_gadgets', 'মোবাইল ও গ্যাজেট', 'Mobiles and gadgets'],
  ['grocery', 'মুদি', 'Grocery'],
  ['food_bakery', 'খাবার ও বেকারি', 'Food and bakery'],
  ['books_stationery', 'বই ও স্টেশনারি', 'Books and stationery'],
  ['pharmacy', 'ফার্মেসি', 'Pharmacy'],
  ['home_decor', 'হোম ও ডেকোর', 'Home and décor'],
  ['other', 'অন্যান্য', 'Other'],
];

// The 11 city areas as the seed has them (packages/db), and the zillas the steps use.
const CITIES: [string, string, string][] = [
  ['dhaka', 'Dhaka city', 'ঢাকা সিটি'],
  ['chattogram', 'Chattogram city', 'চট্টগ্রাম সিটি'],
  ['khulna', 'Khulna city', 'খুলনা সিটি'],
  ['rajshahi', 'Rajshahi city', 'রাজশাহী সিটি'],
  ['sylhet', 'Sylhet city', 'সিলেট সিটি'],
  ['barishal', 'Barishal city', 'বরিশাল সিটি'],
  ['rangpur', 'Rangpur city', 'রংপুর সিটি'],
  ['mymensingh', 'Mymensingh city', 'ময়মনসিংহ সিটি'],
  ['gazipur', 'Gazipur city', 'গাজীপুর সিটি'],
  ['narayanganj', 'Narayanganj city', 'নারায়ণগঞ্জ সিটি'],
  ['cumilla', 'Cumilla city', 'কুমিল্লা সিটি'],
];
export const BOGURA = 10;
const ZILLAS: [number, string, string][] = [
  [1, 'Dhaka', 'ঢাকা'],
  [2, 'Gazipur', 'গাজীপুর'],
  [3, 'Narayanganj', 'নারায়ণগঞ্জ'],
  [4, 'Cumilla', 'কুমিল্লা'],
  [5, 'Chattogram', 'চট্টগ্রাম'],
  [BOGURA, 'Bogura', 'বগুড়া'],
];

function locations(): unknown {
  return {
    cities: CITIES.map(([code, nameEn, nameBn]) => ({ code, nameEn, nameBn })),
    zillas: ZILLAS.map(([id, nameEn, nameBn]) => ({ id, nameEn, nameBn, thanas: [] })),
  };
}

/** /me before the shop exists: signed in, no shop, and whether an earlier one was deleted. */
function meWithoutShop(journey: Journey): unknown {
  return {
    subscriber: { id: 'sub-1' },
    isOwner: true,
    permissions: [],
    name: null,
    tenant: null,
    shops: [],
    hasDeletedShop: journey.hasDeletedShop ?? false,
  };
}

/**
 * Answers the journey's calls, in the language it starts in, and returns the log of what was sent. A step after
 * sign-in can be opened directly with `signedIn`; the steps themselves sign in and create the shop as they go.
 */
export async function mockOnboarding(page: Page, journey: Journey = {}): Promise<JourneyLog> {
  const language = journey.language ?? 'bn';
  const shop = shopState({ language, state: 'trial', periodEndDays: 30 });
  let signedIn = journey.signedIn ?? false;
  let hasShop = journey.hasShop ?? false;
  const log: JourneyLog = {
    calls: [],
    sent: (method, path) =>
      log.calls.find((call) => call.method === method && call.path === path)?.body,
  };

  if (signedIn) {
    await page.addInitScript(() => {
      sessionStorage.setItem('lytro.tenant.csrf', 'csrf-e2e');
    });
  }
  await startIn(page, language);

  const signIn = (): unknown => {
    signedIn = true;
    return { next: hasShop ? 'dashboard' : 'create-shop', tenantId: null, csrfToken: 'csrf-e2e' };
  };
  const issued = { expiresInSeconds: 300, resendAfterSeconds: 60 };

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();
    const body: unknown = request.postDataJSON() ?? null;
    log.calls.push({ method, path, body });
    const ok = (data: unknown, status = 200): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: envelope(data, status) });
    const no = (status: number, code: string, message: string, details = {}): Promise<void> =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: refusal(code, message, details),
      });

    if (path === '/me') {
      if (!signedIn) return no(401, 'unauthenticated', 'Sign in to continue.');
      if (!hasShop) return ok(meWithoutShop(journey));
      const answer = shopAnswer(path, url, shop) as Record<string, unknown>;
      return ok(journey.shops ? { ...answer, shops: journey.shops } : answer);
    }
    if (path === '/auth/providers')
      return ok({ providers: journey.providers ?? ['google', 'facebook'] });
    if (path === '/auth/phone/code' || path === '/auth/forgot-password') return ok(issued);
    if (path === '/auth/phone/verify' || path === '/auth/forgot-password/verify') {
      if (journey.wrongCode) {
        return no(
          400,
          'validation_error',
          language === 'bn' ? 'ভুল কোড। আর 2 বার চেষ্টা করা যাবে।' : 'Wrong code. 2 tries left.',
        );
      }
      return ok(signIn());
    }
    if (path === '/auth/signin') return ok(signIn());
    if (path === '/auth/staff/signin') {
      signedIn = true;
      hasShop = true;
      return ok({ next: 'set-password', tenantId: 'tenant-1', csrfToken: 'csrf-e2e' });
    }
    if (path === '/auth/password' || path === '/auth/staff/password') return ok({ ok: true });
    if (path === '/shops/address-check') {
      const address = url.searchParams.get('address') ?? '';
      const taken = journey.takenAddresses?.includes(address) ?? false;
      return ok(
        taken
          ? { available: false, address: null, reason: 'unavailable', suggestion: `${address}-2` }
          : { available: true, address, reason: null, suggestion: null },
      );
    }
    if (path === '/shops' && method === 'POST') {
      if (journey.refuseShop) {
        return no(429, 'rate_limited', 'A shop was already opened from here recently.');
      }
      hasShop = true;
      return ok(
        {
          tenantId: 'tenant-1',
          address: SLUG,
          shopUrl: `https://${SLUG}.lytro.app`,
          next: 'set-password',
        },
        201,
      );
    }
    if (path === '/plans') return ok(plans());
    if (path === '/billing-terms') return ok(terms());
    const priced = /^\/plans\/([^/]+)\/prices$/.exec(path);
    if (priced) return ok(prices(priced[1] ?? ''));
    if (path === '/platform-wallets') {
      return ok([
        {
          id: 'w-1',
          provider: 'bKash',
          number: '01700000000',
          label: language === 'bn' ? 'মার্চেন্ট' : 'Merchant',
        },
      ]);
    }
    if (path === '/billing/quote')
      return ok(quote(body as { planId: string; billingTermId: string }));
    if (path === '/billing/purchase')
      return ok({
        ...(quote({ planId: STARTER, billingTermId: TWELVE_MONTHS }) as object),
        status: 'submitted',
      });
    if (path === '/presets')
      return ok(
        PRESETS.map(([key, labelBn, labelEn]) => ({ key, labelBn, labelEn, defaults: {} })),
      );
    if (path === '/locations') return ok(locations());
    if (path === '/business-type' || path === '/delivery-zones/home-area') return ok({});
    return ok(shopAnswer(path, url, shop));
  });
  return log;
}
