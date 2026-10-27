import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type Page } from '@playwright/test';
import { GROWTH, PRO, STARTER } from './support/catalogue';
import {
  AWAITING_RENEWAL,
  CHECKING_TOP_UP,
  drawnPayments,
  EXPIRED_RENEWAL,
  PAID_RENEWAL,
  payment,
  rejectedRenewal,
  type PaymentFixture,
} from './support/payments';
import { DAY_ONE, mockApi, SLUG, type Language, type ShopState } from './support/mock-api';
import { mockOnboarding, TWELVE_MONTHS, typeCode, type Journey } from './support/onboarding-api';
import type { AddonsFixture, UsageFixture } from './support/usage';

// TENANT-DASHBOARD-DESIGN §11: each built screen beside the prototype's drawing of it, at the prototype's own frame
// sizes, saved to test-results/compare for the pull request and CI's artifacts. No pixel baseline is committed: a
// font renders a little differently on Windows and Linux, so the pictures are for a person to compare.
const PROTOTYPE = pathToFileURL(
  resolve(import.meta.dirname, '../../../docs/brand/lytro-dashboard.html'),
).href;

type Device = 'phone' | 'tablet' | 'desktop';

// The area the prototype's frame gives its shell: the frame less its border, and the phone's status bar or the
// desktop's address bar (the tablet frame has neither).
const AREA: Record<Device, { width: number; height: number }> = {
  phone: { width: 374, height: 784 },
  tablet: { width: 804, height: 984 },
  desktop: { width: 1280, height: 778 },
};

interface Pair {
  name: string;
  screen: string;
  device: Device;
  language: Language;
  path: string;
  /** What to do in the app once the page shows, before the picture (opening the + menu). */
  then?: (page: Page) => Promise<void>;
  /** A step outside a shop: the journey to mock, and `path` is the whole path. */
  journey?: Journey;
  /** What the guest brought from the website (the sign-up intent the sign-in page keeps). */
  intent?: { shop?: string; planId?: string; termId?: string };
  /** What to do in the prototype before its picture. */
  draw?: (page: Page) => Promise<void>;
  /** The prototype's shop state and the mocked shop drawn the same (a day-one shop); the working shop if left out. */
  shop?: { drawn: string; state: ShopState };
  /** The mocked shop where the prototype draws the state on its own screen (a locked shop's Renew page). */
  state?: ShopState;
}

const NEW_SHOP = { drawn: 'new', state: DAY_ONE };

/**
 * The prototype's checkout as drawn before Phase 5's hosted page (its first `ob-checkout`, which a later part of the
 * file replaces): the wallet step the dashboard keeps until then (TENANT-DASHBOARD-DESIGN §7.19).
 */
async function drawWalletCheckout(page: Page): Promise<void> {
  await page.evaluate(() => {
    const source = [...document.scripts].map((script) => script.textContent).join('\n');
    const line = source
      .split('\n')
      .find((each) => each.startsWith("SCREENS['ob-checkout'] =") && each.includes('coTrx'));
    if (line) (0, eval)(line);
  });
}

const PAIRS: Pair[] = [
  { name: 'home', screen: 'home', device: 'phone', language: 'bn', path: '' },
  { name: 'home', screen: 'home', device: 'tablet', language: 'bn', path: '' },
  { name: 'home', screen: 'home', device: 'desktop', language: 'en', path: '' },
  {
    name: 'home-day-one',
    screen: 'home',
    device: 'phone',
    language: 'bn',
    path: '',
    shop: NEW_SHOP,
  },
  {
    name: 'home-day-one',
    screen: 'home',
    device: 'desktop',
    language: 'bn',
    path: '',
    shop: NEW_SHOP,
  },
  { name: 'orders', screen: 'orders-soon', device: 'phone', language: 'bn', path: '/orders' },
  { name: 'orders', screen: 'orders-soon', device: 'tablet', language: 'bn', path: '/orders' },
  { name: 'orders', screen: 'orders-soon', device: 'desktop', language: 'en', path: '/orders' },
  {
    name: 'search',
    screen: 'search-products',
    device: 'phone',
    language: 'bn',
    path: `/search?q=${encodeURIComponent('জ্যাকেট')}`,
  },
  {
    name: 'plus',
    screen: 'plus',
    device: 'phone',
    language: 'bn',
    path: '/orders',
    then: async (page) => {
      await page.getByRole('button', { name: 'নতুন' }).click();
    },
  },
  { name: 'shop-chrome', screen: 'products', device: 'desktop', language: 'bn', path: '/products' },
];

const click = (name: string | RegExp) => async (page: Page) => {
  await page.getByRole('button', { name }).click();
  await page.waitForTimeout(300);
};
const GROWTH_SHOP: ShopState = {
  money: {
    plan: GROWTH,
    over: [
      { key: 'products', used: 340, limit: 100 },
      { key: 'staff', used: 4, limit: 2 },
    ],
  },
};
const PAYG_SHOP: ShopState = { state: 'pay_as_you_go' };

// TENANT-DASHBOARD-DESIGN §7.12 and §7.20, Slice 11.5b: Plan with its sheets and banners, the pay-as-you-go page, and
// the two pages without a shell, each in the state the prototype draws.
const MONEY: Pair[] = [
  { name: 'plan', screen: 'plan', device: 'phone', language: 'bn', path: '/plan' },
  { name: 'plan', screen: 'plan', device: 'tablet', language: 'bn', path: '/plan' },
  { name: 'plan', screen: 'plan', device: 'desktop', language: 'en', path: '/plan' },
  {
    name: 'plan-trial',
    screen: 'plan',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    shop: NEW_SHOP,
  },
  {
    name: 'paysheet',
    screen: 'paysheet',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    then: click('৳449 দিয়ে রিনিউ করুন'),
  },
  {
    name: 'upgrade',
    screen: 'upgrade',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    then: click('আপগ্রেড · ৳400 দিতে হবে'),
  },
  {
    name: 'upgrade-amount-changed',
    screen: 'upgrade-amount-changed',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: { money: { amountChangedTo: '415.00' } },
    then: async (page) => {
      await click('আপগ্রেড · ৳400 দিতে হবে')(page);
      await click('ব্যালেন্স থেকে ৳400 দিন')(page);
    },
  },
  {
    name: 'downgrade',
    screen: 'downgrade',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: GROWTH_SHOP,
    then: click('মেয়াদ শেষে নামুন'),
  },
  {
    name: 'stop',
    screen: 'sh-cancel',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    then: async (page) => {
      await page.getByText('সাবস্ক্রিপশন বন্ধ করতে চান?').click();
      await click('মেয়াদ শেষে ক্যানসেল')(page);
    },
  },
  {
    name: 'plan-cancelled',
    screen: 'plan-cancelled',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: { money: { cancelled: true } },
  },
  {
    name: 'plan-downgrade-scheduled',
    screen: 'plan-downgrade-scheduled',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: {
      money: {
        plan: GROWTH,
        scheduled: { kind: 'downgrade', targetPlanId: STARTER },
        over: [
          { key: 'products', used: 340, limit: 100 },
          { key: 'storage_mb', used: 2970, limit: 2048 },
        ],
      },
    },
  },
  {
    name: 'payg-switch',
    screen: 'sh-payg-switch',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    then: click('মেয়াদ শেষে বদলান'),
  },
  {
    name: 'downgrade-checklist',
    screen: 'downgrade-checklist',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: {
      money: {
        checklist: {
          downgradedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
          finalWarningAt: null,
          items: [
            { key: 'products', used: 340, limit: 100, fixed: false },
            { key: 'storage_mb', used: 2662, limit: 2048, fixed: false },
            { key: 'staff', used: 2, limit: 2, fixed: true },
          ],
        },
      },
    },
  },
  {
    name: 'plan-payg',
    screen: 'plan-payg',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: PAYG_SHOP,
  },
  {
    name: 'plan-payg',
    screen: 'plan-payg',
    device: 'desktop',
    language: 'en',
    path: '/plan',
    state: PAYG_SHOP,
  },
  {
    name: 'close-shop',
    screen: 'sh-close-shop',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: PAYG_SHOP,
    then: async (page) => {
      await page.getByText('দোকান বন্ধ করা').click();
      await click('দোকান বন্ধ করুন')(page);
    },
  },
  {
    name: 'renew',
    screen: 'renew',
    device: 'phone',
    language: 'bn',
    path: '/renew',
    state: { state: 'locked', periodEndDays: -9 },
  },
  {
    name: 'renew-archived',
    screen: 'renew-archived',
    device: 'phone',
    language: 'bn',
    path: '/renew',
    state: { state: 'archived', periodEndDays: -20, money: { deletesInDays: 40 } },
  },
  {
    name: 'renew-archived',
    screen: 'renew-archived',
    device: 'phone',
    language: 'en',
    path: '/renew',
    state: { state: 'archived', periodEndDays: -20, money: { deletesInDays: 40 } },
  },
  {
    name: 'unavailable',
    screen: 'unavailable',
    device: 'phone',
    language: 'bn',
    path: '',
    state: { money: { suspended: true } },
  },
  ...balanceAndBilling(),
  ...usagePairs(),
  ...addonPairs(),
];

/** Usage (§7.24, Slice 11.5c), each of the prototype's Part 10 states, its owner told by email. */
function usagePairs(): Pair[] {
  const one = (
    screen: string,
    usage: UsageFixture,
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({
    name: screen,
    screen,
    device,
    language,
    path: '/usage',
    state: { money: { hasEmail: true, usage } },
  });
  const quiet = { products: 70 };
  return [
    one('usage', {}),
    one('usage', {}, 'tablet'),
    one('usage', {}, 'desktop', 'en'),
    one('usage-80', { used: { ...quiet, bandwidth: 24 }, runsOutDays: { bandwidth: 5 } }),
    one('usage-warning', { used: { ...quiet, bandwidth: 28.5 }, runsOutDays: { bandwidth: 1 } }),
    one(
      'usage-warning',
      { used: { ...quiet, bandwidth: 28.5 }, runsOutDays: { bandwidth: 1 } },
      'desktop',
      'en',
    ),
    one('usage-100', { used: { ...quiet, bandwidth: 31 } }),
    one('usage-stopped', { used: { ...quiet, bandwidth: 33 } }),
    one('usage-requests-95', {
      used: { ...quiet, requests: 190_000 },
      runsOutDays: { requests: 1 },
    }),
    one('usage-seats-full', { used: { ...quiet, seats: 2 } }),
    one('usage-storage-full', { used: { ...quiet, storage: 2 } }),
    one('usage-sms-used', { used: { ...quiet, essential_sms_monthly: 10 } }),
    one('usage-autobuy-failed', {
      used: { ...quiet, bandwidth: 30.4 },
      autoBuy: { bandwidth: true, failed: true },
    }),
    one('usage-autobuy-capped', {
      used: { ...quiet, bandwidth: 57 },
      limits: { bandwidth: 60 },
      runsOutDays: { bandwidth: 1 },
      autoBuy: { bandwidth: true, packs: 3 },
    }),
  ];
}

/** Add-ons (§7.25, Slice 11.5c), each state the prototype draws, its sheets opened as a seller opens them. */
function addonPairs(): Pair[] {
  const has: AddonsFixture & UsageFixture = {
    owned: [{ key: 'extra_products' }, { key: 'extra_seat' }, { key: 'brand_identity' }],
    packsLeft: { bandwidth: 6.2, requests: 61_400 },
    autoBuy: { bandwidth: true },
  };
  const one = (
    screen: string,
    usage: AddonsFixture & UsageFixture,
    { shopState, ...extra }: Partial<Pair> & { shopState?: ShopState } = {},
  ): Pair => ({
    name: screen,
    screen,
    device: 'phone',
    language: 'bn',
    path: '/addons',
    ...extra,
    state: { ...shopState, money: { ...shopState?.money, usage } },
  });
  const rowOf = (page: Page, name: string) =>
    page
      .locator('main div')
      .filter({ has: page.getByText(name, { exact: true }) })
      .last();
  const buy = (name: string) => async (page: Page) => {
    await rowOf(page, name).getByRole('button', { name: 'কিনুন' }).click();
    await page.waitForTimeout(300);
  };
  const turnOff = (name: string) => async (page: Page) => {
    await page.getByRole('switch', { name: `রিনিউ · ${name}` }).click();
    await page.waitForTimeout(300);
  };
  const addonPayment = (state: 'checking' | 'rejected'): PaymentFixture =>
    payment({
      id: 'pay_addon_9',
      kind: 'addon',
      state,
      status: state === 'checking' ? 'pending' : 'rejected',
      amount: '99.00',
      planId: null,
      billingTermId: null,
      planName: null,
      billingTerm: null,
      method: 'wallet',
      transactionId: '5KD9QW',
      submittedAt: new Date().toISOString(),
      note:
        state === 'rejected'
          ? 'SMS-এ ৳90 দেখাচ্ছে; অ্যামাউন্ট ছিল ৳99। পুরো টাকা পাঠিয়ে আবার জমা দিন।'
          : null,
      addons: [
        {
          id: 'pa-9',
          key: 'extra_products',
          labelEn: 'Extra 500 products',
          labelBn: 'আরও 500 প্রোডাক্ট',
          quantity: 1,
          price: '99.00',
          status: 'pending',
        },
      ],
    });
  const afterWallet = (state: 'checking' | 'rejected'): Pair =>
    one(
      `addons-${state === 'checking' ? 'checking' : 'rejected'}`,
      {
        owned: [{ key: 'extra_seat' }, { key: 'brand_identity' }],
        packsLeft: has.packsLeft,
        autoBuy: has.autoBuy,
      },
      { shopState: { money: { payments: [addonPayment(state), ...drawnPayments().slice(1)] } } },
    );
  const payg: ShopState = { state: 'pay_as_you_go', money: { balance: '12.00' } };
  return [
    one('addons', has),
    { ...one('addons', has), device: 'desktop', language: 'en' },
    one('addons-trial', {}, { shopState: { state: 'trial', periodEndDays: 27 } }),
    one(
      'addons-payg',
      {
        owned: [
          { key: 'extra_products', renewal: 'from_balance', endsInDays: 16 },
          { key: 'extra_seat', renewal: 'balance_short', endsInDays: 19 },
        ],
      },
      { shopState: payg },
    ),
    one(
      'addons-ending',
      {
        owned: [
          { key: 'extra_products' },
          { key: 'extra_seat', renewal: 'retired' },
          { key: 'extra_storage', renewal: 'unlimited' },
        ],
      },
      { shopState: { money: { plan: PRO } } },
    ),
    one(
      'addons-grace',
      { owned: [{ key: 'extra_products' }] },
      { shopState: { state: 'grace', periodEndDays: -1 } },
    ),
    afterWallet('checking'),
    afterWallet('rejected'),
    one('addons-lapsing', {
      ...has,
      owned: [
        { key: 'extra_products' },
        { key: 'extra_seat', renewal: 'off', endsSoon: true, endsInDays: 7 },
        { key: 'brand_identity' },
      ],
    }),
    one('addons-lapsing-storage', {
      owned: [
        { key: 'extra_products' },
        { key: 'extra_storage', renewal: 'off', endsSoon: true, endsInDays: 7 },
      ],
    }),
    one('addons-lapsing-brand', {
      owned: [
        { key: 'extra_products' },
        { key: 'brand_identity', renewal: 'off', endsSoon: true, endsInDays: 7 },
      ],
    }),
    one('sh-addon-buy', {}, { then: buy('আরও 500 প্রোডাক্ট') }),
    one(
      'sh-addon-buy-low',
      {},
      { shopState: { money: { balance: '48.00' } }, then: buy('আরও 500 প্রোডাক্ট') },
    ),
    one(
      'sh-addon-buy-changed',
      { amountChangedTo: '94.00' },
      {
        then: async (page) => {
          await buy('আরও 500 প্রোডাক্ট')(page);
          await page
            .getByRole('dialog')
            .getByRole('button', { name: /· ৳99$/ })
            .click();
          await page.waitForTimeout(300);
        },
      },
    ),
    one(
      'sh-addon-buy-payg',
      {},
      { shopState: { state: 'pay_as_you_go' }, then: buy('আরও 500 প্রোডাক্ট') },
    ),
    one(
      'sh-addon-wallet',
      {},
      {
        shopState: { money: { balance: '48.00' } },
        then: async (page) => {
          await buy('আরও 500 প্রোডাক্ট')(page);
          await page
            .getByRole('dialog')
            .getByRole('button', { name: /· ৳99$/ })
            .click();
          await page.waitForTimeout(300);
        },
      },
    ),
    one('sh-addon-renew-off', has, { then: turnOff('আরও 500 প্রোডাক্ট') }),
    one('sh-addon-renew-off-seat', has, { then: turnOff('একটা সিট') }),
    one('sh-addon-renew-off-brand', has, { then: turnOff('ব্র্যান্ড আইডেন্টিটি') }),
    one('sh-pack-buy', has, { path: '/addons?pack=bandwidth' }),
    one('sh-pack-buy-req', has, { path: '/addons?pack=requests' }),
    one('sh-pack-buy-low', has, {
      path: '/addons?pack=bandwidth',
      shopState: { money: { balance: '12.00' } },
    }),
    one(
      'sh-pack-buy-changed',
      { ...has, amountChangedTo: '35.00' },
      {
        path: '/addons?pack=bandwidth',
        then: async (page) => {
          await page
            .getByRole('dialog')
            .getByRole('button', { name: /· ৳30$/ })
            .click();
          await page.waitForTimeout(300);
        },
      },
    ),
    {
      ...one('plan', {
        owned: [{ key: 'extra_products' }, { key: 'extra_seat' }],
        packsLeft: { bandwidth: 6.2 },
      }),
      name: 'plan-addons-card',
      path: '/plan',
      device: 'desktop',
      language: 'en',
    },
  ];
}

/** Balance, Billing and the places a payment's state shows (§7.11, §7.13), each as the prototype draws it. */
function balanceAndBilling(): Pair[] {
  const settled = drawnPayments().slice(1);
  const withFirst = (first: PaymentFixture): ShopState => ({
    money: { payments: [first, ...settled] },
  });
  const rejectedTopUp = payment({
    ...CHECKING_TOP_UP,
    id: 'pay_tu_rejected',
    state: 'rejected',
    status: 'rejected',
    note: 'এই TrxID-র কোনো SMS আমাদের নম্বরে আসেনি। TrxID মিলিয়ে আবার জমা দিন।',
  });
  const checkingRenewal = payment({
    ...CHECKING_TOP_UP,
    id: 'pay_renew_checking',
    kind: 'renewal',
    planId: STARTER,
    planName: 'Starter',
    amount: '449.00',
  });
  const one = (
    name: string,
    screen: string,
    path: string,
    state: ShopState,
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen, device, language, path, state });
  return [
    one('balance', 'balance', '/balance', { money: { payments: settled } }),
    one('balance', 'balance', '/balance', { money: { payments: settled } }, 'desktop', 'en'),
    one('balance-pending', 'balance-pending', '/balance', {}),
    one('balance-rejected', 'balance-rejected', '/balance', withFirst(rejectedTopUp)),
    one('balance-low', 'balance-low', '/balance', {
      money: { payments: settled, balance: '48.00' },
    }),
    {
      ...one('topup', 'topup', '/balance?topup=1', { money: { payments: settled } }),
    },
    one('billing', 'billing', '/billing', {}),
    one('billing', 'billing', '/billing', {}, 'desktop', 'en'),
    one('billing-checking', 'billing-checking', `/billing/${CHECKING_TOP_UP.id}`, {}),
    one('billing-paid', 'billing-paid', `/billing/${PAID_RENEWAL.id}`, {}),
    one('billing-paid', 'billing-paid', `/billing/${PAID_RENEWAL.id}`, {}, 'desktop', 'en'),
    one(
      'billing-rejected',
      'billing-rejected',
      '/billing/pay_8m3pqr',
      withFirst(rejectedRenewal('bn')),
    ),
    one(
      'billing-expired',
      'billing-expired',
      `/billing/${EXPIRED_RENEWAL.id}`,
      withFirst(EXPIRED_RENEWAL),
    ),
    one(
      'billing-awaiting',
      'billing-awaiting',
      `/billing/${AWAITING_RENEWAL.id}`,
      withFirst(AWAITING_RENEWAL),
    ),
    one('billing-cancelled', 'billing-cancelled', `/billing/${AWAITING_RENEWAL.id}`, {
      money: {
        payments: [
          {
            ...AWAITING_RENEWAL,
            state: 'cancelled',
            status: 'cancelled',
            cancelReason: 'seller',
            verifiedAt: new Date().toISOString(),
          },
          ...settled,
        ],
      },
    }),
    one('home-rejected', 'home-rejected', '', {
      money: {
        payments: [rejectedRenewal('bn'), ...settled],
        needing: { id: 'pay_8m3pqr', kind: 'renewal', amount: '449.00', state: 'rejected' },
      },
    }),
    one('plan-pending', 'plan-pending', '/plan', withFirst(checkingRenewal)),
    one('plan-rejected', 'plan-rejected', '/plan', withFirst(rejectedRenewal('bn'))),
  ];
}

const PLAN = { shop: 'megh', planId: STARTER, termId: TWELVE_MONTHS };
const VERIFY = '/verify-code?phone=%2B8801711234567&expiresInSeconds=300';
const OWNER = { signedIn: true, hasShop: true };

async function nameTheShop(page: Page): Promise<void> {
  await page.getByLabel('দোকানের নাম').fill('মেঘ ফ্যাশন');
  await page.getByLabel('আপনার নাম').fill('রুমানা আক্তার');
}

async function pickClothing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'পোশাক' }).click();
}

// TENANT-DASHBOARD-DESIGN §6: the steps before a shop, each with the prototype's own demo values typed in.
const STEPS: Pair[] = [
  {
    name: 'sign-in',
    screen: 'ob-signin',
    device: 'phone',
    language: 'bn',
    path: '/sign-in',
    journey: {},
    intent: PLAN,
  },
  {
    name: 'sign-in',
    screen: 'ob-signin',
    device: 'desktop',
    language: 'en',
    path: '/sign-in',
    journey: {},
    intent: PLAN,
  },
  {
    name: 'verify',
    screen: 'ob-verify',
    device: 'phone',
    language: 'bn',
    path: `${VERIFY}&resendAfterSeconds=42`,
    journey: {},
    then: (page) => typeCode(page, '444'),
  },
  {
    name: 'verify-wrong',
    screen: 'ob-verify-wrong',
    device: 'phone',
    language: 'bn',
    path: `${VERIFY}&resendAfterSeconds=0`,
    journey: { wrongCode: true },
    then: async (page) => {
      await typeCode(page, '444444');
      await page.getByRole('button', { name: 'ভেরিফাই করুন' }).click();
    },
  },
  {
    name: 'create-shop',
    screen: 'ob-create',
    device: 'phone',
    language: 'bn',
    path: '/create-shop',
    journey: { signedIn: true },
    intent: { shop: 'megh' },
    then: nameTheShop,
  },
  {
    name: 'create-shop-taken',
    screen: 'ob-create-taken',
    device: 'phone',
    language: 'bn',
    path: '/create-shop',
    journey: { signedIn: true, takenAddresses: ['megh'] },
    intent: { shop: 'megh' },
    then: nameTheShop,
  },
  {
    name: 'checkout',
    screen: 'ob-checkout',
    device: 'phone',
    language: 'bn',
    path: '/checkout',
    journey: OWNER,
    intent: { planId: STARTER, termId: TWELVE_MONTHS },
    draw: drawWalletCheckout,
    // The request is made on Continue (BIL-09), which opens the wallet step the sketch draws.
    then: async (page) => {
      await page.getByRole('button', { name: 'কন্টিনিউ করুন · ৳4,741' }).click();
      await page.getByLabel(/TrxID/).waitFor();
    },
  },
  {
    name: 'password',
    screen: 'ob-password',
    device: 'phone',
    language: 'bn',
    path: '/set-password?required=false',
    journey: OWNER,
    then: async (page) => {
      await page.getByLabel('নতুন পাসওয়ার্ড').fill('megh2026');
    },
  },
  {
    name: 'set-up',
    screen: 'ob-setup',
    device: 'phone',
    language: 'bn',
    path: '/set-up',
    journey: OWNER,
    then: pickClothing,
  },
  {
    name: 'set-up',
    screen: 'ob-setup',
    device: 'desktop',
    language: 'bn',
    path: '/set-up',
    journey: OWNER,
    then: pickClothing,
  },
  {
    name: 'staff',
    screen: 'ob-staff',
    device: 'phone',
    language: 'bn',
    path: '/staff-sign-in',
    journey: {},
  },
  {
    name: 'forgot',
    screen: 'ob-forgot',
    device: 'phone',
    language: 'bn',
    path: '/forgot-password',
    journey: {},
  },
  {
    name: 'shops',
    screen: 'shops',
    device: 'phone',
    language: 'bn',
    path: '/shops',
    journey: {
      ...OWNER,
      shops: [
        { slug: SLUG, shopName: 'মেঘ ফ্যাশন', role: 'owner' },
        { slug: 'rahim-gadgets', shopName: 'রহিম গ্যাজেটস', role: 'staff' },
      ],
    },
  },
];

test.describe('the built shell beside the prototype', () => {
  for (const pair of [...PAIRS, ...MONEY, ...STEPS]) {
    test(`${pair.name} on a ${pair.device} in ${pair.language}`, async ({ browser }) => {
      // The pictures set their own sizes, so they are taken once, not in every project.
      test.skip(test.info().project.name !== 'desktop', 'taken once, in the desktop project');
      const out = `test-results/compare/${pair.name}-${pair.device}-${pair.language}`;

      const drawing = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
      await drawing.goto(PROTOTYPE);
      await drawing.click(`#segLang button[data-v="${pair.language}"]`);
      await drawing.click(`#segDevice button[data-v="${pair.device}"]`);
      if (pair.draw) await pair.draw(drawing);
      if (pair.shop) await drawing.selectOption('#selState', pair.shop.drawn);
      await drawing.selectOption('#selScreen', pair.screen);
      await drawing.waitForTimeout(400);
      await drawing.locator('#frame .shell').screenshot({ path: `${out}-prototype.png` });
      await drawing.close();

      const app = await browser.newPage({ viewport: AREA[pair.device] });
      if (pair.intent) {
        await app.addInitScript(
          (intent: string) => {
            sessionStorage.setItem('lytro.sign-up-intent', intent);
          },
          JSON.stringify({ shop: null, planId: null, termId: null, ...pair.intent }),
        );
      }
      if (pair.journey) {
        await mockOnboarding(app, { language: pair.language, ...pair.journey });
        await app.goto(pair.path);
      } else {
        await mockApi(app, { ...pair.shop?.state, ...pair.state, language: pair.language });
        await app.goto(`/${SLUG}${pair.path}`);
      }
      await app.waitForLoadState('networkidle');
      await app.evaluate(() => document.fonts.ready);
      if (pair.then) await pair.then(app);
      await app.waitForTimeout(300);
      await app.screenshot({ path: `${out}-app.png` });
      await app.close();
    });
  }
});
