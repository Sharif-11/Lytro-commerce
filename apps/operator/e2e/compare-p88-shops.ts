import type { Page } from '@playwright/test';
import type { ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN v7 (Phase 8 Slice 8.8): the shop list's filters and the shop page's figures and actions, each
// beside the sketch's drawing of it. compare.spec.ts runs these with its own pairs.

type Device = 'phone' | 'tablet' | 'desktop';

export interface ShopsPair {
  screen: string;
  bare?: boolean;
  path: string;
  state?: ConsoleState;
  then?: (page: Page) => Promise<void>;
  only?: Device[];
}

const RAHIM = '/shops/ten-0001';
const SADIA = '/shops/ten-0019';
const KEYA = '/shops/ten-0028';
const REASON = 'The owner asked on the phone; checked their name and last payment.';

/** A button by its English or Bangla words. */
function press(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .getByRole('button', { name: new RegExp(`^(${en}|${bn})`) })
      .first()
      .click();
}

/** One of the shop page's figures, by the words it opens with. */
function figure(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .locator('main button')
      .filter({ hasText: new RegExp(`^(${en}|${bn})`) })
      .first()
      .click();
}

function steps(...each: ((page: Page) => Promise<void>)[]): (page: Page) => Promise<void> {
  return async (page) => {
    for (const step of each) await step(page);
  };
}

function fill(name: string, value: string): (page: Page) => Promise<void> {
  return (page) => page.locator(`dialog [name=${name}]`).fill(value);
}

const extend = press('Extend', 'মেয়াদ বাড়ান');
const reset = press('Reset sign-in', 'লগইন রিসেট');
const remove = press('Delete data', 'ডেটা ডিলিট');
const reason = fill('reason', REASON);

function send(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .locator('dialog')
      .getByRole('button', { name: new RegExp(`^(${en}|${bn})$`) })
      .click();
}

const sendExtend = send(String.raw`Extend by \d+ days`, String.raw`\d+ দিন বাড়ান`);
const sendReset = send('Sign out and send the code', 'সাইন আউট করে কোড পাঠান');
const sendDelete = send('Delete the data', 'ডেটা ডিলিট করুন');

/** The page back at its top under an open panel, as the sketch draws it, after a click scrolled it to a button. */
async function top(page: Page): Promise<void> {
  await page.locator('main').evaluate((element) => {
    element.scrollTop = 0;
  });
}

const PAIRS: ShopsPair[] = [
  { screen: 'p88-shops-filtered', path: '/shops?planId=p-starter&sort=period_end' },
  { screen: 'p88-shops-phone', path: '/shops?q=345678' },
  { screen: 'p88-tenant', path: RAHIM },
  { screen: 'p88-tenant-grace', path: SADIA },
  { screen: 'p88-tenant-locked', path: KEYA },
  { screen: 'p88-shop-errors', path: RAHIM, then: figure('Server errors', 'সার্ভার এরর') },
  { screen: 'p88-shop-sms', path: RAHIM, then: figure("SMS that didn't go", 'যে SMS যায়নি') },
  {
    screen: 'p88-shop-courier',
    path: RAHIM,
    then: figure('Failed courier calls', 'ফেইলড কুরিয়ার কল'),
  },
  { screen: 'p88-shop-waiting', path: RAHIM, then: figure('Waiting for you', 'আপনার অপেক্ষায়') },
  { screen: 'p88-shop-sales', path: RAHIM, then: press('Open sales', 'সেলস দেখুন') },
  { screen: 'p88-extend', path: RAHIM, then: steps(extend, fill('days', '14')) },
  {
    screen: 'p88-extended',
    path: RAHIM,
    then: steps(extend, fill('days', '14'), reason, sendExtend),
  },
  { screen: 'p88-extend-lapsed', path: SADIA, then: extend },
  { screen: 'p88-extended-lapsed', path: SADIA, then: steps(extend, reason, sendExtend) },
  { screen: 'p88-extend-ended', path: KEYA, then: extend },
  { screen: 'p88-owner-reset', path: RAHIM, then: reset },
  {
    screen: 'p88-owner-reset-new',
    path: RAHIM,
    then: steps(reset, fill('phone', '+880 1819-445566')),
  },
  {
    screen: 'p88-owner-reset-taken',
    path: RAHIM,
    then: steps(reset, fill('phone', '01611 223300'), reason, sendReset),
  },
  { screen: 'p88-owner-reset-done', path: RAHIM, then: steps(reset, reason, sendReset) },
  { screen: 'p88-delete', path: RAHIM, then: steps(remove, fill('address', 'rahim-fashion')) },
  { screen: 'p88-delete-empty', path: RAHIM, then: remove },
  {
    screen: 'p88-delete-wrong',
    path: RAHIM,
    then: steps(remove, fill('address', 'rahim-fashions')),
  },
  {
    screen: 'p88-deleted',
    path: RAHIM,
    then: steps(remove, fill('address', 'rahim-fashion'), reason, sendDelete),
  },
];

export const P88_SHOPS_PAIRS: ShopsPair[] = PAIRS.map((pair) => {
  const then = pair.then;
  return then ? { ...pair, then: steps(then, top) } : pair;
});
