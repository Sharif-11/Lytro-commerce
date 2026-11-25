import type { Page } from '@playwright/test';
import { burka, withBurka } from './support/designs';
import type { Language, ShopState } from './support/mock-api';
import { productOrders } from './support/orders';

// TENANT-DASHBOARD-DESIGN §7.4c (the owner, 2026-11-25): each pair a screen of the sketch's "Products · share link and
// product page" group beside the dashboard showing the same, over the drawn shop (the sketch's own sample is a kurti
// shop; the screens are the same). compare.spec.ts takes these.

export interface PdSharePair {
  name: string;
  screen: string;
  device: 'phone' | 'desktop';
  language: Language;
  path: string;
  state?: ShopState;
  before?: (page: Page) => Promise<void>;
  then?: (page: Page) => Promise<void>;
}

/** The drawn shop with the T-shirt's four orders, the burka's designs and the saree made to order. */
function shop(language: Language): ShopState {
  const products = withBurka(burka({}, language));
  const saree = products.products.find((each) => each.id === 'p-3');
  if (saree) saree.stockTracking = 'not_tracked';
  return { products, orders: productOrders('p-1') };
}

/** A clipboard the page can write to, whatever the headless browser allows. */
async function clipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
}

/** The row's share icon, by the product's name. */
const shareRow = (name: string) => async (page: Page) => {
  await page
    .getByRole('main')
    .getByRole('button', { name: new RegExp(name) })
    .click();
};

const tap = (name: string | RegExp) => async (page: Page) => {
  await page.getByRole('main').getByRole('button', { name }).first().click();
};

export function pdSharePairs(): PdSharePair[] {
  const bn = (screen: string, path: string, more: Partial<PdSharePair> = {}): PdSharePair => ({
    name: screen,
    screen,
    device: 'phone',
    language: 'bn',
    path,
    state: shop('bn'),
    ...more,
  });
  return [
    bn('pl-share-row', '/products'),
    bn('pl-share-sheet', '/products', { then: shareRow('কটন টি-শার্ট') }),
    bn('pl-share-design', '/products', {
      then: async (page) => {
        await shareRow('ইরানি বোরকা')(page);
        await page.getByRole('dialog').getByRole('radio', { name: 'স্ট্রাইপ' }).click();
      },
    }),
    bn('pl-share-copied', '/products', {
      before: clipboard,
      then: async (page) => {
        await shareRow('কটন টি-শার্ট')(page);
        await page.getByRole('dialog').getByRole('button', { name: 'লিংক কপি করুন' }).click();
      },
    }),
    bn('pl-share-paused', '/products', {
      state: { ...shop('bn'), state: 'pay_as_you_go', fairUse: { paused: true } },
      then: shareRow('কটন টি-শার্ট'),
    }),
    bn('pl-share-wide', '/products', { device: 'desktop', then: shareRow('কটন টি-শার্ট') }),
    bn('pd-detail', '/products/p-1'),
    bn('pd-detail-designs', '/products/p-burka'),
    bn('pd-made', '/products/p-3'),
    bn('pd-menu', '/products/p-1', { then: tap('আরও') }),
    bn('pd-delete', '/products/p-1', {
      then: async (page) => {
        await tap('আরও')(page);
        await page.getByRole('dialog').getByRole('button', { name: 'ডিলিট' }).click();
      },
    }),
    bn('pd-archived', '/products/p-7'),
    bn('pd-share', '/products/p-1', { then: tap(/^শেয়ার$/) }),
    bn('pd-wide', '/products/p-burka', { device: 'desktop' }),
  ];
}
