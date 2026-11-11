import type { Page } from '@playwright/test';
import { STARTER } from './support/catalogue';
import type { Language, ShopState } from './support/mock-api';
import { drawnMethods, type PaymentMethodsFixture } from './support/payment-methods';
import { CHECKING_TOP_UP, drawnPayments, payment } from './support/payments';
import { SHOT_UPLOAD_PATH } from './support/p88-money-mock';
import type { BellFixture } from './support/phase7';

// TENANT-DASHBOARD-DESIGN §7.41 (Slice 8.8, Part 39), the money side: a payment method Lytro is retiring, the bell's two
// notices about it and their switches, and a payment's screenshot sent from Billing, with Plan's and Balance's banners
// leading there. Each beside the prototype's drawing of it, wired into compare.spec.ts's PAIRS.

/** The fields of compare.spec.ts's Pair these use. */
interface MoneyPair {
  name: string;
  screen: string;
  device: 'phone' | 'tablet' | 'desktop';
  language: Language;
  path: string;
  then?: (page: Page) => Promise<void>;
  state?: ShopState;
  scroll?: RegExp;
  scrollText?: RegExp;
}

const PM_PATH = '/settings/payment-methods';

/** The drawn shop with Nagad as `change` leaves it. */
function nagad(
  language: Language,
  change: (methods: PaymentMethodsFixture) => void,
): PaymentMethodsFixture {
  const methods = drawnMethods(language);
  change(methods);
  return methods;
}

const retiring = (language: Language, on = true): PaymentMethodsFixture =>
  nagad(language, (methods) => {
    const row = methods.methods.find((each) => each.method === 'nagad');
    if (row) {
      row.retiring = true;
      row.enabled = on;
    }
  });

const unset = (language: Language): PaymentMethodsFixture =>
  nagad(language, (methods) => {
    methods.methods = methods.methods.filter((each) => each.method !== 'nagad');
  });

const pm = (
  name: string,
  methods: PaymentMethodsFixture,
  extra: Partial<MoneyPair> = {},
  state: ShopState = {},
): MoneyPair => ({
  name,
  screen: name,
  device: 'phone',
  language: 'bn',
  path: PM_PATH,
  state: { paymentMethods: methods, ...state },
  // Nagad's card, where the mark is; Rocket's where Nagad isn't.
  scrollText: methods.methods.some((each) => each.method === 'nagad') ? /^Nagad/ : /^Rocket/,
  ...extra,
});

const MINUTE = 1;
const DAY = 24 * 60;

const tapBell = async (page: Page): Promise<void> => {
  await page
    .getByRole('button', { name: /^Notifications|^নোটিফিকেশন/ })
    .first()
    .click();
  await page.waitForTimeout(300);
};

const bell = (name: string, rows: BellFixture, language: Language = 'bn'): MoneyPair => ({
  name,
  screen: name,
  device: 'phone',
  language,
  path: '',
  state: { phase7: { bell: rows } },
  then: tapBell,
});

const JPEG_BYTES = Math.round(1.2 * 1024 * 1024);

/** Chooses a file in the screenshot card, as a seller does from the button's picker. */
const choose =
  (name: string, mimeType: string, bytes: number, wait?: RegExp) =>
  async (page: Page): Promise<void> => {
    await page
      .getByRole('main')
      .locator('input[type="file"]')
      .setInputFiles({ name, mimeType, buffer: Buffer.alloc(bytes) });
    if (wait) await page.getByText(wait).first().waitFor();
    await page.waitForTimeout(300);
  };

/** The browser's upload held at 62%, as the sketch draws it: progress told, the request never finishing. */
async function holdAt62(page: Page): Promise<void> {
  await page.evaluate(() => {
    XMLHttpRequest.prototype.send = function send(this: XMLHttpRequest): void {
      this.upload.dispatchEvent(
        new ProgressEvent('progress', { lengthComputable: true, loaded: 62, total: 100 }),
      );
    };
  });
}

const BILLING_CHECKING = `/billing/${CHECKING_TOP_UP.id}`;

const shot = (
  name: string,
  then?: (page: Page) => Promise<void>,
  extra: Partial<MoneyPair> = {},
): MoneyPair => ({
  name,
  screen: name,
  device: 'phone',
  language: 'bn',
  path: BILLING_CHECKING,
  // The card, below the payment's own.
  scroll: /^পেমেন্টের স্ক্রিনশট$|^Screenshot of the payment$/,
  ...(then ? { then } : {}),
  ...extra,
});

/** Part 39's money pairs. */
export const P88_MONEY: MoneyPair[] = [
  pm('p88-pm-retiring', retiring('bn')),
  pm('p88-pm-retiring', retiring('en'), { device: 'desktop', language: 'en' }),
  pm('p88-pm-retiring-off', retiring('bn', false)),
  pm(
    'p88-pm-retiring-staff',
    retiring('bn'),
    {},
    {
      isOwner: false,
      permissions: ['wallets:read'],
    },
  ),
  pm('p88-pm-unset', unset('bn')),
  pm('p88-pm-back', drawnMethods('bn')),
  bell('p88-bell-retiring', [
    ['pmRetire', true, 5 * MINUTE],
    ['placed', true, 8 * MINUTE],
    ['moved', false, 1.1 * DAY],
    ['low', false, 2.2 * DAY],
  ]),
  bell('p88-bell-back', [
    ['pmBack', true, 5 * MINUTE],
    ['placed', false, 8 * MINUTE],
    ['pmRetire', false, 1.1 * DAY],
    ['low', false, 2.2 * DAY],
  ]),
  {
    name: 'p88-prefs',
    screen: 'p88-prefs',
    device: 'phone',
    language: 'bn',
    path: '/settings/notifications',
  },
  shot('p88-bl-shot'),
  shot('p88-bl-shot', undefined, { device: 'desktop', language: 'en' }),
  shot('p88-bl-shot-uploading', async (page) => {
    await holdAt62(page);
    await choose('bkash-payment.jpg', 'image/jpeg', JPEG_BYTES, /62%/)(page);
  }),
  shot(
    'p88-bl-shot-sent',
    choose('bkash-payment.jpg', 'image/jpeg', JPEG_BYTES, /স্ক্রিনশট Lytro-কে পাঠানো হয়েছে/),
  ),
  shot('p88-bl-shot-big', choose('bkash-payment.jpg', 'image/jpeg', 8_178_893, /5 MB-এর বেশি/)),
  shot('p88-bl-shot-type', choose('notes.txt', 'text/plain', 120, /শুধু ছবি/)),
  shot('p88-bl-shot-failed', async (page) => {
    await page.route(`**${SHOT_UPLOAD_PATH}`, (route) => route.abort());
    await choose('bkash-payment.jpg', 'image/jpeg', JPEG_BYTES, /আপলোড শেষ হয়নি/)(page);
  }),
  {
    name: 'p88-plan-pending',
    screen: 'p88-plan-pending',
    device: 'phone',
    language: 'bn',
    path: '/plan',
    state: {
      money: {
        payments: [
          payment({
            ...CHECKING_TOP_UP,
            id: 'pay_renew_checking',
            kind: 'renewal',
            planId: STARTER,
            planName: 'Starter',
            amount: '449.00',
          }),
          ...drawnPayments().slice(1),
        ],
      },
    },
  },
  {
    name: 'p88-balance-pending',
    screen: 'p88-balance-pending',
    device: 'phone',
    language: 'bn',
    path: '/balance',
  },
];
