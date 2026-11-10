import type { Page } from '@playwright/test';
import type { ConsoleState } from './support/mock-api';
import { upayRetiring, withBankAccount } from './support/p88-money-mock';

// OPERATOR-CONSOLE-DESIGN v7 (Phase 8 Slice 8.8): manual entries, the queue's screenshot and wallet types, each beside the
// sketch's drawing of it. compare.spec.ts runs them as it runs its own pairs.

export interface MoneyPair {
  screen: string;
  bare?: boolean;
  path: string;
  state?: ConsoleState;
  then?: (page: Page) => Promise<void>;
  only?: ('phone' | 'tablet' | 'desktop')[];
}

const MONEY: ConsoleState = { paymentMethods: withBankAccount() };

/** A button by its English or Bangla words. */
function press(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .getByRole('button', { name: new RegExp(`^(${en}|${bn})`) })
      .first()
      .click();
}

const sheet = (page: Page) => page.getByRole('dialog');

/** Opens Record a payment and picks the shop by its name. */
async function recordFor(page: Page, shopName: string): Promise<void> {
  await press('Record a payment', 'পেমেন্ট রেকর্ড করুন')(page);
  await sheet(page).locator('input[type=search]').fill(shopName.slice(0, 5));
  await sheet(page)
    .getByRole('button', { name: new RegExp(`^${shopName}`) })
    .click();
}

/** A screenshot sent, as the sketch draws one: bkash-sadia-1019.jpg, 412 KB. */
async function attach(page: Page): Promise<void> {
  await sheet(page)
    .locator('input[type=file]')
    .setInputFiles({
      name: 'bkash-sadia-1019.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(412 * 1024, 1),
    });
  await sheet(page).getByText('bkash-sadia-1019.jpg').waitFor();
}

async function fill(page: Page, name: string, value: string): Promise<void> {
  await sheet(page).locator(`[name=${name}]`).fill(value);
}

/** A renewal of Sadia Collection's Starter for a month, paid to bKash, with its screenshot. */
async function planEntry(page: Page, trx = 'BKH4P2L9K7'): Promise<void> {
  await recordFor(page, 'Sadia Collection');
  await sheet(page).locator('select[name=planId]').selectOption('p-starter');
  await sheet(page).locator('select[name=billingTermId]').selectOption('t1');
  await fill(page, 'transactionId', trx);
  await fill(page, 'senderNumber', '01815 345678');
  await fill(page, 'paidAt', '2026-10-19T10:01');
  await attach(page);
}

/** A top-up for Mehedi Books, with its statement line. */
async function topUp(page: Page, amount: string): Promise<void> {
  await recordFor(page, 'Mehedi Books');
  await sheet(page)
    .getByText(/^(A top-up|টপ-আপ)$/)
    .click();
  await fill(page, 'amount', amount);
  await fill(page, 'transactionId', 'BKH9Q4L7M2');
  await fill(page, 'senderNumber', '01911 445566');
  await fill(page, 'paidAt', '2026-10-20T18:42');
  await fill(page, 'evidenceLine', '20/10/2026 18:42 Cash In 2,000.00 01911445566 BKH9Q4L7M2');
}

/** Tanvir Mobiles' Growth for six months, paid to Lytro's bank account. */
async function bankEntry(page: Page): Promise<void> {
  await recordFor(page, 'Tanvir Mobiles');
  await sheet(page).locator('select[name=planId]').selectOption('p-growth');
  await sheet(page).locator('select[name=billingTermId]').selectOption('t6');
  await sheet(page)
    .getByText(/^(Lytro's bank account|Lytro-র ব্যাংক অ্যাকাউন্টে)$/)
    .click();
  await fill(page, 'transactionId', 'BRAC-FT-55190327');
  await fill(page, 'paidAt', '2026-10-21T11:30');
  await fill(
    page,
    'evidenceLine',
    '21-10-2026 BEFTN CR 3,984.00 TANVIR MOBILES REF BRAC-FT-55190327',
  );
}

async function reasonAndRecord(page: Page): Promise<void> {
  await fill(page, 'reason', 'Sent at 9 pm with no phone online');
  await sheet(page)
    .getByRole('button', { name: /^(Record|.*রেকর্ড করুন$)/ })
    .last()
    .click();
}

/** Opens an entry by its shop's name in the list. */
function entryOf(shopName: string, index = 0): (page: Page) => Promise<void> {
  return (page) => page.locator('main').getByRole('button', { name: shopName }).nth(index).click();
}

/** A panel's own top, as the sketch draws it, with nothing focused. */
async function toTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    for (const each of document.querySelectorAll('dialog .overflow-auto')) each.scrollTop = 0;
  });
}

function thenAll(...steps: ((page: Page) => Promise<void>)[]): (page: Page) => Promise<void> {
  return async (page) => {
    for (const step of steps) await step(page);
    await toTop(page);
  };
}

const REVERSE = press('Reverse', 'রিভার্স');

async function reverseWithReason(page: Page): Promise<void> {
  await fill(page, 'reason', 'Recorded against the wrong shop');
  await sheet(page)
    .getByRole('button', { name: /^(Reverse ৳|৳.*রিভার্স করুন)/ })
    .click();
}

/** A button on Upay's row of the wallet types. */
function onUpay(en: string, bn: string): (page: Page) => Promise<void> {
  return (page) =>
    page
      .locator('main section > div', { hasText: 'Upay' })
      .getByRole('button', { name: new RegExp(`^(${en}|${bn})$`) })
      .click();
}

async function withReason(page: Page, en: string, bn: string): Promise<void> {
  await fill(page, 'reason', 'No shop has asked for it in a year');
  await sheet(page)
    .getByRole('button', { name: new RegExp(`^(${en}|${bn})`) })
    .last()
    .click();
}

const RETIRING: ConsoleState = { walletTypes: upayRetiring() };
const CLEAR: ConsoleState = { walletTypes: upayRetiring(true) };

export const P88_MONEY_PAIRS: MoneyPair[] = [
  { screen: 'p88-manual', path: '/manual', state: MONEY },
  {
    screen: 'p88-manual-new',
    path: '/manual',
    state: MONEY,
    then: thenAll((page) => planEntry(page)),
  },
  {
    screen: 'p88-manual-topup',
    path: '/manual',
    state: MONEY,
    then: thenAll((page) => topUp(page, '2000')),
  },
  {
    screen: 'p88-manual-confirm',
    path: '/manual',
    state: MONEY,
    then: thenAll((page) => topUp(page, '12000')),
  },
  {
    screen: 'p88-manual-trx-used',
    path: '/manual',
    state: MONEY,
    then: thenAll((page) => planEntry(page), reasonAndRecord),
  },
  { screen: 'p88-manual-bank', path: '/manual', state: MONEY, then: thenAll(bankEntry) },
  {
    screen: 'p88-manual-ref-used',
    path: '/manual',
    state: MONEY,
    then: thenAll(bankEntry, reasonAndRecord),
  },
  {
    screen: 'p88-manual-changed',
    path: '/manual',
    state: { ...MONEY, priceNow: '479.00' },
    then: thenAll((page) => planEntry(page, 'BKH7Z2Q8R1'), reasonAndRecord),
  },
  {
    screen: 'p88-manual-recorded',
    path: '/manual',
    state: MONEY,
    then: thenAll((page) => planEntry(page, 'BKH7Z2Q8R1'), reasonAndRecord),
  },
  {
    screen: 'p88-manual-entry',
    path: '/manual',
    state: MONEY,
    then: entryOf('Sadia Collection'),
  },
  {
    screen: 'p88-manual-entry-line',
    path: '/manual',
    state: MONEY,
    then: entryOf('Mehedi Books'),
  },
  {
    screen: 'p88-manual-entry-bank',
    path: '/manual',
    state: MONEY,
    then: entryOf('Tanvir Mobiles'),
  },
  {
    screen: 'p88-manual-entry-gone',
    path: '/manual',
    state: { ...MONEY, now: '2028-10-21T14:30:00+06:00' },
    then: entryOf('Sadia Collection'),
  },
  {
    screen: 'p88-manual-entry-reversed',
    path: '/manual',
    state: MONEY,
    then: entryOf('Arif Electronics', 1),
  },
  {
    screen: 'p88-manual-shot',
    path: '/manual',
    state: MONEY,
    then: thenAll(entryOf('Sadia Collection'), press('Open the screenshot', 'স্ক্রিনশট খুলুন')),
  },
  {
    screen: 'p88-manual-reverse',
    path: '/manual',
    state: MONEY,
    then: thenAll(entryOf('Sadia Collection'), REVERSE),
  },
  {
    screen: 'p88-manual-reverse-topup',
    path: '/manual',
    state: MONEY,
    then: thenAll(entryOf('Mehedi Books'), REVERSE),
  },
  {
    screen: 'p88-manual-reverse-moved',
    path: '/manual',
    state: { ...MONEY, planMovedOn: true },
    then: thenAll(entryOf('Sadia Collection'), REVERSE, reverseWithReason),
  },
  {
    screen: 'p88-manual-reversed',
    path: '/manual',
    state: MONEY,
    then: thenAll(entryOf('Sadia Collection'), REVERSE, reverseWithReason),
  },
  { screen: 'p88-queue-payment', path: '/queue/pay-9101' },
  { screen: 'p88-queue-shot', path: '/queue/pay-9101?step=screenshot' },
  { screen: 'p88-types', path: '/wallet-types' },
  { screen: 'p88-type-retire', path: '/wallet-types', then: onUpay('Retire', 'রিটায়ার') },
  {
    screen: 'p88-types-retiring',
    path: '/wallet-types',
    then: thenAll(onUpay('Retire', 'রিটায়ার'), (page) =>
      withReason(page, 'Retire Upay', 'Upay রিটায়ার করুন'),
    ),
  },
  {
    screen: 'p88-type-undo',
    path: '/wallet-types',
    state: RETIRING,
    then: onUpay('Undo retiring', 'রিটায়ার বাতিল'),
  },
  {
    screen: 'p88-types-undone',
    path: '/wallet-types',
    state: RETIRING,
    then: thenAll(onUpay('Undo retiring', 'রিটায়ার বাতিল'), (page) =>
      withReason(page, 'Undo retiring', 'রিটায়ার বাতিল করুন'),
    ),
  },
  {
    screen: 'p88-type-remove-blocked',
    path: '/wallet-types',
    state: RETIRING,
    then: onUpay('Remove', 'রিমুভ'),
  },
  { screen: 'p88-types-clear', path: '/wallet-types', state: CLEAR },
  {
    screen: 'p88-type-remove',
    path: '/wallet-types',
    state: CLEAR,
    then: onUpay('Remove', 'রিমুভ'),
  },
  {
    screen: 'p88-types-removed',
    path: '/wallet-types',
    state: CLEAR,
    then: thenAll(onUpay('Remove', 'রিমুভ'), (page) =>
      withReason(page, 'Remove Upay', 'Upay রিমুভ করুন'),
    ),
  },
];
