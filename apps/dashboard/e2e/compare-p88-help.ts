import type { Page } from '@playwright/test';
import { BILLING_STAFF } from './support/menu';
import type { ShopState } from './support/mock-api';
import {
  DRAWN_HELP_LINE,
  NIGHT_IN_DHAKA,
  NOON_IN_DHAKA,
  serverFault,
  type Fault,
} from './support/p88-help-mock';

// Slice 8.8 (Part 39): the help line in the Menu and the error ID on a server fault, each beside the prototype's drawing
// (TENANT-DASHBOARD-DESIGN §7.41). The shape is compare.spec.ts's Pair, which wires these in.

type Device = 'phone' | 'tablet' | 'desktop';
type Language = 'bn' | 'en';

export interface P88HelpPair {
  name: string;
  screen: string;
  device: Device;
  language: Language;
  path: string;
  state?: ShopState;
  before?: (page: Page) => Promise<void>;
  then?: (page: Page) => Promise<void>;
}

/** The drawings' moment: noon in Dhaka, the help line open; or late at night, closed. */
const at =
  (moment: Date) =>
  async (page: Page): Promise<void> => {
    await page.clock.setFixedTime(moment);
  };

const openHelp = async (page: Page): Promise<void> => {
  await page
    .getByRole('main')
    .getByRole('button', { name: /^(হেল্প|Help)/ })
    .click();
};

const faulty = (language: Language, ...faults: Fault[]): ShopState => ({ faults, language });

/** A read the server failed shows once the dashboard stops retrying it (a few seconds). */
const failedToLoad = async (page: Page): Promise<void> => {
  await page.getByRole('alert').first().waitFor({ timeout: 20_000 });
};

const PRODUCT_SAVE = /^\/products\/p-1$/;

/** Changes the product's name and saves it, which the server answers as the pair sets. */
const saveProduct = async (page: Page): Promise<void> => {
  await page.getByRole('main').getByLabel('নাম', { exact: true }).fill('কটন টি-শার্ট নতুন');
  await page.getByRole('button', { name: 'সেভ করুন' }).first().click();
  await page.getByRole('alert').first().waitFor();
};

export function p88HelpPairs(): P88HelpPair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<P88HelpPair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): P88HelpPair => ({
    name,
    screen: name,
    device,
    language,
    path,
    before: at(NOON_IN_DHAKA),
    ...more,
  });
  const productsDown = (language: Language) =>
    faulty(language, serverFault('GET', /^\/products$/, language));
  return [
    // The Menu's Help row, open now, and Lytro support's sheet (D8-4, D8-67 to D8-69).
    one('p88-menu', '/menu'),
    one('p88-menu', '/menu', {}, 'desktop', 'en'),
    one('p88-help', '/menu', { then: openHelp }),
    one('p88-help', '/menu', { then: openHelp }, 'desktop', 'en'),
    one('p88-help-closed', '/menu', { before: at(NIGHT_IN_DHAKA), then: openHelp }),
    one('p88-help-wa', '/menu', {
      state: { helpLine: { ...DRAWN_HELP_LINE, phone: null } },
      then: openHelp,
    }),
    one('p88-help-phone', '/menu', {
      state: { helpLine: { ...DRAWN_HELP_LINE, whatsapp: null } },
      then: openHelp,
    }),
    one('p88-menu-nohelp', '/menu', {
      state: { helpLine: { ...DRAWN_HELP_LINE, whatsapp: null, phone: null } },
    }),
    one('p88-menu-staff', '/menu', { state: BILLING_STAFF }),
    // The error ID on a server fault (API-27, D8-21).
    one('p88-err-load', '/products', { state: productsDown('bn'), then: failedToLoad }),
    one(
      'p88-err-load',
      '/products',
      { state: productsDown('en'), then: failedToLoad },
      'desktop',
      'en',
    ),
    one('p88-err-copied', '/products', {
      state: productsDown('bn'),
      then: async (page) => {
        await failedToLoad(page);
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.getByRole('button', { name: 'কপি' }).click();
      },
    }),
    one('p88-help-id', '/products', {
      state: productsDown('bn'),
      then: async (page) => {
        await failedToLoad(page);
        await page.getByRole('button', { name: 'WhatsApp-এ পাঠান' }).click();
      },
    }),
    one('p88-err-save', '/products/p-1', {
      state: faulty('bn', serverFault('PATCH', PRODUCT_SAVE, 'bn')),
      then: saveProduct,
    }),
    one('p88-err-busy', '/products/p-1', {
      state: faulty('bn', serverFault('PATCH', PRODUCT_SAVE, 'bn', 503)),
      then: saveProduct,
    }),
    one('p88-err-refused', '/products/p-1', {
      state: faulty('bn', {
        method: 'PATCH',
        path: PRODUCT_SAVE,
        status: 409,
        code: 'conflict',
        message: 'অন্য একটি প্রোডাক্ট এই লিংক ব্যবহার করছে। অন্য একটি বেছে নিন।',
        requestId: 'K7MQ-4XR2',
      }),
      then: saveProduct,
    }),
    one('p88-err-sheet', '/orders/o-44', {
      state: faulty('bn', serverFault('POST', /^\/orders\/o-44\/payments$/, 'bn')),
      then: async (page) => {
        await page.getByRole('button', { name: 'পেমেন্ট রেকর্ড করুন' }).click();
        const sheet = page.getByRole('dialog');
        await sheet.getByRole('button', { name: 'bKash' }).click();
        await sheet.getByLabel('টাকা').fill('500');
        await sheet.getByLabel('যে নম্বর থেকে পাঠিয়েছেন').fill('1819876543');
        await sheet.getByLabel('TrxID').fill('9F2KQ7M1');
        await sheet.getByRole('button', { name: 'সেভ করুন' }).click();
        await sheet.getByRole('alert').waitFor();
      },
    }),
  ];
}
