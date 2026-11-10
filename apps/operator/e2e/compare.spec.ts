import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addonPayment, drawnPayments, drawnShops, GADGET, RAHIM } from './support/console-data';
import { P88_SETTINGS_PAIRS } from './compare-p88-settings';
import { P88_SHOPS_PAIRS } from './compare-p88-shops';
import { retiringCouriers } from './support/courier-mock';
import { phase7Changes, phase7RateHistory, phase7Rates } from './support/notice-mock';
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
const RETIRING: ConsoleState = { couriers: retiringCouriers() };
const CLEAR: ConsoleState = { couriers: retiringCouriers(0), blocking: [] };

/** A button on RedX's row of the couriers. */
function onRedx(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .locator('main section > div', { hasText: 'RedX' })
      .getByRole('button', { name: new RegExp(`^(${en}|${bn})$`) })
      .click();
}

/** Retire RedX suggesting Pathao, as the sketch draws it; `send` also gives the reason and retires it. */
function retireRedx(send: boolean): (page: Page) => Promise<void> {
  return async (page) => {
    await onRedx('Retire', 'রিটায়ার')(page);
    await page.locator('dialog select').selectOption('pathao');
    if (!send) return;
    await page.locator('dialog textarea').fill('Its API stopped answering');
    await page.locator('dialog button[type=submit]').click();
  };
}

/** One of the area list's chips. */
function chip(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .locator('main')
      .getByRole('button', { name: new RegExp(`^(${en}|${bn})`) })
      .first()
      .click();
}

/** The two suggestions the sketch draws picked. */
async function pickTwo(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Kakoli(Banani)' }).check();
  await page.getByRole('checkbox', { name: 'Banasree(Rampura)' }).check();
}

/** Place Notun Bazar in Badda, as the sketch draws it; `save` saves it. */
function placeNotunBazar(save: boolean): (page: Page) => Promise<void> {
  return async (page) => {
    await chip('No thana', 'থানা নেই')(page);
    await page
      .locator('main section > div', { hasText: 'Notun Bazar' })
      .getByRole('button', { name: /^(Place|বসান)$/ })
      .click();
    await page.locator('dialog input[type=search]').fill('Badda');
    await page.locator('dialog [role=option]').first().click();
    if (save)
      await page
        .locator('dialog')
        .getByRole('button', { name: /^(Save|সেভ করুন)$/ })
        .click();
  };
}

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

// Phase 7 (Slice 7.7): the sketch draws its notices at 7 Nov, 21:44, with the rates and changes Phase 7 left.
const P7: ConsoleState = {
  rates: phase7Rates(),
  rateHistory: phase7RateHistory(),
  changes: phase7Changes(),
  now: '2026-11-07T21:44:00+06:00',
};
const P7_LINKED: ConsoleState = { ...P7, rateHistory: phase7RateHistory('n-13') };
const MAINTENANCE =
  '/notices/new?template=maintenance&from=2026-11-09T20%3A00%3A00.000Z&to=2026-11-09T22%3A00%3A00.000Z';

/** The open panel's own button. */
const confirm = (page: Page): Promise<void> => page.locator('dialog button[type=submit]').click();

/** One of the editor's language tabs: in the page, not the top bar's switch to the other language. */
function languageTab(name: 'English' | 'বাংলা'): (page: Page) => Promise<void> {
  return (page) =>
    page
      .locator('main')
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .click();
}

/** Back at the top with nothing focused, as the sketch opens a screen after a field was typed in. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    for (const each of document.querySelectorAll('*')) each.scrollTop = 0;
  });
}

/** The maintenance notice as the sketch draws it: the 10 Nov window, live at 8 Nov, 10:00. */
async function sketchMaintenance(page: Page): Promise<void> {
  await page.locator('main input[type=datetime-local]').first().fill('2026-11-08T10:00');
  await settle(page);
}

/** The new-notice panel with a template picked; maintenance with the sketch's window. */
function startWith(en: string, bn: string): (page: Page) => Promise<void> {
  return async (page) => {
    await press('New notice', 'নতুন নোটিশ')(page);
    await page
      .locator('dialog')
      .getByText(new RegExp(`^(${en}|${bn})$`))
      .click();
    if (en !== 'Maintenance') return;
    const times = page.locator('dialog input[type=datetime-local]');
    await times.nth(0).fill('2026-11-10T02:00');
    await times.nth(1).fill('2026-11-10T04:00');
    await settle(page);
  };
}

/** A settings group's heading at the top of the page, as the sketch opens it. */
function toGroup(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page.getByRole('heading', { name: new RegExp(`^(${en}|${bn})$`) }).evaluate((heading) => {
      heading.scrollIntoView({ block: 'start' });
    });
}

/** A Phase 7 setting opened to change, its group at the top. */
function changeSetting(
  group: [string, string],
  name: [string, string],
): (page: Page) => Promise<void> {
  return async (page) => {
    await toGroup(...group)(page);
    await page
      .getByRole('button', { name: new RegExp(`^(Change: ${name[0]}|বদলান: ${name[1]})`) })
      .click();
  };
}

const READING: [string, string] = ['Reading delivery details', 'ডেলিভারির তথ্য পড়া'];
const FRAUD: [string, string] = ['Fraud checks', 'ফ্রড চেক'];
const FRAUD_CHECKS: [string, string] = ['Checks per shop', 'শপ প্রতি চেক'];

const LONG_TITLE =
  'নতুন: কাস্টমারের মেসেজ থেকে নাম, ফোন, জেলা, থানা আর ঠিকানা এখন Lytro নিজেই পড়ে নতুন অর্ডার ফর্মে বসিয়ে দেয়, আর কিছু না পেলে কোনো টাকা কাটে না, প্রতিবার মাত্র ৳0.10';
const LONG_BODY =
  'নতুন অর্ডার ফর্মে কাস্টমারের মেসেজ পেস্ট করুন, Lytro নিজেই **নাম, ফোন, জেলা, থানা আর ঠিকানা** বসিয়ে দেবে। বিস্তারিত দেখুন [এখানে](http://lytro.app/help/address-reads)।\n\n- প্রতিবার পড়তে ৳0.10, অথবা অ্যালাউন্স থেকে কাটে\n- কিছু না পেলে টাকা কাটে না ';

/** The sketch's notice refused for being too long, a plain link and half a language. */
async function tooLong(page: Page): Promise<void> {
  const field = (en: string, bn: string) =>
    page.locator('main').getByLabel(new RegExp(`^(${en}|${bn})$`));
  await page.locator('main select').first().selectOption('new_feature');
  await field('Title', 'শিরোনাম').fill(LONG_TITLE);
  await field('Body', 'বডি').fill(
    LONG_BODY + 'আর '.repeat(Math.ceil((5214 - LONG_BODY.length) / 3)),
  );
  await languageTab('English')(page);
  await field('Title', 'শিরোনাম').fill('Read delivery details from a message');
  await page
    .locator('main')
    .getByText(/^(Now|এখনই)$/)
    .click();
  await press('Publish…', 'পাবলিশ…')(page);
  await languageTab('বাংলা')(page);
  await settle(page);
}

/** A new allowance whose key another add-on holds, as the server refuses it. */
async function takenAllowance(page: Page): Promise<void> {
  await page.route('**/api/v1/operator/addons', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            statusCode: 400,
            message: 'Some fields need attention.',
            errors: {
              code: 'validation_error',
              details: {
                fields: [{ field: 'key', problem: 'taken', message: 'This key is taken.' }],
              },
            },
          }),
        })
      : route.fallback(),
  );
  await press('New item', 'নতুন আইটেম')(page);
  await page.locator('dialog select[name=kind]').selectOption('allowance');
  await page.locator('dialog input[name=labelEn]').fill('Address reads from messages');
  await page.locator('dialog input[name=labelBn]').fill('মেসেজ থেকে ঠিকানা পড়া');
  await page.locator('dialog input[name=key]').fill('address_reads_200');
  await page.locator('dialog input[name=unitSize]').fill('200');
  await page.locator('dialog input[name=price]').fill('20');
  await confirm(page);
}

const SMS_AT_55: ConsoleState = {
  ...P7,
  rates: phase7Rates().map((rate) =>
    rate.key === 'sms_per_unit' ? { ...rate, value: '0.55' } : rate,
  ),
};

/** SMS's rate saved from ৳0.55 to ৳0.65, as the sketch's offer follows. */
async function saveSmsRate(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^(Change|বদলান): / })
    .first()
    .click();
  await page.locator('main input[name=value]').fill('0.65');
  await page.locator('main [name=reason]').fill('Provider price');
  await page.locator('main form button[type=submit]').click();
}

/** The rate-change notice published from its change, back on the rate's history. */
async function publishRateNotice(page: Page): Promise<void> {
  await press('Publish…', 'পাবলিশ…')(page);
  await confirm(page);
}

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
  { screen: 'wallet-new', path: '/wallets', then: press('Add number', 'নম্বর যোগ করুন') },
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
  // The sketch of Slice 8.8 (v7) draws reports, the audit log and manual entries as
  // pages of their own, so their "Later" pairs went; the build pairs the new pages.
  // Phase 6 Slice 6.7 (v4): the couriers, RedX's areas and a shop's courier key log.
  { screen: 'couriers', path: '/couriers' },
  { screen: 'courier-retire', path: '/couriers', then: retireRedx(false) },
  { screen: 'courier-retiring', path: '/couriers', then: retireRedx(true) },
  {
    screen: 'courier-undo',
    path: '/couriers',
    state: RETIRING,
    then: onRedx('Undo retiring', 'রিটায়ার বাতিল'),
  },
  {
    screen: 'courier-undone',
    path: '/couriers',
    state: RETIRING,
    then: async (page) => {
      await onRedx('Undo retiring', 'রিটায়ার বাতিল')(page);
      await page.locator('dialog textarea').fill('RedX answers again');
      await page.locator('dialog button[type=submit]').click();
    },
  },
  {
    screen: 'courier-remove-blocked',
    path: '/couriers',
    state: RETIRING,
    then: onRedx('Remove', 'রিমুভ'),
  },
  { screen: 'courier-retiring-clear', path: '/couriers', state: CLEAR },
  { screen: 'courier-remove', path: '/couriers', state: CLEAR, then: onRedx('Remove', 'রিমুভ') },
  {
    screen: 'courier-removed',
    path: '/couriers',
    state: CLEAR,
    then: async (page) => {
      await onRedx('Remove', 'রিমুভ')(page);
      await page.locator('dialog textarea').fill('Nothing waits on it');
      await page.locator('dialog button[type=submit]').click();
    },
  },
  {
    screen: 'couriers-error',
    path: '/couriers',
    state: { failing: { '/operator/couriers': 503 } },
  },
  { screen: 'courier-areas', path: '/couriers/redx-areas', then: pickTwo },
  { screen: 'courier-areas-all', path: '/couriers/redx-areas', then: chip('All', 'সব') },
  {
    screen: 'courier-areas-unassigned',
    path: '/couriers/redx-areas',
    then: chip('No thana', 'থানা নেই'),
  },
  {
    screen: 'courier-areas-assigned',
    path: '/couriers/redx-areas',
    then: chip('In a thana', 'থানায় আছে'),
  },
  {
    screen: 'courier-areas-retired',
    path: '/couriers/redx-areas',
    then: chip('Retired by RedX', 'RedX বাদ দিয়েছে'),
  },
  {
    screen: 'courier-areas-notoken',
    path: '/couriers/redx-areas',
    state: {
      areaToken: false,
      areas: [],
      areasRead: null,
      areaCounts: { all: 0, suggested: 0, unassigned: 0, assigned: 0, retired: 0 },
    },
  },
  {
    screen: 'courier-areas-confirm',
    path: '/couriers/redx-areas',
    then: async (page) => {
      await pickTwo(page);
      await press('Confirm 2', '2টা কনফার্ম করুন')(page);
    },
  },
  {
    screen: 'courier-areas-confirmed',
    path: '/couriers/redx-areas',
    then: async (page) => {
      await pickTwo(page);
      await press('Confirm 2', '2টা কনফার্ম করুন')(page);
      await page.locator('dialog button[type=submit]').click();
    },
  },
  {
    screen: 'courier-areas-refreshed',
    path: '/couriers/redx-areas',
    then: press('Refresh now', 'এখনই রিফ্রেশ করুন'),
  },
  { screen: 'courier-area-place', path: '/couriers/redx-areas', then: placeNotunBazar(false) },
  { screen: 'courier-area-placed', path: '/couriers/redx-areas', then: placeNotunBazar(true) },
  {
    screen: 'courier-area-change',
    path: '/couriers/redx-areas',
    then: async (page) => {
      await chip('In a thana', 'থানায় আছে')(page);
      await page
        .locator('main section > div', { hasText: 'Bashundhara R/A' })
        .getByRole('button', { name: /^(Change|বদলান)$/ })
        .click();
    },
  },
  {
    screen: 'tenant-courier-card',
    path: RAHIM_PAGE,
    then: (page) =>
      page
        .getByRole('button', { name: /^(Open the log|লগ খুলুন)$/ })
        .last()
        .scrollIntoViewIfNeeded(),
  },
  { screen: 'tenant-courier-log', path: `${RAHIM_PAGE}/courier-keys` },
  { screen: 'p37-notices', path: '/notices', state: P7 },
  {
    screen: 'p37-notice-start',
    path: '/notices',
    state: P7,
    then: startWith('Maintenance', 'মেইনটেন্যান্স'),
  },
  {
    screen: 'p37-notice-start-rate',
    path: '/notices',
    state: P7,
    then: startWith('Rate change', 'রেট বদল'),
  },
  { screen: 'p37-notice-new', path: MAINTENANCE, state: P7, then: sketchMaintenance },
  {
    screen: 'p37-notice-new-en',
    path: MAINTENANCE,
    state: P7,
    then: async (page) => {
      await sketchMaintenance(page);
      await languageTab('English')(page);
    },
  },
  {
    screen: 'p37-notice-publish',
    path: MAINTENANCE,
    state: P7,
    then: async (page) => {
      await sketchMaintenance(page);
      await press('Schedule…', 'শিডিউল…')(page);
    },
  },
  {
    screen: 'p37-notice-just-scheduled',
    path: MAINTENANCE,
    state: P7,
    then: async (page) => {
      await sketchMaintenance(page);
      await press('Schedule…', 'শিডিউল…')(page);
      await confirm(page);
    },
  },
  {
    screen: 'p37-notice-outage',
    path: '/notices/new?template=outage',
    state: P7,
    then: languageTab('English'),
  },
  {
    screen: 'p37-notice-publish-now',
    path: '/notices/new?template=outage',
    state: P7,
    then: async (page) => {
      await languageTab('English')(page);
      await press('Publish…', 'পাবলিশ…')(page);
    },
  },
  {
    screen: 'p37-notice-published',
    path: '/notices/new?template=outage',
    state: P7,
    then: async (page) => {
      await press('Publish…', 'পাবলিশ…')(page);
      await confirm(page);
    },
  },
  {
    screen: 'p37-notice-drafted',
    path: '/notices/n-15',
    state: P7,
    then: press('Save draft', 'ড্রাফট সেভ করুন'),
  },
  { screen: 'p37-notice-scheduled', path: '/notices/n-14', state: P7 },
  { screen: 'p37-notice-draft', path: '/notices/n-15', state: P7 },
  { screen: 'p37-notice-live', path: '/notices/n-11', state: P7 },
  { screen: 'p37-notice-version', path: '/notices/n-11', state: P7, then: press('Show', 'দেখুন') },
  { screen: 'p37-notice-edit-live', path: '/notices/n-11/edit', state: P7 },
  {
    screen: 'p37-notice-saved',
    path: '/notices/n-11/edit',
    state: P7,
    then: press('Save changes', 'বদল সেভ করুন'),
  },
  { screen: 'p37-notice-acks', path: '/notices/n-11/acknowledgments', state: P7 },
  {
    screen: 'p37-notice-acks-done',
    path: '/notices/n-11/acknowledgments',
    state: P7,
    then: chip('Said I understand', 'বুঝেছি বলেছে'),
  },
  { screen: 'p37-notice-rate', path: '/notices/n-13', state: P7_LINKED },
  { screen: 'p37-notice-feature', path: '/notices/n-12', state: P7 },
  {
    screen: 'p37-notice-withdraw',
    path: '/notices/n-12',
    state: P7,
    then: press('Withdraw', 'উইথড্র'),
  },
  {
    screen: 'p37-notice-withdrawn-now',
    path: '/notices/n-12',
    state: P7,
    then: async (page) => {
      await press('Withdraw', 'উইথড্র')(page);
      await confirm(page);
    },
  },
  { screen: 'p37-notice-withdrawn', path: '/notices/n-9', state: P7 },
  { screen: 'p37-notice-ended', path: '/notices/n-10', state: P7 },
  {
    screen: 'p37-notice-refused-empty',
    path: '/notices/new',
    state: P7,
    then: press('Save draft', 'ড্রাফট সেভ করুন'),
  },
  { screen: 'p37-notice-refused-long', path: '/notices/new', state: P7, then: tooLong },
  { screen: 'p37-notice-from-rate', path: '/notices/new?rateChange=41', state: P7 },
  { screen: 'p37-rate-offer', path: '/rates', state: SMS_AT_55, then: saveSmsRate },
  { screen: 'p37-rate-history', path: '/rates?history=sms_per_unit', state: P7 },
  {
    screen: 'p37-rate-linked',
    path: '/notices/new?rateChange=41',
    state: P7,
    then: publishRateNotice,
  },
  { screen: 'p37-settings', path: '/settings', state: P7, then: toGroup('Couriers', 'কুরিয়ার') },
  {
    screen: 'p37-setting-provider',
    path: '/settings',
    state: P7,
    then: changeSetting(READING, ['The AI that reads', 'যে AI পড়ে']),
  },
  {
    screen: 'p37-setting-model',
    path: '/settings',
    state: P7,
    then: changeSetting(READING, ['Its model', 'মডেল']),
  },
  {
    screen: 'p37-setting-fraud',
    path: '/settings',
    state: P7,
    then: changeSetting(FRAUD, FRAUD_CHECKS),
  },
  {
    screen: 'p37-setting-retention',
    path: '/settings',
    state: P7,
    then: changeSetting(FRAUD, ['A notification is kept for', 'নোটিফিকেশন থাকে']),
  },
  {
    screen: 'p37-setting-refused',
    path: '/settings',
    state: P7,
    then: async (page) => {
      await changeSetting(FRAUD, FRAUD_CHECKS)(page);
      await page.locator('main input[name=value]').fill('0');
      await page.locator('main [name=reason]').fill('Too many checks');
      await page.locator('main form button[type=submit]').click();
    },
  },
  { screen: 'p37-addons', path: '/addons', state: P7 },
  {
    screen: 'p37-addon-allowance',
    path: '/addons',
    state: P7,
    then: (page) =>
      page
        .locator('main')
        .getByText(/^(Address reads from messages|মেসেজ থেকে ঠিকানা পড়া)$/)
        .click(),
  },
  {
    screen: 'p37-addon-allowance-new',
    path: '/addons',
    state: P7,
    then: async (page) => {
      await press('New item', 'নতুন আইটেম')(page);
      await page.locator('dialog select[name=kind]').selectOption('allowance');
    },
  },
  { screen: 'p37-addon-allowance-taken', path: '/addons', state: P7, then: takenAllowance },
  { screen: 'p37-told-approve', path: '/queue/pay-9101?step=approve' },
  { screen: 'p37-told-revoke', path: RAHIM_PAGE, then: press('Revoke', 'ক্যানসেল') },
  { screen: 'p37-told-block', path: RAHIM_PAGE, then: press('Block', 'ব্লক') },
  // Phase 8 Slice 8.8 (v7): the settings' help line and media costs.
  ...P88_SETTINGS_PAIRS,
  // Phase 8 Slice 8.8 (v7): the shops list's filters and a shop's figures, extend, owner reset and delete.
  ...P88_SHOPS_PAIRS,
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
