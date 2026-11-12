import type { Page } from '@playwright/test';
import { burka, burkaOrders, withBurka } from './support/designs';
import type { Language, ShopState } from './support/mock-api';
import { drawnProducts } from './support/products';

// TENANT-DASHBOARD-DESIGN §7.42 (Part 40, photo designs): each pair a screen of the sketch's "Photo designs" group beside
// the dashboard showing the same, over the sketch's burka: its photos as its designs, a photo's own step, removing,
// a product with orders, the variants, the pickers by photo, the order and its label. compare.spec.ts takes these.

export interface P40Pair {
  name: string;
  screen: string;
  device: 'phone' | 'desktop';
  language: Language;
  path: string;
  state?: ShopState;
  then?: (page: Page) => Promise<void>;
  scroll?: RegExp;
}

/** The shop with the burka, its design names in the pair's language. */
const shop = (language: Language): ShopState => ({ products: withBurka(burka({}, language)) });

const tap = (name: string | RegExp) => async (page: Page) => {
  await page.getByRole('button', { name }).first().click();
};

/** The photos sheet, then a button in it. */
const inSheet = (name: string | RegExp) => async (page: Page) => {
  await page.getByRole('main').getByRole('button', { name: 'ছবি 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name }).first().click();
};

/** The T-shirt, which has orders and no designs, with a photo just added. */
async function orderedWithNewPhoto(page: Page): Promise<void> {
  await page
    .getByRole('main')
    .locator('input[type=file][accept^="image"]')
    .first()
    .setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: Buffer.alloc(2048, 1) });
  await page.getByRole('main').getByRole('button', { name: 'ছবি 4' }).waitFor();
  await page.getByRole('main').getByRole('button', { name: 'ছবি 1' }).click();
}

function ordered(): ShopState {
  const products = drawnProducts();
  const [shirt] = products.products;
  if (shirt) shirt.hasOrders = true;
  return { products };
}

export function p40Pairs(): P40Pair[] {
  const bn = (screen: string, path: string, more: Partial<P40Pair> = {}): P40Pair => ({
    name: screen,
    screen,
    device: 'phone',
    language: 'bn',
    path,
    state: shop('bn'),
    ...more,
  });
  return [
    bn('pd-product', '/products/p-burka'),
    {
      ...bn('pd-product', '/products/p-burka'),
      device: 'desktop',
      language: 'en',
      state: shop('en'),
      scroll: /^Options and variants$/,
    },
    bn('pd-photos', '/products/p-burka', { then: tap('ছবি 1') }),
    bn('pd-photo', '/products/p-burka', { then: inSheet('ছবি 3: স্ট্রাইপ') }),
    bn('pd-photo-own', '/products/p-burka', {
      // Stripe's second photo made its own design, then its step opened again.
      then: async (page) => {
        await inSheet('ছবি 3: স্ট্রাইপ')(page);
        await page
          .getByRole('dialog')
          .getByRole('radio', { name: /^আলাদা ডিজাইন/ })
          .click();
      },
    }),
    bn('pd-photos-ordered', '/products/p-1', { state: ordered(), then: orderedWithNewPhoto }),
    bn('pd-photo-locked', '/products/p-1', {
      state: ordered(),
      then: async (page) => {
        await orderedWithNewPhoto(page);
        await page.getByRole('dialog').getByRole('button', { name: 'ছবি 4: সাধারণ ছবি' }).click();
      },
    }),
    bn('pd-photos-kept', '/products/p-burka', {
      state: { products: { ...withBurka(burka({}, 'bn')), pastOrders: { 'm-3': 12 } } },
      then: inSheet('ছবি 3 সরান'),
    }),
    bn('dlg-pd-retire', '/products/p-burka', { then: inSheet('ছবি 1 সরান') }),
    bn('pd-variant', '/products/p-burka', { then: tap(/স্ট্রাইপ · 54/) }),
    bn('pd-add-variant', '/orders/new', {
      then: async (page) => {
        await page.getByRole('main').getByRole('button', { name: 'আইটেম যোগ করুন' }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^ইরানি বোরকা/ })
          .click();
      },
    }),
    bn('pd-combo-part', '/products/new', {
      then: async (page) => {
        await page.getByRole('main').getByRole('radio', { name: 'কম্বো প্যাক' }).click();
        await page.getByRole('main').getByRole('button', { name: 'আইটেম যোগ করুন' }).click();
        await page
          .getByRole('dialog', { name: 'কোন প্রোডাক্ট?' })
          .getByRole('button', { name: /^ইরানি বোরকা/ })
          .click();
      },
    }),
    {
      ...bn('pd-order', '/orders/o-47'),
      device: 'desktop',
      state: { ...shop('bn'), orders: burkaOrders() },
      scroll: /^আইটেম$/,
    },
    bn('pd-print', '/orders/o-47', {
      state: { ...shop('bn'), orders: burkaOrders() },
      then: async (page) => {
        await page
          .getByRole('main')
          .getByRole('button', { name: /^অর্ডার #/ })
          .click();
        await page.getByRole('dialog').getByRole('button', { name: 'লেবেল প্রিন্ট' }).click();
      },
    }),
  ];
}
