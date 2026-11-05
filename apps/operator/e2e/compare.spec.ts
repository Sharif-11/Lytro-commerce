import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addonPayment, drawnPayments, drawnShops, GADGET, RAHIM } from './support/console-data';
import {
  CODE,
  EMAIL,
  mockApi,
  PASSWORD,
  type ConsoleState,
  type Language,
} from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §17: each built screen beside the sketch's drawing of it, at the sketch's own frame sizes, saved
// to test-results/compare for the pull request and CI's artifacts. No pixel baseline is committed: a font renders a little
// differently on Windows and Linux, so the pictures are for a person to compare.
const SKETCH = pathToFileURL(
  resolve(import.meta.dirname, '../../../docs/brand/lytro-operator.html'),
).href;

const COMPARE = resolve(import.meta.dirname, '../test-results/compare');

type Device = 'phone' | 'tablet' | 'desktop';

// The area the sketch's frame gives its screens: the frame less its border, and the status bar or address bar.
const AREA: Record<Device, { width: number; height: number }> = {
  phone: { width: 374, height: 784 },
  tablet: { width: 804, height: 940 },
  desktop: { width: 1364, height: 818 },
};

interface Pair {
  /** The sketch's screen id. */
  screen: string;
  /** Whether it is drawn without the shell. */
  bare?: boolean;
  path: string;
  state?: ConsoleState;
  /** What to do in the app before its picture. */
  then?: (page: Page) => Promise<void>;
  /** Where the screen exists, when it isn't everywhere. */
  only?: Device[];
}

async function credentials(page: Page, password = PASSWORD): Promise<void> {
  await page.locator('input[name=email]').fill(EMAIL);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
}

async function code(page: Page, typed: string): Promise<void> {
  await page.locator('input[name=code]').fill(typed);
  await page.locator('button[type=submit]').click();
}

const SIGNED_OUT: ConsoleState = { signedIn: false };

/** A button by its English or Bangla words. */
function press(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .getByRole('button', { name: new RegExp(`^(${en}|${bn})`) })
      .first()
      .click();
}

const RAHIM_PAGE = '/shops/ten-0001';
const PAGE_OFF: ConsoleState = {
  shops: drawnShops().map((each) =>
    each.id === RAHIM
      ? {
          ...each,
          paymentPageSuspension: {
            at: '2026-10-20T00:00:00.000Z',
            reason: 'Asked shoppers for their bKash PIN',
          },
        }
      : each,
  ),
};

const PAIRS: Pair[] = [
  { screen: 'signin', bare: true, path: '/sign-in', state: SIGNED_OUT },
  {
    screen: 'signin-bad',
    bare: true,
    path: '/sign-in',
    state: SIGNED_OUT,
    then: (page) => credentials(page, 'not-the-password'),
  },
  {
    screen: 'signin-locked',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, failures: 5 },
    then: (page) => credentials(page),
  },
  {
    screen: 'signin-verify',
    bare: true,
    path: '/sign-in',
    state: SIGNED_OUT,
    then: (page) => credentials(page),
  },
  {
    screen: 'signin-wrong',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, failures: 1 },
    then: async (page) => {
      await credentials(page);
      await code(page, '481 900');
    },
  },
  {
    screen: 'signin-enroll',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, enrolled: false },
    then: (page) => credentials(page),
  },
  {
    screen: 'signin-codes',
    bare: true,
    path: '/sign-in',
    state: { ...SIGNED_OUT, enrolled: false },
    then: async (page) => {
      await credentials(page);
      await code(page, CODE);
    },
  },
  { screen: 'account', path: '/account' },
  {
    screen: 'account-codes',
    path: '/account',
    then: (page) => page.locator('main button').first().click(),
  },
  {
    screen: 'account-codes-done',
    path: '/account',
    then: async (page) => {
      await page.locator('main button').first().click();
      await page.locator('dialog input[name=password]').fill(PASSWORD);
      await page.locator('dialog input[name=code]').fill(CODE);
      await page.locator('dialog button[type=submit]').click();
      await page.locator('dialog li').first().waitFor();
    },
  },
  {
    screen: 'more',
    path: '/',
    then: (page) =>
      page
        .locator('button', { hasText: /^(More|আরও)$/ })
        .first()
        .click(),
    only: ['phone'],
  },
  { screen: 'today', path: '/' },
  { screen: 'queue', path: '/queue' },
  { screen: 'queue-payment', path: '/queue/pay-9101' },
  { screen: 'queue-approve', path: '/queue/pay-9101?step=approve' },
  { screen: 'queue-reject', path: '/queue/pay-9101?step=reject' },
  { screen: 'queue-credit', path: '/queue/pay-9101?step=credit' },
  {
    screen: 'queue-addon',
    path: '/queue/pay-9110',
    state: { payments: [...drawnPayments(), addonPayment()] },
  },
  { screen: 'tenants', path: '/shops' },
  { screen: 'tenant', path: RAHIM_PAGE },
  { screen: 'tenant-suspended', path: `/shops/${GADGET}` },
  { screen: 'tenant-suspend', path: RAHIM_PAGE, then: press('Suspend for cause', 'সাসপেন্ড করুন') },
  { screen: 'tenant-restore', path: `/shops/${GADGET}`, then: press('Restore', 'রিস্টোর') },
  {
    screen: 'tenant-adjust',
    path: RAHIM_PAGE,
    then: press('Adjust balance', 'ব্যালেন্স ঠিক করুন'),
  },
  { screen: 'tenant-assign', path: RAHIM_PAGE, then: press('Assign a plan', 'প্ল্যান দিন') },
  { screen: 'tenant-override', path: RAHIM_PAGE, then: press('Add override', 'ওভাররাইড যোগ') },
  { screen: 'tenant-page-off', path: RAHIM_PAGE, state: PAGE_OFF },
  {
    screen: 'tenant-page-suspend',
    path: RAHIM_PAGE,
    then: press('Suspend the page', 'পেজ সাসপেন্ড করুন'),
  },
  {
    screen: 'tenant-page-restore',
    path: RAHIM_PAGE,
    state: PAGE_OFF,
    then: press('Restore the page', 'পেজ আবার চালু করুন'),
  },
  { screen: 'tenant-cap', path: RAHIM_PAGE, then: press('Change', 'বদলান') },
  { screen: 'tenant-phone-revoke', path: RAHIM_PAGE, then: press('Revoke', 'ক্যানসেল') },
  { screen: 'tenant-phone-block', path: RAHIM_PAGE, then: press('Block', 'ব্লক') },
  { screen: 'tenant-credentials', path: `${RAHIM_PAGE}/credentials` },
  { screen: 'pagereports', path: '/page-reports' },
  { screen: 'pagereports-handled', path: '/page-reports?view=handled' },
  {
    screen: 'pagereport',
    path: '/page-reports',
    then: (page) => page.locator('main section button').first().click(),
  },
  {
    screen: 'pagereport-suspend',
    path: '/page-reports',
    then: press('Suspend the page', 'পেজ সাসপেন্ড করুন'),
  },
  { screen: 'pagereport-dismiss', path: '/page-reports', then: press('Dismiss$', 'বাদ দিন') },
  { screen: 'phones', path: '/phones' },
  { screen: 'phone-pair', path: '/phones', then: press('Pair a phone', 'ফোন পেয়ার করুন') },
  { screen: 'receipts', path: '/phones/receipts' },
  {
    screen: 'receipt',
    path: '/phones/receipts',
    then: (page) => page.locator('main section button').first().click(),
  },
  { screen: 'unread', path: '/phones/unread' },
  { screen: 'plans', path: '/plans' },
  {
    screen: 'plan-edit',
    path: '/plans',
    then: (page) => page.getByRole('button', { name: /(Edit|এডিট) Starter/ }).click(),
  },
  { screen: 'plan-new', path: '/plans', then: press('New plan', 'নতুন প্ল্যান') },
  {
    screen: 'plan-versions',
    path: '/plans',
    then: async (page) => {
      await page.getByRole('button', { name: /(Edit|এডিট) Starter/ }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /Version history|ভার্সন ইতিহাস/ })
        .click();
    },
  },
  { screen: 'terms', path: '/billing-terms' },
  {
    screen: 'term-edit',
    path: '/billing-terms',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Edit|এডিট)$/ })
        .nth(1)
        .click(),
  },
  { screen: 'term-new', path: '/billing-terms', then: press('New term', 'নতুন টার্ম') },
  {
    screen: 'term-retire',
    path: '/billing-terms',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Retire|রিটায়ার)$/ })
        .nth(1)
        .click(),
  },
  { screen: 'rates', path: '/rates' },
  {
    screen: 'rate-change',
    path: '/rates',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Change|বদলান): / })
        .first()
        .click(),
  },
  {
    screen: 'rate-history',
    path: '/rates',
    then: (page) =>
      page
        .getByRole('button', { name: /^(History|ইতিহাস): / })
        .nth(4)
        .click(),
  },
  { screen: 'addons', path: '/addons' },
  { screen: 'addon-edit', path: '/addons', then: press('Edit', 'এডিট') },
  { screen: 'addon-new', path: '/addons', then: press('New item', 'নতুন আইটেম') },
  {
    screen: 'addon-retire',
    path: '/addons',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Retire|বন্ধ করুন)$/ })
        .nth(1)
        .click(),
  },
  { screen: 'settings', path: '/settings' },
  {
    screen: 'setting-change',
    path: '/settings',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Change|বদলান): / })
        .first()
        .click(),
  },
  {
    screen: 'setting-senders',
    path: '/settings',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Change: Wallet senders|বদলান: ওয়ালেট সেন্ডার)/ })
        .click(),
  },
  {
    screen: 'setting-order-limit',
    path: '/settings',
    then: (page) =>
      page.getByRole('button', { name: /^(Change: Past the order|বদলান: অর্ডার লিমিটের)/ }).click(),
  },
  {
    screen: 'setting-version',
    path: '/settings',
    then: (page) =>
      page.getByRole('button', { name: /^(Change: Terms version|বদলান: টার্মস ভার্সন)/ }).click(),
  },
  { screen: 'wallets', path: '/wallets' },
  { screen: 'wallet-new', path: '/wallets', then: press('Add wallet', 'ওয়ালেট যোগ') },
  { screen: 'wallet-edit', path: '/wallets', then: press('Edit', 'এডিট') },
  {
    screen: 'wallet-remove',
    path: '/wallets',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Remove|সরান)$/ })
        .nth(2)
        .click(),
  },
  { screen: 'shoptypes', path: '/catalogue/shop-types' },
  {
    screen: 'shoptype-edit',
    path: '/catalogue/shop-types',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Edit|এডিট)$/ })
        .nth(1)
        .click(),
  },
  { screen: 'attributes', path: '/catalogue/attributes' },
  {
    screen: 'attribute-new',
    path: '/catalogue/attributes',
    then: press('New attribute', 'নতুন অ্যাট্রিবিউট'),
  },
  {
    screen: 'attribute-detail',
    path: '/catalogue/attributes',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Open|খুলুন): / })
        .first()
        .click(),
  },
  {
    screen: 'attribute-value',
    path: '/catalogue/attributes',
    then: async (page) => {
      await page
        .getByRole('button', { name: /^(Open|খুলুন): / })
        .first()
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /Add a value|মান যোগ/ })
        .click();
    },
  },
  { screen: 'optionsets', path: '/catalogue/option-sets' },
  { screen: 'optionset-edit', path: '/catalogue/option-sets', then: press('Edit', 'এডিট') },
  {
    screen: 'optionset-new',
    path: '/catalogue/option-sets',
    then: press('New option set', 'নতুন অপশন সেট'),
  },
  {
    screen: 'optionset-delete',
    path: '/catalogue/option-sets',
    then: (page) =>
      page
        .getByRole('button', { name: /^(Delete|ডিলিট)$/ })
        .nth(3)
        .click(),
  },
  { screen: 'later-audit', path: '/audit' },
  { screen: 'later-reports', path: '/reports' },
  { screen: 'later-manual', path: '/manual' },
];

const DEVICES: Device[] = ['phone', 'desktop', 'tablet'];
const LANGUAGES: Language[] = ['en', 'bn'];

test.skip(() => test.info().project.name !== 'desktop', 'Sets its own frame sizes');

for (const pair of PAIRS) {
  for (const device of pair.only ?? DEVICES) {
    for (const language of LANGUAGES) {
      test(`${pair.screen} on a ${device} in ${language}`, async ({ browser, baseURL }) => {
        mkdirSync(COMPARE, { recursive: true });
        const out = resolve(COMPARE, `${pair.screen}-${device}-${language}`);

        const drawn = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
        await drawn.goto(SKETCH);
        await drawn.click(`#segDevice button[data-v="${device}"]`);
        await drawn.click(`#segLang button[data-v="${language}"]`);
        await drawn.selectOption('#selScreen', pair.screen);
        await drawn.evaluate(() => document.fonts.ready);
        await drawn
          .locator(pair.bare ? '#frame .bare' : '#frame .shell')
          .screenshot({ path: `${out}-sketch.png` });
        await drawn.close();

        const context = await browser.newContext({
          baseURL,
          viewport: AREA[device],
          locale: 'en-GB',
        });
        const app = await context.newPage();
        await mockApi(app, { language, ...pair.state });
        await app.goto(pair.path);
        await expect(app.locator('#root > *').first()).toBeVisible();
        await pair.then?.(app);
        await app.waitForLoadState('networkidle');
        await app.evaluate(() => document.fonts.ready);
        await app.screenshot({ path: `${out}-app.png` });
        await context.close();
      });
    }
  }
}
