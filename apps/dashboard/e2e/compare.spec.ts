import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type Locator, type Page } from '@playwright/test';
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
import { drawnActivity } from './support/activity';
import { BILLING_STAFF, offerInstall, onAnIphone } from './support/menu';
import { drawnIdentities } from './support/account';
import { emptyMeta } from './support/meta';
import { drawnExports, drawnSettings } from './support/settings';
import { brandImage, drawnBrand, type BrandFixture } from './support/brand';
import { BrandCorners, BrandFont, BrandSpacing } from '@lytronix/validators';
import { sketchedAttributes } from './support/attributes';
import { drawnProducts, manyProducts, type ProductsFixture } from './support/products';
import {
  creamShop,
  expiringShop,
  galaxyShop,
  phoneShop,
  SAMPLE_IMEIS,
  stockShop,
} from './support/stock';
import { drawnLibrary } from './support/variants';
import { drawnPurchases, drawnSuppliers, otherStates } from './support/purchases';
import { drawnDelivery, type DeliveryFixture } from './support/delivery';
import { drawnPasswords, drawnTeam } from './support/team';
import { indigoBrand, maroonBrand } from './support/themed';
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
  /** What to set in the app before it loads (an iPhone's browser). */
  before?: (page: Page) => Promise<void>;
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
  /** A heading both pictures are scrolled to, for a card below the first screen (the options and variants). */
  scroll?: RegExp;
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
      await page.getByText('শপ বন্ধ করা').click();
      await click('শপ বন্ধ করুন')(page);
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
  ...menuPairs(),
  ...teamPairs(),
  ...settingsPairs(),
  ...productPairs(),
];

/**
 * Products (§7.3, Slice 11.7a): the list, the category filter, a filtered list, nothing matching, more than 20,
 * Archived, the limit before typing, and a new shop's empty list (Part 13 for the states the earlier parts left undrawn).
 */
function productPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  const full: ShopState = {
    products: { ...manyProducts(6), limit: 6 },
    money: { usage: { used: { products: 6 }, limits: { products: 6 } } },
  };
  return [
    one('products', '/products'),
    one('products', '/products', {}, 'desktop', 'en'),
    one('sh-products-filter', '/products', {
      then: async (page) => {
        await page.getByRole('button', { name: 'ক্যাটাগরি দিয়ে ফিল্টার' }).click();
      },
    }),
    one('products-filtered', '/products?cat=c-tshirts'),
    one('products-none', `/products?q=${encodeURIComponent('পাঞ্জাবি')}&seg=low`),
    one('products-none', '/products?q=panjabi&seg=low', {}, 'desktop', 'en'),
    one('products-more', '/products', { state: { products: manyProducts(46) } }),
    one('products-archived', '/products?seg=archived'),
    one('products-limit-now', '/products?limit=true', { state: full }),
    one('products-limit-now', '/products?limit=true', { state: full }, 'desktop', 'en'),
    {
      ...one('products', '/products', {
        shop: { drawn: 'new', state: { ...DAY_ONE, products: { limit: 20, products: [] } } },
      }),
      name: 'products-new',
    },
    ...editorPairs(),
    ...variantPairs(),
    ...stockPairs(),
    ...openingPairs(),
    ...stockCardPairs(),
    ...stockPagePairs(),
    ...stockCheckPairs(),
    ...expiringPairs(),
    ...purchasePairs(),
    ...deliveryPairs(),
    ...categoryPairs(),
    ...attributePairs(),
  ];
}

/**
 * Attributes and option sets (§7.6, Slice 11.8, Part 19): the page with the retired ones last, New attribute, a library
 * attribute's sheet, the shop's own with a retired option, one option's step, Option sets and New set.
 */
function attributePairs(): Pair[] {
  const one = (
    name: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({
    name,
    screen: name,
    device,
    language,
    path: '/attributes',
    state: { products: sketchedAttributes(language) },
    ...more,
  });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const open = (name: string) => async (page: Page) => {
    await main(page)
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .click();
  };
  return [
    one('attributes'),
    one('attributes', {}, 'desktop', 'en'),
    one('sh-attr-new', {
      then: async (page) => {
        await main(page).getByRole('button', { name: 'নতুন অ্যাট্রিবিউট' }).click();
      },
    }),
    one('sh-attr-library', { then: open('সাইজ') }),
    one('sh-attr-edit-retired', { then: open('সুতির ধরন') }),
    one('sh-attr-edit-retired', { then: open('Cotton type') }, 'phone', 'en'),
    one('sh-attr-option', {
      then: async (page) => {
        await open('সুতির ধরন')(page);
        await sheet(page).getByRole('button', { name: 'লিনেন এডিট' }).click();
      },
    }),
    one('option-sets', { path: '/attributes/option-sets' }),
    one('sh-optset-new', {
      path: '/attributes/option-sets',
      then: async (page) => {
        await main(page).getByRole('button', { name: 'নতুন সেট' }).click();
        await sheet(page).getByLabel('সেটের নাম').fill('বাচ্চাদের সাইজ');
        for (const value of ['2–3', '4–5', '6–7', '8–9']) {
          await sheet(page).getByLabel('অপশন যোগ').fill(value);
          await sheet(page).getByLabel('অপশন যোগ').press('Enter');
        }
        await sheet(page).getByLabel('অপশন যোগ').fill('10–11');
      },
    }),
  ];
}

/**
 * Categories (§7.5, Slice 11.8, the prototype's categories flow and Part 19's chart): the tree, a new shop's suggestions,
 * one added and one deleted, the ⋯ menu, New category and Add a sub-category with where it sits, a category's sheet with
 * its suggestions and its own chart, and the three ways a delete goes.
 */
function categoryPairs(): Pair[] {
  const one = (
    name: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path: '/categories', ...more });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  // The prototype's `CAT_ROWS`: each row's products, Kids behaving like clothing with Size and Colour suggested and its
  // own chart, Accessories hidden.
  const drawn: ProductsFixture = {
    ...drawnProducts(),
    categoryState: {
      'c-tshirts': { productCount: 3 },
      'c-men': { productCount: 2 },
      'c-women': { productCount: 1 },
      'c-jackets': { productCount: 2 },
      'c-sarees': { productCount: 1 },
      'c-kids': { productCount: 1, behavesLike: 'clothing', suggested: ['a-1', 'a-2'] },
      'c-accessories': { productCount: 1, visible: false },
    },
    charts: {
      'c-kids': [
        ['', 'বুক', 'লম্বা'],
        ['2–3', '22', '16'],
        ['4–5', '24', '18'],
        ['6–7', '26', '20'],
      ],
    },
  };
  const state = (fixture: ProductsFixture = drawn) => ({ state: { products: fixture } });
  const menu = (name: string) => async (page: Page) => {
    await main(page)
      .getByRole('button', { name: `${name}: আরও` })
      .click();
  };
  const edit = (name: string) => async (page: Page) => {
    await main(page)
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .click();
  };
  const remove = (name: string) => async (page: Page) => {
    await menu(name)(page);
    await sheet(page).getByRole('button', { name: 'ক্যাটাগরি ডিলিট' }).click();
  };
  const seeds = [
    'টি-শার্ট',
    'শার্ট',
    'পাঞ্জাবি',
    'শাড়ি',
    'থ্রি-পিস',
    'জিন্স',
    'কিডস',
    'অ্যাক্সেসরিজ',
  ];
  return [
    one('categories', state()),
    one('categories', state(), 'desktop', 'en'),
    {
      ...one('categories', {
        shop: {
          drawn: 'new',
          state: {
            ...DAY_ONE,
            products: {
              products: [],
              limit: 20,
              categories: [],
              defaults: { suggestedCategories: seeds },
            },
          },
        },
      }),
      name: 'categories-new',
    },
    one('categories-seeded', {
      shop: {
        drawn: 'new',
        state: {
          ...DAY_ONE,
          products: {
            products: [],
            limit: 20,
            categories: [],
            defaults: { suggestedCategories: seeds },
          },
        },
      },
      then: async (page) => {
        await main(page).getByRole('button', { name: 'এই 8টি যোগ করুন' }).click();
        await page.waitForTimeout(600);
      },
    }),
    one('categories-added', {
      ...state(),
      then: async (page) => {
        await main(page).getByRole('button', { name: 'ক্যাটাগরি যোগ' }).first().click();
        await sheet(page).getByLabel('নাম', { exact: true }).fill('শার্ট');
        await sheet(page).getByRole('button', { name: 'সেভ করুন' }).click();
      },
    }),
    one('categories-deleted', {
      ...state(),
      then: async (page) => {
        await remove('কিডস')(page);
        await page.getByRole('button', { name: 'প্রোডাক্ট সরিয়ে ডিলিট করুন' }).click();
      },
    }),
    one('sh-category-menu', { ...state(), then: menu('কিডস') }),
    one('sh-category-new', {
      ...state(),
      then: async (page) => {
        await main(page).getByRole('button', { name: 'ক্যাটাগরি যোগ' }).first().click();
        await sheet(page).getByLabel('নাম', { exact: true }).fill('শার্ট');
      },
    }),
    one('sh-category-sub', {
      ...state(),
      then: async (page) => {
        await menu('টি-শার্ট')(page);
        await sheet(page).getByRole('button', { name: 'সাব-ক্যাটাগরি যোগ' }).click();
      },
    }),
    one('sh-category-edit', { ...state(), then: edit('কিডস') }),
    one('sh-category-edit', { ...state(), then: edit('Kids') }, 'desktop', 'en'),
    one('sh-category-parent', {
      ...state(),
      then: async (page) => {
        await edit('কিডস')(page);
        await sheet(page)
          .getByRole('button', { name: /^Parent|^প্যারেন্ট|^কোথায়/ })
          .click();
      },
    }),
    one('sh-category-attrs', {
      ...state(),
      then: async (page) => {
        await edit('কিডস')(page);
        await sheet(page).getByRole('button', { name: 'অ্যাট্রিবিউট যোগ করুন' }).click();
      },
    }),
    one('sh-category-chart-19', {
      ...state(),
      then: async (page) => {
        await edit('কিডস')(page);
        await sheet(page)
          .getByRole('button', { name: / এডিট$/ })
          .click();
      },
    }),
    one('sh-category-delete', { ...state(), then: remove('কিডস') }),
    one('sh-category-delete-children', { ...state(), then: remove('টি-শার্ট') }),
    one('sh-category-delete-empty', {
      ...state({
        ...drawn,
        categoryState: { ...drawn.categoryState, 'c-accessories': { productCount: 0 } },
      }),
      then: remove('অ্যাক্সেসরিজ'),
    }),
  ];
}

/**
 * The Stock card over a saved product (§7.4, Slice 11.7c step 3, the Stock sheets and Part 18): a phone's card and
 * table, Add stock with and without IMEIs, Stock history with its variant picked and the picker, Batches and a
 * write-off, IMEI / serials with Fix, and Add serials.
 */
/**
 * Stock (§7.7, Slice 11.9, the prototype's `stock` and Part 20): the page with its figures, someone who may only look,
 * nothing low, the fine ones opened; a row's own sheet on a plain, a batch-kept and a serial-numbered product; Edit stock
 * plain, down from a batch, up into a new one and down naming the IMEIs; Average cost; Add stock's product pick.
 */
function stockPagePairs(): Pair[] {
  const one = (
    name: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({
    name,
    screen: name,
    device,
    language,
    path: '/stock',
    state: { products: stockShop(language) },
    ...more,
  });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const row = (name: RegExp) => async (page: Page) => {
    await main(page).getByRole('button', { name }).first().click();
  };
  const edit = (name: string) => async (page: Page) => {
    await main(page)
      .getByRole('button', { name: `এডিট: ${name}`, exact: true })
      .click();
  };
  const reason = async (page: Page, word: string) => {
    await sheet(page).getByRole('button', { name: word }).click();
  };
  // The face cream alone, its stock fine, so its row is in "Stock is fine", opened first.
  const cream = {
    products: {
      ...creamShop(),
      products: creamShop().products.filter((each) => each.id === 'p-fc'),
    },
  };
  const fine = async (page: Page) => {
    await main(page)
      .getByRole('button', { name: /স্টক ঠিক আছে/ })
      .click();
  };
  return [
    one('stock'),
    one('stock', {}, 'desktop', 'en'),
    one('stock', {}, 'tablet', 'bn'),
    one('stock-staff', {
      state: {
        products: stockShop('bn'),
        isOwner: false,
        permissions: ['inventory:read', 'products:read'],
      },
    }),
    one('stock-low-none', {
      path: '/stock?seg=low',
      state: {
        products: {
          ...stockShop('bn'),
          products: stockShop('bn').products.filter((each) =>
            ['p-3', 'p-5', 'p-6'].includes(each.id),
          ),
        },
      },
    }),
    one('stock-fine-open', {
      then: async (page) => {
        await main(page)
          .getByRole('button', { name: /স্টক ঠিক আছে/ })
          .click();
      },
    }),
    one('stock-row-sheet', { then: row(/^M স্টক কম/) }),
    one('stock-row-sheet', { then: row(/^M Low stock/) }, 'phone', 'en'),
    one('stock-row-sheet-batch', {
      state: cream,
      then: async (page) => {
        await fine(page);
        await row(/^— /)(page);
      },
    }),
    one('stock-row-sheet-serial', {
      state: { products: galaxyShop('bn', 2) },
      then: row(/^128 GB · কালো/),
    }),
    one('stock-edit', {
      then: async (page) => {
        await edit('ডেনিম জ্যাকেট · M')(page);
        await sheet(page).getByLabel('এখন কত আছে?').fill('4');
        await reason(page, 'নষ্ট / হারিয়েছে');
      },
    }),
    one('stock-edit-down-batch', {
      state: cream,
      then: async (page) => {
        await fine(page);
        await edit('Face cream 50 ml')(page);
        await sheet(page).getByLabel('এখন কত আছে?').fill('37');
        await reason(page, 'নষ্ট / হারিয়েছে');
      },
    }),
    one('stock-edit-up-batch', {
      state: cream,
      then: async (page) => {
        await fine(page);
        await edit('Face cream 50 ml')(page);
        await sheet(page).getByLabel('এখন কত আছে?').fill('45');
        await reason(page, 'নতুন মাল এসেছে');
        await sheet(page).getByLabel('ব্যাচ কোড (অপশনাল)').fill('FC-1209');
        await sheet(page).getByLabel('মেয়াদ (অপশনাল)').fill('2027-06-30');
      },
    }),
    one('stock-edit-down-serial', {
      state: { products: galaxyShop('bn') },
      then: async (page) => {
        await edit('Galaxy A15 · 128 GB · কালো')(page);
        await sheet(page).getByLabel('এখন কত আছে?').fill('3');
        await reason(page, 'নষ্ট / হারিয়েছে');
        await sheet(page).getByRole('checkbox').nth(1).check();
        await sheet(page).getByRole('checkbox').nth(3).check();
      },
    }),
    one('sh-cost', {
      then: async (page) => {
        await row(/^M স্টক কম/)(page);
        await sheet(page)
          .getByRole('button', { name: /^গড় খরচ/ })
          .click();
      },
    }),
    one('stock-add-pick', {
      then: async (page) => {
        await page.getByRole('button', { name: 'স্টক যোগ', exact: true }).click();
      },
    }),
  ];
}

/**
 * Stock checks (§7.8, Slice 11.9, the prototype's `stock-checks`, `stock-check`, `stock-check-detail` and Part 20): the
 * list and its empty state, a new check before and after picking, the pick sheet both ways, counting with a note,
 * batch by batch with an IMEI short, the IMEI not found, and one saved check.
 */
function stockCheckPairs(): Pair[] {
  const one = (name: string, path: string, more: Partial<Pair> = {}): Pair => ({
    name,
    screen: name,
    device: 'phone',
    language: 'bn',
    path,
    state: { products: stockShop('bn') },
    ...more,
  });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const pick = async (page: Page, names: string[]) => {
    await main(page).getByRole('button', { name: 'প্রোডাক্ট বা ক্যাটাগরি বাছুন' }).click();
    for (const name of names) await sheet(page).getByRole('checkbox', { name }).check();
  };
  const count = async (page: Page) => {
    await sheet(page)
      .getByRole('button', { name: /লাইন গুনুন$/ })
      .click();
  };
  const type = async (page: Page, name: string | RegExp, value: string) => {
    await main(page)
      .getByRole('textbox', { name: typeof name === 'string' ? `${name}: গুনে পেলাম` : name })
      .fill(value);
  };
  const denim = async (page: Page) => {
    await pick(page, ['ডেনিম জ্যাকেট', 'কটন টি-শার্ট']);
    await count(page);
    for (const [size, value] of [
      ['S', '3'],
      ['M', '4'],
      ['L', '14'],
      ['XL', '8'],
    ] as const) {
      await type(page, `ডেনিম জ্যাকেট · ${size}`, value);
    }
  };
  // The face cream with its three batches, and the Galaxy with five IMEIs.
  const kept = {
    products: {
      ...creamShop(),
      products: [
        ...creamShop().products.filter((each) => each.id === 'p-fc'),
        ...galaxyShop('bn').products,
      ],
    },
  };
  const batches = async (page: Page) => {
    await pick(page, ['Face cream 50 ml', 'Galaxy A15']);
    await count(page);
    await type(page, /^FC-0702/, '3');
    await type(page, /^FC-0921/, '11');
    await type(page, /^FC-1102/, '24');
    await type(page, 'Galaxy A15 · 128 GB · কালো', '4');
  };
  return [
    one('stock-checks', '/stock/checks'),
    one('stock-checks-empty', '/stock/checks', {
      state: { products: { ...stockShop('bn'), checks: [] } },
    }),
    one('stock-check-start', '/stock/checks/new'),
    one('stock-check-pick', '/stock/checks/new', {
      then: async (page) => {
        await pick(page, ['ডেনিম জ্যাকেট', 'কটন টি-শার্ট', 'কিডস ফ্রক']);
      },
    }),
    one('stock-check-pick-category', '/stock/checks/new', {
      then: async (page) => {
        await pick(page, []);
        await sheet(page).getByRole('radio', { name: 'ক্যাটাগরি' }).click();
        await sheet(page)
          .getByRole('radio', { name: /^টি-শার্ট/ })
          .click();
      },
    }),
    one('stock-check', '/stock/checks/new', { then: denim }),
    one('stock-check-note', '/stock/checks/new', { then: denim }),
    one('stock-check-batches', '/stock/checks/new', { state: kept, then: batches }),
    one('sh-check-missing', '/stock/checks/new', {
      state: kept,
      then: async (page) => {
        await batches(page);
        await main(page)
          .getByRole('button', { name: 'যেটা পাওয়া যায়নি, তার IMEI বাছুন' })
          .click();
        await sheet(page).getByRole('checkbox').nth(2).check();
      },
    }),
    one('stock-check-detail', '/stock/checks/sc-12'),
    // Design v3.10: its number in the desktop header.
    one('stock-check-detail', '/stock/checks/sc-12', {
      device: 'desktop',
      language: 'en',
      state: { products: stockShop('en') },
    }),
  ];
}

/**
 * Expiring and Stock value (§7.9 and §7.22, Slice 11.9, the prototype's `expiring`, `sh-writeoff`, `stock-value` and
 * Part 20's `expiring-empty`): the batches expiring then expired, a write-off, nothing expiring, and the stock's value
 * with this month's losses.
 */
function expiringPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({
    name,
    screen: name,
    device,
    language,
    path,
    state: { products: expiringShop() },
    ...more,
  });
  return [
    one('expiring', '/stock/expiring'),
    one('expiring-empty', '/stock/expiring', { state: { products: stockShop('bn') } }),
    one('sh-writeoff', '/stock/expiring', {
      name: 'sh-writeoff-expiring',
      then: async (page) => {
        await page
          .getByRole('main')
          .getByRole('button', { name: /^রাইট-অফ/ })
          .click();
      },
    }),
    one('stock-value', '/stock/value', { state: { products: stockShop('bn') } }),
    one('stock-value', '/stock/value', { state: { products: stockShop('en') } }, 'desktop', 'en'),
  ];
}

/**
 * Purchases and suppliers (§7.21, Slice 11.10, the prototype's purchasing screens and Part 21): Open, All, none yet and
 * for staff; Order from supplier with its supplier typed, Add item and its variants; a draft, a placed purchase being
 * changed, partly received, rejected in full, received, closed short and cancelled; It arrived, a delivery, the
 * confirms; Suppliers, archived, none yet and their sheets; and a variant's purchases from its Stock row.
 */
function purchasePairs(): Pair[] {
  const shop = (language: Language) => ({
    ...stockShop(language),
    purchasing: {
      suppliers: drawnSuppliers(),
      purchases: [...drawnPurchases(language), ...otherStates(language)],
    },
  });
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({
    name,
    screen: name,
    device,
    language,
    path,
    state: { products: shop(language) },
    ...more,
  });
  const staff = { isOwner: false, permissions: ['inventory:read', 'products:read'] };
  const none = { ...stockShop('bn'), purchasing: { suppliers: [], purchases: [] } };
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const ordering = async (page: Page) => {
    await main(page).getByRole('button', { name: 'সাপ্লায়ারকে অর্ডার' }).first().click();
  };
  const adding = async (page: Page) => {
    await ordering(page);
    await sheet(page).getByRole('button', { name: 'আইটেম যোগ' }).click();
  };
  const press = (name: string | RegExp) => async (page: Page) => {
    await main(page).getByRole('button', { name }).first().click();
  };
  // PO-0007 with the face cream and a Galaxy A15 added, as Part 21's `sh-receive-full` draws its three kinds of item.
  const kept = () => {
    const base = shop('bn');
    const seven = base.purchasing.purchases.find((each) => each.id === 'po-7');
    if (seven) {
      seven.items = [
        { id: 'po-7-i1', variantId: 'p-1-v2', ordered: 20, received: 0, unitCost: '280.00' },
        { id: 'po-7-fc', variantId: 'p-fc-v1', ordered: 24, received: 0, unitCost: '310.00' },
        { id: 'po-7-gx', variantId: 'p-ga-v1', ordered: 5, received: 0, unitCost: null },
      ];
    }
    return {
      ...base,
      products: [
        ...base.products,
        ...creamShop().products.filter((each) => each.id === 'p-fc'),
        ...galaxyShop('bn').products,
      ],
    };
  };
  return [
    one('purchases-21', '/purchases'),
    one('purchases-21', '/purchases', {}, 'desktop', 'en'),
    one('purchases-all-21', '/purchases?seg=all'),
    one('purchases-empty', '/purchases', { state: { products: none } }),
    one('purchases-staff', '/purchases', { state: { products: shop('bn'), ...staff } }),
    one('purchase-new', '/purchases', { then: ordering }),
    one('sh-po-supplier', '/purchases', {
      then: async (page) => {
        await ordering(page);
        await sheet(page).getByLabel('সাপ্লায়ার').fill('রহ');
      },
    }),
    one('sh-po-add-item', '/purchases', { then: adding }),
    one('sh-po-add-sizes', '/purchases', {
      then: async (page) => {
        await adding(page);
        await sheet(page)
          .getByRole('button', { name: /^কটন টি-শার্ট/ })
          .click();
        for (const size of ['M', 'L', 'XL']) {
          await sheet(page)
            .getByRole('checkbox', { name: new RegExp(`^${size} · কালো`) })
            .check();
        }
      },
    }),
    one('purchase-draft', '/purchases/po-draft'),
    one('sh-delete-draft', '/purchases/po-draft', { then: press('ড্রাফট ডিলিট করুন') }),
    one('purchase-edit-placed', '/purchases/po-7'),
    one('purchase-edit-placed', '/purchases/po-7', {}, 'desktop', 'en'),
    one('sh-cancel-purchase', '/purchases/po-7', { then: press('অর্ডার ক্যানসেল') }),
    one('sh-receive-full', '/purchases/po-7', {
      state: { products: kept() },
      then: async (page) => {
        await press('মাল এসেছে')(page);
        const first = sheet(page).locator('div.rounded-card').first();
        await first.getByLabel('নিয়েছেন').fill('18');
        await first.getByLabel('ফেরত').fill('2');
        const cream = sheet(page).locator('div.rounded-card').nth(1);
        await cream.getByLabel('ব্যাচ কোড').fill('FC-1209');
        await cream.getByLabel('মেয়াদ').fill('2027-06-30');
      },
    }),
    one('purchase-partial', '/purchases/po-6'),
    one('sh-delivery', '/purchases/po-6', { then: press(/^40 পিস নেওয়া/) }),
    one('sh-close-short', '/purchases/po-6', { then: press('কম মালে বন্ধ করুন') }),
    one('purchase-rejected-only', '/purchases/po-9'),
    one('purchase-received', '/purchases/po-5'),
    one('purchase-closed', '/purchases/po-4'),
    one('purchase-cancelled', '/purchases/po-3'),
    one('purchase-staff', '/purchases/po-6', { state: { products: shop('bn'), ...staff } }),
    one('suppliers', '/purchases/suppliers'),
    one('sh-supplier', '/purchases/suppliers', { then: press(/রহিম ট্রেডার্স/) }),
    one('sh-supplier-new', '/purchases/suppliers', { then: press('নতুন সাপ্লায়ার') }),
    one('suppliers-archived', '/purchases/suppliers?archived=1'),
    one('suppliers-empty', '/purchases/suppliers', { state: { products: none } }),
    one('stock-row-sheet-purchases', '/stock', {
      then: press(/^L স্টক/),
    }),
    one('sh-purchase-history', '/stock', {
      then: async (page) => {
        await press(/^L স্টক/)(page);
        await sheet(page)
          .getByRole('button', { name: /^কেনাকাটা/ })
          .click();
      },
    }),
  ];
}

/**
 * Delivery (§7.10, Slice 11.11, the prototype's `delivery`, `sh-homearea`, `sh-zone` and Part 22): the page, no delivery
 * outside, Check an address both ways, none of its own, the most there may be, look-only; a fixed zone renamed, the
 * shop's own thanas, a new zone with a thana moving, an area another zone holds, the picker and a district opened, a
 * delete asked and a zone still in use.
 */
function deliveryPairs(): Pair[] {
  const one = (
    name: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path: '/delivery', ...more });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const changed = (change: (fixture: DeliveryFixture) => void) => {
    const fixture = drawnDelivery('bn');
    change(fixture);
    return { delivery: fixture };
  };
  const search = async (page: Page, typed: string) => {
    await sheet(page).getByRole('searchbox').fill(typed);
  };
  const check =
    (typed: string, row: string, field = /^জেলা ও থানা/) =>
    async (page: Page) => {
      await main(page).getByRole('button', { name: field }).click();
      await search(page, typed);
      await sheet(page).getByRole('button', { name: row }).click();
    };
  const addZone = async (page: Page) => {
    await main(page).getByRole('button', { name: 'জোন যোগ' }).first().click();
    await sheet(page).getByLabel('নাম').fill('ঢাকার আশপাশ');
    await sheet(page).getByLabel('ডেলিভারি চার্জ').fill('100');
    await sheet(page).getByRole('button', { name: 'জেলা, সিটি বা থানা যোগ' }).click();
  };
  const tick = async (page: Page, typed: string, row: RegExp) => {
    await search(page, typed);
    await sheet(page).getByRole('checkbox', { name: row }).check();
  };
  const ctg = async (page: Page) => {
    await main(page)
      .getByRole('button', { name: /^চট্টগ্রাম ও সিলেট/ })
      .click();
  };
  return [
    one('delivery'),
    one('delivery-22', { then: check('পাঁচ', 'পাঁচলাইশ · চট্টগ্রাম') }),
    one(
      'delivery-22',
      { then: check('panch', 'Panchlaish · Chattogram', /^District and thana/) },
      'desktop',
      'en',
    ),
    one('delivery-outside-off', {
      then: async (page) => {
        await main(page).getByRole('switch').click();
      },
    }),
    one(
      'delivery-check-nodelivery',
      { then: check('ruma', 'Ruma · Bandarban', /^District and thana/) },
      'desktop',
      'en',
    ),
    one('delivery-empty', {
      state: changed((fixture) => {
        fixture.zones = fixture.zones.filter((zone) => zone.isHome || zone.isFallback);
      }),
    }),
    one('delivery-full', {
      state: changed((fixture) => {
        fixture.maxZones = 4;
      }),
    }),
    one('delivery-staff', { state: { isOwner: false, permissions: ['products:read'] } }),
    one('sh-zone-rename', {
      then: async (page) => {
        await main(page)
          .getByRole('button', { name: /নাম বদলান$/ })
          .first()
          .click();
        await sheet(page).getByLabel('নাম').fill('ঢাকা মেট্রো');
      },
    }),
    one('sh-homearea', {
      then: async (page) => {
        await main(page)
          .getByRole('button', { name: /^আপনার এলাকা/ })
          .click();
      },
    }),
    one('sh-homearea-thanas', {
      then: async (page) => {
        await main(page)
          .getByRole('button', { name: /^আপনার এলাকা/ })
          .click();
        await sheet(page).getByRole('radio', { name: 'নিজের থানাগুলো' }).click();
        await sheet(page).getByRole('button', { name: 'থানা যোগ' }).click();
        await tick(page, 'মির', /^মিরপুর · ঢাকা/);
        await tick(page, 'পল্ল', /^পল্লবী · ঢাকা/);
        await tick(page, 'কাফ', /^কাফরুল · ঢাকা/);
        await sheet(page)
          .getByRole('button', { name: /এলাকা যোগ করুন$/ })
          .click();
      },
    }),
    one('sh-zone', { then: ctg }),
    one('sh-zone-new', {
      then: async (page) => {
        await addZone(page);
        await tick(page, 'সাভ', /^সাভার · ঢাকা/);
        await tick(page, 'বনা', /^বনানী · ঢাকা/);
        await sheet(page)
          .getByRole('button', { name: /এলাকা যোগ করুন$/ })
          .click();
      },
    }),
    one('sh-zone-taken', {
      state: changed((fixture) => {
        const zone = fixture.zones.find((each) => each.id === 'z-ctg');
        if (zone) zone.zillaIds = [4];
      }),
      then: ctg,
    }),
    one('sh-area-pick', {
      then: async (page) => {
        await addZone(page);
        // The drawing's matches for 'বান' are its English names' (Bandarban, Banani, Bandar, Banshkhali).
        await tick(page, 'ban', /^বনানী · ঢাকা/);
      },
    }),
    one('sh-area-district', {
      then: async (page) => {
        await addZone(page);
        await search(page, 'গাজী');
        await sheet(page)
          .getByRole('button', { name: /থানাগুলো$/ })
          .first()
          .click();
        await sheet(page)
          .getByRole('checkbox', { name: /^গাজীপুর সদর/ })
          .check();
        await sheet(page)
          .getByRole('checkbox', { name: /^শ্রীপুর/ })
          .check();
      },
    }),
    one('sh-zone-delete', {
      then: async (page) => {
        await ctg(page);
        await sheet(page).getByRole('button', { name: 'জোন ডিলিট' }).click();
      },
    }),
    one('sh-zone-in-use', {
      state: changed((fixture) => {
        fixture.holders = {
          'z-ctg': [
            { id: 'p-1', name: 'হিমায়িত মাছ', archived: false },
            { id: 'p-8', name: 'শুঁটকি', archived: true },
          ],
        };
      }),
      then: async (page) => {
        await ctg(page);
        await sheet(page).getByRole('button', { name: 'জোন ডিলিট' }).click();
        await sheet(page).getByRole('button', { name: 'জোন ডিলিট' }).click();
      },
    }),
  ];
}

function stockCardPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const card = (page: Page) => main(page).getByRole('region', { name: 'স্টক', exact: true });
  const tap = (name: string | RegExp) => async (page: Page) => {
    await card(page).getByRole('button', { name }).click();
  };
  const pick = async (page: Page, variant: RegExp) => {
    await sheet(page)
      .getByRole('button', { name: /^প্রোডাক্ট · ভ্যারিয়েন্ট/ })
      .click();
    await sheet(page).getByRole('radio', { name: variant }).click();
  };
  const noCamera = async (page: Page) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
  };
  const phones = { products: phoneShop() };
  /** A phone variant's serials, from its cell in the table (`pf-edit-mobile`). */
  const serialsOf128 = async (page: Page) => {
    await main(page).getByRole('button', { name: '128 GB-এর IMEI / সিরিয়াল' }).click();
  };
  return [
    one('pf-edit-mobile', '/products/p-ph', { state: phones }, 'desktop', 'en'),
    one('stock-add', '/products/p-1', {
      then: async (page) => {
        await tap('স্টক যোগ')(page);
        await pick(page, /^M · Black/);
        await sheet(page).getByLabel('পরিমাণ').fill('10');
        await sheet(page).getByLabel('প্রতি ইউনিটের দাম (অপশনাল)').fill('1250');
        await sheet(page).getByLabel('সাপ্লায়ার (অপশনাল)').fill('রহিম ট্রেডার্স');
      },
    }),
    one('stock-add-serials', '/products/p-ph', {
      state: phones,
      before: noCamera,
      then: async (page) => {
        await tap('স্টক যোগ')(page);
        await sheet(page).getByLabel('পরিমাণ').fill('3');
        await sheet(page).getByLabel('প্রতি ইউনিটের দাম (অপশনাল)').fill('19800');
        await sheet(page).getByLabel('সাপ্লায়ার (অপশনাল)').fill('রহিম ট্রেডার্স');
        await sheet(page)
          .getByRole('button', { name: /^IMEI \/ সিরিয়াল/ })
          .click();
        await sheet(page).getByRole('tab', { name: 'টাইপ' }).click();
        for (const code of [SAMPLE_IMEIS[2] ?? '', SAMPLE_IMEIS[3] ?? '']) {
          await sheet(page).getByLabel('IMEI টাইপ করুন').fill(code);
          await sheet(page).getByLabel('IMEI টাইপ করুন').press('Enter');
        }
        await sheet(page).getByRole('button', { name: 'ঠিক আছে' }).click();
      },
    }),
    one('sh-history-product', '/products/p-1', {
      then: async (page) => {
        await tap('স্টক হিস্ট্রি')(page);
        await pick(page, /^M · Black/);
      },
    }),
    one('sh-pick-variant', '/products/p-1', {
      then: async (page) => {
        await tap('স্টক হিস্ট্রি')(page);
        await pick(page, /^M · Black/);
        await sheet(page)
          .getByRole('button', { name: /^প্রোডাক্ট · ভ্যারিয়েন্ট/ })
          .click();
      },
    }),
    one('sh-batches', '/products/p-fc', { state: { products: creamShop() }, then: tap('ব্যাচ') }),
    one('sh-writeoff', '/products/p-fc', {
      state: { products: creamShop() },
      then: async (page) => {
        await tap('ব্যাচ')(page);
        await sheet(page).getByRole('button', { name: 'রাইট-অফ' }).click();
      },
    }),
    one('sh-serials-product', '/products/p-ph', { state: phones, then: serialsOf128 }),
    one('sh-serial-fix', '/products/p-ph', {
      state: phones,
      then: async (page) => {
        await serialsOf128(page);
        await sheet(page)
          .getByRole('button', { name: `ঠিক করুন ${SAMPLE_IMEIS[0] ?? ''}` })
          .click();
      },
    }),
    one('sh-serials-missing', '/products/p-ph', {
      state: phones,
      before: noCamera,
      then: async (page) => {
        await tap('বাকিগুলো দিন')(page);
        await sheet(page).getByRole('tab', { name: 'টাইপ' }).click();
        await sheet(page)
          .getByLabel('IMEI টাইপ করুন')
          .fill(SAMPLE_IMEIS[2] ?? '');
        await sheet(page).getByLabel('IMEI টাইপ করুন').press('Enter');
      },
    }),
  ];
}

/**
 * A new product's stock on the shelf (§7.4, Slice 11.7c step 2, Part 15 and Part 16): the opening batch, and the
 * opening serials by Scan (the camera reading, none, blocked), Paste a list and Type, each line checked, the list full.
 */
function openingPairs(): Pair[] {
  const one = (
    name: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path: '/products/new', ...more });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const shop = (defaults: Record<string, unknown>, taken: string[] = []): ShopState => ({
    products: { ...drawnProducts(), defaults, takenSerials: taken },
  });
  const phones = shop(
    {
      presetKey: 'mobiles_gadgets',
      serialTracked: true,
      serialFormat: 'imei',
      suggestedAttributeIds: [],
      upFrontFields: ['serialTracked', 'itemCondition'],
    },
    ['356789104567928'],
  );
  /** The phone named, 5 on the shelf, its serials' sheet open. */
  const serials = async (page: Page, name = 'Galaxy A16') => {
    await main(page).getByLabel('নাম', { exact: true }).fill(name);
    await main(page).getByLabel('শুরুর স্টক').fill('5');
    await main(page).getByRole('button', { name: 'শুরুর সিরিয়াল' }).click();
  };
  /** Codes typed in the Type tab, each with Enter. */
  const typeIn = async (page: Page, codes: string[], label = 'IMEI টাইপ করুন') => {
    await sheet(page).getByRole('tab', { name: 'টাইপ' }).click();
    for (const code of codes) {
      await sheet(page).getByLabel(label).fill(code);
      await sheet(page).getByLabel(label).press('Enter');
    }
  };
  const noCamera = async (page: Page) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
  };
  /** The product named and split by Size, in English, with its options typed. */
  const split = async (page: Page, name: string, price: string, values: string[]) => {
    await main(page).getByLabel('Name', { exact: true }).fill(name);
    await main(page).getByLabel('Price', { exact: true }).fill(price);
    await main(page).getByRole('button', { name: 'Add attribute' }).click();
    await sheet(page).getByRole('searchbox').fill('Size');
    await sheet(page).getByRole('button', { name: /^Size/ }).first().click();
    await sheet(page)
      .getByRole('radio', { name: /^Splits into variants/ })
      .click();
    await sheet(page).getByRole('button', { name: 'Done' }).click();
    for (const value of values) {
      await sheet(page).getByLabel('Add option', { exact: true }).fill(value);
      await sheet(page).getByRole('button', { name: 'Insert' }).click();
      await sheet(page).getByText(value, { exact: true }).waitFor();
    }
    await sheet(page).getByRole('button', { name: 'Done' }).click();
  };
  const variants = /^Options and variants$/;
  return [
    one(
      'pf-cosmetics',
      {
        scroll: variants,
        state: shop({
          presetKey: 'cosmetics',
          batchTracked: true,
          suggestedAttributeIds: [],
          upFrontFields: ['batchTracked'],
        }),
        then: async (page) => {
          await split(page, 'Matte Lipstick', '650', ['Ruby', 'Rose', 'Maroon']);
          await main(page).getByRole('button', { name: 'Opening batch of Ruby' }).click();
          await sheet(page).getByLabel('Quantity').fill('24');
          await sheet(page).getByLabel('Expiry date (optional)').fill('2027-08-31');
          await sheet(page).getByRole('button', { name: 'Done' }).click();
        },
      },
      'desktop',
      'en',
    ),
    one(
      'pf-mobiles_gadgets',
      {
        scroll: variants,
        state: phones,
        before: noCamera,
        then: async (page) => {
          await split(page, 'Galaxy A16', '21500', ['128 GB', '256 GB']);
          await main(page).getByLabel('Opening stock of 128 GB').fill('5');
          await main(page).getByLabel('Opening stock of 256 GB').fill('3');
          await main(page).getByRole('button', { name: 'Opening serials of 128 GB' }).click();
          await sheet(page).getByRole('tab', { name: 'Type' }).click();
          for (const code of ['356789104567894', '356789104567902', '356789104567910']) {
            await sheet(page).getByLabel('Type an IMEI').fill(code);
            await sheet(page).getByLabel('Type an IMEI').press('Enter');
          }
          await sheet(page).getByRole('button', { name: 'Done' }).click();
        },
      },
      'desktop',
      'en',
    ),
    one('pf-sh-batch', {
      state: shop({
        presetKey: 'cosmetics',
        batchTracked: true,
        suggestedAttributeIds: [],
        upFrontFields: ['batchTracked'],
      }),
      then: async (page) => {
        await main(page).getByLabel('নাম', { exact: true }).fill('Matte Lipstick');
        await main(page)
          .getByRole('button', { name: /^শুরুর স্টক/ })
          .click();
        await sheet(page).getByLabel('পরিমাণ').fill('24');
        await sheet(page).getByLabel('ব্যাচ কোড (অপশনাল)').fill('LS-2607');
        await sheet(page).getByLabel('মেয়াদ (অপশনাল)').fill('2027-08-31');
        await sheet(page).getByLabel('প্রতি ইউনিটের দাম (অপশনাল)').fill('410');
      },
    }),
    one('pf-sh-serials', {
      state: phones,
      before: async (page) => {
        await page.addInitScript(() => {
          const queue = [
            '356789104567894',
            '356789104567902',
            '356789104567910',
            '35678910456',
            '356789104567928',
          ];
          Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
              getUserMedia: () => {
                const canvas = document.createElement('canvas');
                canvas.getContext('2d')?.fillRect(0, 0, 320, 240);
                return Promise.resolve(canvas.captureStream());
              },
            },
          });
          Object.defineProperty(window, 'BarcodeDetector', {
            configurable: true,
            value: class {
              static getSupportedFormats(): Promise<string[]> {
                return Promise.resolve(['code_128']);
              }
              detect(): Promise<{ rawValue: string }[]> {
                const next = queue.shift();
                return Promise.resolve(next ? [{ rawValue: next }] : []);
              }
            },
          });
        });
      },
      then: async (page) => {
        await serials(page);
        await sheet(page).getByText('শপে আগেই আছে').waitFor();
      },
    }),
    one('pf-sh-serials-type', {
      state: phones,
      before: noCamera,
      then: async (page) => {
        await serials(page);
        await typeIn(page, ['356789104567894', '356789104567902']);
        await sheet(page).getByLabel('IMEI টাইপ করুন').fill('35678910456791');
      },
    }),
    one('pf-sh-serials-nocamera', {
      state: phones,
      before: noCamera,
      then: async (page) => {
        await serials(page);
        await typeIn(page, ['356789104567894', '356789104567902']);
        await sheet(page).getByRole('tab', { name: 'স্ক্যান' }).click();
      },
    }),
    one('pf-sh-serials-blocked', {
      state: phones,
      before: async (page) => {
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
              getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
            },
          });
        });
      },
      then: async (page) => {
        await serials(page);
        await typeIn(page, ['356789104567894', '356789104567902']);
        await sheet(page).getByRole('tab', { name: 'স্ক্যান' }).click();
        await sheet(page).getByRole('button', { name: 'আবার ট্রাই করুন' }).waitFor();
      },
    }),
    one('pf-sh-serials-paste', {
      state: phones,
      before: noCamera,
      then: async (page) => {
        await serials(page);
        await typeIn(page, ['356789104567894', '356789104567902']);
        await sheet(page).getByRole('tab', { name: 'লিস্ট পেস্ট' }).click();
        await sheet(page)
          .getByLabel('লিস্ট এখানে পেস্ট করুন')
          .fill('356789104567910\n356789104567928\n35 678910 456793 3');
      },
    }),
    one('pf-sh-serials-states', {
      state: phones,
      before: noCamera,
      then: async (page) => {
        await serials(page);
        await typeIn(page, [
          '356789104567894',
          '35678910456',
          '356789104567895',
          '356789104567894',
          '356789104567928',
        ]);
        await sheet(page).getByText('শপে আগেই আছে').waitFor();
      },
    }),
    one(
      'pf-sh-serials-states',
      {
        state: phones,
        before: noCamera,
        then: async (page) => {
          await page.getByRole('main').getByLabel('Name', { exact: true }).fill('Galaxy A16');
          await page.getByRole('main').getByLabel('Opening stock').fill('5');
          await page.getByRole('main').getByRole('button', { name: 'Opening serials' }).click();
          await sheet(page).getByRole('tab', { name: 'Type' }).click();
          for (const code of [
            '356789104567894',
            '35678910456',
            '356789104567895',
            '356789104567894',
            '356789104567928',
          ]) {
            await sheet(page).getByLabel('Type an IMEI').fill(code);
            await sheet(page).getByLabel('Type an IMEI').press('Enter');
          }
          await sheet(page).getByText('already in the shop').waitFor();
        },
      },
      'desktop',
      'en',
    ),
    one('pf-sh-serials-any', {
      state: shop({
        presetKey: 'electronics',
        serialTracked: true,
        serialFormat: 'any',
        suggestedAttributeIds: [],
        upFrontFields: ['serialTracked', 'itemCondition'],
      }),
      before: noCamera,
      then: async (page) => {
        await serials(page, 'রিচার্জেবল টেবিল ফ্যান');
        await typeIn(
          page,
          [
            'VF-2026-0001',
            'VF-2026-0002',
            'VF#0003',
            'VF-2026-0004-RECHARGEABLE-TABLE-FAN-12-INCH-8-HOURS-BACKUP-BLUE-B',
          ],
          'সিরিয়াল টাইপ করুন',
        );
      },
    }),
    one('pf-sh-serials-full', {
      state: phones,
      before: noCamera,
      then: async (page) => {
        await serials(page);
        await typeIn(page, [
          '356789104567894',
          '356789104567902',
          '356789104567910',
          '356789104567936',
          '356789104567944',
        ]);
        await sheet(page).getByRole('tab', { name: 'স্ক্যান' }).click();
      },
    }),
  ];
}

/**
 * Stock and delivery (§7.4, §7.4a, Slice 11.7c, Part 15): the size chart as a table and as a picture, a variant's own
 * settings, the question before making to order, Delivers to, the payment policy, a book's one variant with its SKU and
 * barcode, and a category of another type changing the defaults.
 */
function stockPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  /** The T-shirt with its own chart, as `sh-sizechart` and `sh-sizechart-picture` draw it. */
  const charted = (chart: { rows: string[][] } | { imageId: string }): ShopState => {
    const products = drawnProducts();
    const shirt = products.products[0];
    if (shirt) shirt.chart = chart;
    return { products: { ...products, charts: { 'c-tshirts': [['', 'বুক']] } } };
  };
  const chartRows = [
    ['', 'বুক', 'লম্বা', 'হাতা'],
    ['S', '36', '27', '8'],
    ['M', '38', '28', '8.5'],
    ['L', '40', '29', '9'],
    ['XL', '42', '30', '9.5'],
  ];
  const openChart = async (page: Page) => {
    await main(page)
      .getByRole('button', { name: /^নিজের চার্ট/ })
      .click();
  };
  const tap = (name: string | RegExp) => async (page: Page) => {
    await main(page).getByRole('button', { name }).first().click();
  };
  const books: ShopState = {
    products: {
      ...drawnProducts(),
      defaults: { presetKey: 'books_stationery', suggestedAttributeIds: [], upFrontFields: [] },
    },
  };
  const book =
    (language: Language) =>
    async (page: Page): Promise<void> => {
      const bn = language === 'bn';
      await main(page)
        .getByLabel(bn ? 'নাম' : 'Name', { exact: true })
        .fill(bn ? 'পথের পাঁচালী' : 'Pather Panchali');
      await main(page)
        .getByLabel(bn ? 'দাম' : 'Price', { exact: true })
        .fill('320');
      await main(page)
        .getByLabel(bn ? 'শুরুর স্টক' : 'Opening stock')
        .fill('12');
      await main(page)
        .getByLabel(bn ? 'ওজন (কেজি)' : 'Weight (kg)')
        .fill('0.45');
      await main(page)
        .getByText(bn ? 'আরও সেটিংস' : 'More settings', { exact: true })
        .click();
      await main(page).getByLabel('SKU').fill('PP-0320');
      await main(page)
        .getByLabel(bn ? 'বারকোড' : 'Barcode')
        .fill('9789845020181');
      // Back to the top, where the drawing starts; a second pair scrolls both to Stock and delivery.
      await page.evaluate(() => {
        for (const each of document.querySelectorAll('*')) each.scrollTop = 0;
        window.scrollTo(0, 0);
      });
    };
  const phones: ShopState = {
    products: {
      ...drawnProducts(),
      categories: [
        ['c-tshirts', null, 'টি-শার্ট', 'T-shirts'],
        ['c-phones', null, 'ফোন', 'Phones'],
      ],
      categoryDefaults: {
        'c-phones': {
          presetKey: 'mobiles_gadgets',
          serialTracked: true,
          serialFormat: 'imei',
          lowStockThreshold: '2.000',
          suggestedAttributeIds: [],
          upFrontFields: ['serialTracked', 'itemCondition'],
        },
      },
    },
  };
  return [
    one('sh-sizechart', '/products/p-1', { state: charted({ rows: chartRows }), then: openChart }),
    one('sh-sizechart-picture', '/products/p-1', {
      state: charted({ imageId: 'm-9' }),
      then: openChart,
    }),
    one('sh-variant', '/products/p-1', { then: tap('M · Black-এর সেটিংস') }),
    // Design v3.15 (after the walkthrough): M · Black's SKU typed in S · Black's sheet, refused on Save.
    one('sh-variant-sku-taken', '/products/p-1', {
      state: { products: { ...drawnProducts(), refuse: { sku: 'TS-M-BL' } } },
      then: async (page) => {
        await tap('S · Black-এর সেটিংস')(page);
        await sheet(page).getByLabel('SKU').fill('TS-M-BL');
        await sheet(page).getByRole('button', { name: 'ঠিক আছে' }).click();
        await main(page).getByRole('button', { name: 'সেভ করুন' }).click();
        await tap(/^S · Black-এর সেটিংস · /)(page);
      },
    }),
    one('sh-made-to-order', '/products/p-1', {
      then: async (page) => {
        await main(page).getByRole('radio', { name: 'অর্ডার পেলে বানানো (স্টক লাগে না)' }).click();
      },
    }),
    one('sh-deliversto', '/products/p-1', {
      then: async (page) => {
        await tap(/^যেখানে ডেলিভারি হবে/)(page);
        await sheet(page).getByRole('radio', { name: 'শুধু বাছা জোনে' }).click();
        await sheet(page)
          .getByRole('checkbox', { name: /ঢাকা সিটির ভেতরে/ })
          .click();
      },
    }),
    one('sh-policy', '/products/p-1', { then: tap(/^পেমেন্ট পলিসি/) }),
    one('pf-books_stationery', '/products/new', { state: books, then: book('bn') }),
    one(
      'pf-books_stationery',
      '/products/new',
      { state: books, then: book('en') },
      'desktop',
      'en',
    ),
    {
      ...one('pf-books_stationery', '/products/new', {
        state: books,
        then: book('bn'),
        scroll: /^স্টক ও ডেলিভারি$/,
      }),
      name: 'pf-books_stationery-more',
    },
    one('pf-defaults-changed', '/products/new', {
      state: phones,
      then: async (page) => {
        await tap('বদলান')(page);
        await sheet(page).getByRole('checkbox', { name: 'ফোন' }).check();
        await sheet(page).getByRole('button', { name: 'ঠিক আছে' }).click();
        await main(page)
          .getByText(/মোবাইল ও গ্যাজেট/)
          .first()
          .waitFor();
      },
    }),
  ];
}

/**
 * Options and variants (§7.4, Slice 11.7b, Part 14): the T-shirt's card and table, a size added, the option and colour
 * sheets, Add attribute and its New attribute step, a describing value, Fill all, removing an option holding stock, the
 * bakery made to order, and past 100 variants.
 */
function variantPairs(): Pair[] {
  const card = /^(অপশন ও ভ্যারিয়েন্ট|Options and variants)$/;
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  const main = (page: Page) => page.getByRole('main');
  const sheet = (page: Page) => page.getByRole('dialog').last();
  const options = (nth: number) => async (page: Page) => {
    await main(page).getByRole('button', { name: 'অপশন যোগ' }).nth(nth).click();
  };
  const insert = async (page: Page, value: string) => {
    await sheet(page).getByLabel('অপশন যোগ', { exact: true }).fill(value);
    await sheet(page).getByRole('button', { name: 'বসান' }).click();
    await sheet(page).getByText(value, { exact: true }).waitFor();
  };
  const create = (name: string) => async (page: Page) => {
    await main(page).getByRole('button', { name: 'অ্যাট্রিবিউট যোগ করুন' }).click();
    await sheet(page).getByRole('searchbox').fill(name);
    await sheet(page)
      .getByRole('button', { name: `"${name}" তৈরি করুন` })
      .click();
  };
  const hundred: ProductsFixture = (() => {
    const products = drawnProducts();
    const library = drawnLibrary();
    const sizes = Array.from({ length: 10 }, (_, index) => `S${String(index + 1)}`);
    const colours = Array.from({ length: 10 }, (_, index) => `C${String(index + 1)}`);
    const size = library.find((each) => each.id === 'a-1');
    const colour = library.find((each) => each.id === 'a-2');
    if (size) size.options = sizes.map((value) => ({ id: `o-1-${value}`, value, scope: 'shop' }));
    if (colour)
      colour.options = colours.map((value) => ({ id: `o-2-${value}`, value, scope: 'shop' }));
    const shirt = products.products[0];
    if (shirt) {
      shirt.matrix = {
        splits: [
          { attributeId: 'a-1', optionIds: sizes.map((value) => `o-1-${value}`) },
          { attributeId: 'a-2', optionIds: colours.map((value) => `o-2-${value}`) },
        ],
        rows: sizes.flatMap((a, i) =>
          colours.map((b, j) => ({
            id: `p-1-v${String(i * 10 + j + 1)}`,
            optionIds: [`o-1-${a}`, `o-2-${b}`],
            price: null,
            sku: null,
            onHand: 0,
          })),
        ),
      };
    }
    return { ...products, library };
  })();
  const threeSplits: ProductsFixture = (() => {
    const products = drawnProducts();
    const shirt = products.products[0];
    if (shirt?.matrix) {
      shirt.matrix.splits.push({ attributeId: 'a-4', optionIds: ['o-4-Regular'] });
      for (const row of shirt.matrix.rows) row.optionIds.push('o-4-Regular');
    }
    return products;
  })();
  const bakery: ProductsFixture = {
    ...drawnProducts(),
    defaults: { presetKey: 'food_bakery', stockTracking: 'not_tracked', suggestedAttributeIds: [] },
  };
  return [
    { ...one('product', '/products/p-1', { scroll: card }), name: 'product-variants' },
    {
      ...one('product', '/products/p-1', { scroll: card }, 'desktop', 'en'),
      name: 'product-variants',
    },
    one('product-size-added', '/products/p-1', {
      scroll: card,
      then: async (page) => {
        await options(0)(page);
        await insert(page, '3XL');
        await sheet(page).getByRole('button', { name: 'ঠিক আছে' }).click();
      },
    }),
    one('sh-options', '/products/p-1', { then: options(0) }),
    one('sh-options-colour', '/products/p-1', {
      then: async (page) => {
        await options(1)(page);
        await insert(page, 'Sky');
        await sheet(page).getByRole('button', { name: 'Sky-এর সোয়াচ' }).click();
      },
    }),
    one(
      'sh-options-colour',
      '/products/p-1',
      {
        then: async (page) => {
          await main(page).getByRole('button', { name: 'Add option' }).nth(1).click();
          await sheet(page).getByLabel('Add option', { exact: true }).fill('Sky');
          await sheet(page).getByRole('button', { name: 'Insert' }).click();
          await sheet(page).getByRole('button', { name: 'Swatch of Sky' }).click();
        },
      },
      'desktop',
      'en',
    ),
    one('sh-attribute', '/products/p-1', {
      then: async (page) => {
        await main(page).getByRole('button', { name: 'অ্যাট্রিবিউট যোগ করুন' }).click();
        await sheet(page).getByRole('searchbox').fill('Fi');
      },
    }),
    one('sh-attribute-new', '/products/p-1', { then: create('Finish') }),
    one('sh-attribute-picked', '/products/p-1', {
      then: async (page) => {
        await create('Finish')(page);
        await sheet(page).getByRole('button', { name: 'তৈরি করে বেছে নিন' }).click();
        await sheet(page).getByText('এইমাত্র তৈরি', { exact: false }).waitFor();
      },
    }),
    one('sh-attribute-full', '/products/p-1', {
      state: { products: threeSplits },
      then: async (page) => {
        await main(page).getByRole('button', { name: 'অ্যাট্রিবিউট যোগ করুন' }).click();
        await sheet(page).getByRole('searchbox').fill('Sleeve');
        await sheet(page)
          .getByRole('button', { name: /^Sleeve/ })
          .click();
      },
    }),
    one('sh-desc-text', '/products/p-1', {
      then: async (page) => {
        await main(page)
          .getByRole('button', { name: /^Material/ })
          .click();
      },
    }),
    one('sh-fill', '/products/p-1', {
      then: async (page) => {
        await main(page).getByRole('button', { name: 'সবগুলোতে বসান' }).click();
        await sheet(page).getByRole('button', { name: /^L/ }).click();
      },
    }),
    one('sh-remove-option', '/products/p-1', {
      scroll: card,
      then: async (page) => {
        await main(page).getByRole('button', { name: 'Blue সরান' }).click();
      },
    }),
    one(
      'pf-food_bakery',
      '/products/new',
      {
        scroll: card,
        state: { products: bakery },
        then: async (page) => {
          for (const [name, values] of [
            ['Size', ['1 lb', '2 lb', '3 lb']],
            ['Flavour', ['Chocolate', 'Vanilla', 'Red velvet']],
          ] as const) {
            await main(page).getByRole('button', { name: 'Add attribute' }).click();
            await sheet(page).getByRole('searchbox').fill(name);
            const made = sheet(page).getByRole('button', { name: `Create "${name}"` });
            if (await made.count()) {
              await made.click();
              await sheet(page).getByRole('button', { name: 'Create and pick' }).click();
            } else
              await sheet(page)
                .getByRole('button', { name: new RegExp(`^${name}`) })
                .click();
            await sheet(page)
              .getByRole('radio', { name: /^Splits into variants/ })
              .click();
            await sheet(page).getByRole('button', { name: 'Done' }).click();
            for (const value of values) {
              await sheet(page).getByLabel('Add option', { exact: true }).fill(value);
              await sheet(page).getByRole('button', { name: 'Insert' }).click();
              await sheet(page).getByText(value, { exact: true }).waitFor();
            }
            await sheet(page).getByRole('button', { name: 'Done' }).click();
          }
          await main(page).getByRole('button', { name: 'Add attribute' }).click();
          await sheet(page).getByRole('searchbox').fill('Message on the cake');
          await sheet(page).getByRole('button', { name: 'Create "Message on the cake"' }).click();
          await sheet(page).getByRole('button', { name: 'Text', exact: true }).click();
          await sheet(page).getByRole('button', { name: 'Create and pick' }).click();
          await sheet(page)
            .getByRole('radio', { name: /^Asked when ordering/ })
            .click();
          await sheet(page).getByRole('button', { name: 'Done' }).click();
        },
      },
      'desktop',
      'en',
    ),
    one('pf-variants-over', '/products/p-1', {
      scroll: card,
      state: { products: hundred },
      then: async (page) => {
        await options(0)(page);
        await insert(page, 'S11');
        await sheet(page).getByRole('button', { name: 'ঠিক আছে' }).click();
      },
    }),
  ];
}

/**
 * The product editor (§7.4, Slice 11.7a): Basics with the link, the category picker and New category, the link sheet,
 * removing, leaving unsaved, an archived product, the copy just made, and a new product's missing fields.
 */
function editorPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  const tap = (label: string | RegExp) => async (page: Page) => {
    await page.getByRole('main').getByRole('button', { name: label }).first().click();
  };
  const leave = async (page: Page) => {
    await page.getByRole('main').getByLabel('নাম', { exact: true }).fill('কটন টি-শার্ট নতুন');
    await page.getByRole('link', { name: 'হোম' }).first().click();
  };
  return [
    one('product', '/products/p-1'),
    one('product', '/products/p-1', {}, 'desktop', 'en'),
    one('sh-category', '/products/p-1', { then: tap(/ক্যাটাগরি/) }),
    one('sh-category-new-product', '/products/p-1', {
      then: async (page) => {
        await tap(/ক্যাটাগরি/)(page);
        await page.getByRole('dialog').getByRole('button', { name: 'নতুন ক্যাটাগরি' }).click();
        await page.getByRole('dialog').getByLabel('নাম', { exact: true }).fill('শার্ট');
      },
    }),
    one('sh-link', '/products/p-1', { then: tap('ভ্যারিয়েন্ট বেছে লিংকে ?v= যোগ হয়।') }),
    one('sh-delete', '/products/p-1', {
      then: async (page) => {
        await page.getByRole('main').getByText('আরও সেটিংস').click();
        await tap('আর্কাইভ করুন')(page);
      },
    }),
    one('sh-leave', '/products/p-1', { then: leave }),
    one('product-archived', '/products/p-7'),
    one('product-archived', '/products/p-7', {}, 'desktop', 'en'),
    one('product-copied', '/products/p-1', {
      then: async (page) => {
        await page.getByRole('main').getByText('আরও সেটিংস').click();
        await tap('কপি বানান')(page);
        await page.getByRole('status').filter({ hasText: /./ }).waitFor();
      },
    }),
    one('pf-errors', '/products/new', { then: tap('সেভ করুন') }),
    one('sh-media', '/products/p-1', { then: tap('ছবি 1') }),
    one('sh-media', '/products/p-1', { then: tap('Photo 1') }, 'desktop', 'en'),
    one('sh-media-full', '/products/p-1', {
      state: {
        products: { ...drawnProducts(), storage: { full: true, usedBytes: 2048 * 1024 * 1024 } },
      },
      then: async (page) => {
        await page
          .getByRole('main')
          .locator('input[type=file][accept^="image"]')
          .first()
          .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(2048, 1) });
        await page.getByRole('main').getByRole('alert').first().waitFor();
        await tap('ছবি 1')(page);
      },
    }),
    one('product-partial', '/products/p-1', {
      state: { products: { ...drawnProducts(), refuse: { images: true } } },
      then: async (page) => {
        await tap('ছবি 1')(page);
        await page.getByRole('dialog').getByRole('button', { name: 'ছবি 3 সরান' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'ঠিক আছে' }).click();
        await tap('সেভ করুন')(page);
        await page.getByRole('main').getByRole('alert').first().waitFor();
      },
    }),
  ];
}

/** Settings (§7.16, Slice 11.6): its list, Shop details, Brand identity (Slice 11.12a), Storefront (Slice 12a, Part
    25), and Data export. */
function settingsPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  return [
    one('settings', '/settings'),
    one('settings', '/settings', {}, 'desktop', 'en'),
    one('shopdetails', '/settings/shop'),
    one('shopdetails', '/settings/shop', {}, 'desktop', 'en'),
    ...brandPairs(),
    one('sf25', '/settings/storefront'),
    one('sf25', '/settings/storefront', {}, 'desktop', 'en'),
    one('sh-sf25-off', '/settings/storefront', {
      then: async (page) => {
        await page.getByRole('switch', { name: 'স্টোরফ্রন্ট চালু' }).click();
        await page.getByRole('dialog').waitFor();
      },
    }),
    one('sf25-off', '/settings/storefront', {
      state: { settings: { ...drawnSettings('bn'), storefrontEnabled: false } },
    }),
    one('exports', '/settings/export', { state: { money: { exports: drawnExports() } } }),
    one(
      'exports',
      '/settings/export',
      { state: { money: { exports: drawnExports() } } },
      'desktop',
      'en',
    ),
    ...keyPairs(),
    ...metaPairs(),
    ...accountPairs(),
  ];
}

/**
 * Brand identity (§7.28, Slice 11.12a): the editor in each state Part 23 draws, its sheets, a contrast that fails, the
 * logos set, leaving unsaved, and its toasts. The add-on is held where the drawing names its end.
 */
function brandPairs(): Pair[] {
  const held = { owned: [{ key: 'brand_identity' }] };
  const brand = (
    change: Partial<BrandFixture> & { colours?: Partial<BrandFixture['identity']> } = {},
  ) => {
    const drawn = drawnBrand();
    const { colours, ...rest } = change;
    return { ...drawn, ...rest, identity: { ...drawn.identity, ...colours } };
  };
  const one = (
    name: string,
    state: ShopState,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
    screen = name,
  ): Pair => ({ name, screen, device, language, path: '/settings/brand', state, ...more });
  const on = { brand: brand(), money: { usage: held } };
  const off = { brand: brand({ useBrand: false }), money: { usage: held } };
  const pale = {
    brand: brand({ useBrand: false, colours: { mainColor: '#f2d16b' } }),
    money: { usage: held },
  };
  const logos = {
    brand: brand({ colours: { darkLogo: brandImage('m-dark'), icon: brandImage('m-icon') } }),
    money: { usage: held },
  };
  const colours = /^(Colours|রং)$/;
  const tap = (name: RegExp) => async (page: Page) => {
    await page.getByRole('button', { name }).first().click();
  };
  return [
    one('brand', on),
    one('brand', on, {}, 'desktop', 'en'),
    one('brand-landing', on, { then: tap(/^(Landing|ল্যান্ডিং)$/) }, 'phone', 'en'),
    one('brand-dash', on, { then: tap(/^(Dashboard|ড্যাশবোর্ড)$/) }, 'desktop', 'bn'),
    one('brand-off', off),
    one('brand-off', off, {}, 'desktop', 'en'),
    one('brand-in-plan', { brand: brand() }, {}, 'phone', 'en'),
    one('brand-trial', { state: 'trial', brand: brand({ useBrand: false, allowed: false }) }),
    one('brand-no-addon', { brand: brand({ useBrand: false, allowed: false }) }, {}, 'phone', 'en'),
    one('brand-lapsed', { brand: brand({ allowed: false }) }),
    one('brand-contrast', pale, { scroll: colours }, 'desktop', 'en'),
    one('brand-contrast', pale, { scroll: colours }),
    one(
      'brand-contrast-status',
      {
        brand: brand({ useBrand: false, colours: { backgroundColor: '#c9c2b0' } }),
        money: { usage: held },
      },
      { scroll: colours },
      'phone',
      'en',
    ),
    one('brand-round', {
      ...on,
      brand: brand({ colours: { corners: BrandCorners.Round, spacing: BrandSpacing.Compact } }),
    }),
    one(
      'brand-square-airy',
      {
        ...on,
        brand: brand({ colours: { corners: BrandCorners.Square, spacing: BrandSpacing.Airy } }),
      },
      {},
      'desktop',
      'en',
    ),
    one('brand-colour-main', on, { then: tap(/^Main/) }, 'phone', 'en'),
    one('brand-colour-accent', on, { then: tap(/^অ্যাকসেন্ট/) }),
    one('brand-colour-bg', on, { then: tap(/^Background/) }, 'desktop', 'en'),
    one('brand-colour-fail', pale, { then: tap(/^Main/) }, 'phone', 'en'),
    one('brand-logos', logos, { scroll: /^(Logos|লোগো)$/ }, 'phone', 'en'),
    one('brand-logo-dark', logos, { then: tapNth(/^Change$/, 1) }, 'phone', 'en'),
    one('brand-icon', logos, { then: tapNth(/^বদলান$/, 2) }),
    one('brand-font-heading', on, { then: tapNth(/^বদলান$/, 1) }),
    one('brand-font-body', on, { then: tapNth(/^Change$/, 2) }, 'phone', 'en'),
    one('brand-font-display', {
      ...on,
      brand: brand({ colours: { headingFont: BrandFont.GaladaPlayfairDisplay } }),
    }),
    one(
      'brand-leave',
      off,
      {
        then: async (page) => {
          await page.getByRole('button', { name: 'Airy' }).click();
          await page.getByRole('link', { name: /back/i }).first().click();
        },
      },
      'phone',
      'en',
    ),
    one('brand-applied', off, { then: tap(/^Apply$/) }, 'phone', 'en'),
    one(
      'brand-switched-off',
      on,
      { then: async (page) => page.getByRole('switch').click() },
      'phone',
      'en',
    ),
  ];
}

/** Taps the nth button with this name (from 0), for a page with several (each logo's Change, each font's). */
function tapNth(name: RegExp, index: number): (page: Page) => Promise<void> {
  return async (page) => {
    await page.getByRole('button', { name }).nth(index).click();
  };
}

/** Account (§7.17): the person's own, each of its sheets and dialogs, and a staff sign-in's (Part 11). */
function accountPairs(): Pair[] {
  // Each pair its own list: a pair's writes (an email added) never reach the next one's drawing.
  const one = (
    name: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({
    name,
    screen: name,
    device,
    language,
    path: '/account',
    state: { identities: drawnIdentities() },
    ...more,
  });
  const click = (label: string) => async (page: Page) => {
    await page.getByRole('button', { name: label, exact: true }).first().click();
  };
  const toCode = async (page: Page) => {
    await click('ইমেইল যোগ')(page);
    await page.getByRole('dialog').getByLabel('ইমেইল').fill('rumana@gmail.com');
    await click('কোড পাঠান')(page);
  };
  const staff = (): ShopState => ({ ...BILLING_STAFF, identities: drawnIdentities() });
  return [
    one('account'),
    one('account', {}, 'desktop', 'en'),
    one('sh-password', { then: click('পাসওয়ার্ড বদলান') }),
    one('sh-identity-email', {
      then: async (page) => {
        await click('ইমেইল যোগ')(page);
        await page.getByRole('dialog').getByLabel('ইমেইল').fill('rumana@gmail.com');
      },
    }),
    one('sh-identity-code', {
      then: async (page) => {
        await toCode(page);
        await typeCode(page, '123');
      },
    }),
    one('account-email-added', {
      then: async (page) => {
        await toCode(page);
        await typeCode(page, '123456');
        await click('ভেরিফাই করুন')(page);
        await page.getByRole('status').waitFor();
      },
    }),
    one('account-connected', {
      path: '/account?connected=facebook',
      state: {
        identities: [...drawnIdentities(), { id: 'i-4', kind: 'facebook', value: 'Rumana Akter' }],
      },
    }),
    one('sh-identity-remove', {
      then: async (page) => {
        await page.getByRole('button', { name: 'সরান', exact: true }).first().click();
      },
    }),
    one('sh-identity-last', {
      then: async (page) => {
        await page.route('**/api/v1/me/identities/i-3', (route) =>
          route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              statusCode: 409,
              message: 'Only way in.',
              errors: { code: 'conflict', details: {} },
            }),
          }),
        );
        await page.getByRole('button', { name: 'সরান', exact: true }).first().click();
        await page.getByRole('dialog').getByRole('button', { name: 'সরান', exact: true }).click();
      },
    }),
    one('account-staff', { state: staff() }),
    one('sh-password-staff', { state: staff(), then: click('পাসওয়ার্ড বদলান') }),
  ];
}

/** Facebook and Meta (§7.27): connected, nothing connected yet, and the new feed link's sheet. */
function metaPairs(): Pair[] {
  const one = (
    name: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({
    name,
    screen: name,
    device,
    language,
    path: '/settings/meta',
    ...more,
  });
  return [
    one('meta'),
    one('meta', {}, 'desktop', 'en'),
    one('meta-empty', { state: { meta: emptyMeta() } }),
    one('sh-feed-regenerate', {
      then: async (page) => {
        await page.getByRole('button', { name: 'নতুন লিংক' }).click();
      },
    }),
  ];
}

/** API keys (§7.26): the list, and each sheet as a person reaches it. */
function keyPairs(): Pair[] {
  const one = (
    name: string,
    then?: (page: Page) => Promise<void>,
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path: '/settings/api-keys', then });
  const newKey = async (page: Page) => {
    await page.getByRole('button', { name: 'নতুন কী' }).click();
    await page.getByRole('dialog').getByLabel('ওয়েবসাইট (অরিজিন)').fill('https://meghfashion.com');
  };
  return [
    one('api-keys'),
    one('api-keys', undefined, 'desktop', 'en'),
    one('sh-key-new', newKey),
    one('sh-key-created', async (page) => {
      await newKey(page);
      await page.getByRole('dialog').getByLabel('নাম').fill('Website');
      await page.getByRole('button', { name: 'কী তৈরি' }).click();
      await page.getByRole('dialog').getByText('lytro_pk_').waitFor();
    }),
    one('sh-key-revoke', async (page) => {
      await page.getByRole('button', { name: 'ক্যানসেল' }).first().click();
    }),
    one('sh-key-edit', async (page) => {
      await page.getByRole('button', { name: /^Website/ }).click();
    }),
  ];
}

/**
 * Team (§7.14, Slice 11.6), People and Roles with Parts 11 and 12's states, each reached as a person would. A sheet
 * opened over People needs a free seat, so those draw three seats behind the scrim where the prototype has two.
 */
function teamPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  const click = (label: string | RegExp) => async (page: Page) => {
    await page.getByRole('button', { name: label }).first().click();
  };
  const steps =
    (...each: ((page: Page) => Promise<void>)[]) =>
    async (page: Page) => {
      for (const step of each) await step(page);
    };
  const seatFree = drawnTeam('bn');
  seatFree.seats = 3;
  const noRoles = { ...drawnTeam('bn'), roles: [] };
  noRoles.seats = 3;
  const seatsFull = { money: { usage: { used: { seats: 2 } } } };
  const typePerson = async (page: Page) => {
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('ফোন নম্বর').fill('1611 222 333');
    await sheet.getByLabel('নাম (অপশনাল)').fill('কামাল');
  };
  const newBillingRole = async (page: Page) => {
    await page.getByRole('dialog').getByLabel('রোলের নাম').fill('বিলিং স্টাফ');
    for (const words of [
      'ব্যালেন্স দেখা',
      'ব্যালেন্স টপ-আপ করা',
      'প্ল্যান ও বিলিং দেখা',
      'প্ল্যান, অ্যাড-অন ও প্যাকের পেমেন্ট করা',
      'অ্যাক্টিভিটি দেখা',
    ]) {
      await page.getByRole('checkbox', { name: words }).check();
    }
    // Ticking scrolled the sheet to the last; the drawing shows it from the top.
    await page.evaluate(() => {
      for (const body of document.querySelectorAll('dialog[open] .overflow-y-auto'))
        body.scrollTop = 0;
    });
  };
  const kamal = click(/কামাল হোসেন/);
  return [
    one('team', '/team'),
    one('team', '/team', {}, 'desktop', 'en'),
    one('staff-add', '/team', {
      screen: 'staff',
      state: { team: seatFree },
      before: (page) => drawnPasswords(page, ['k7m4-p9qx']),
      then: click('স্টাফ যোগ'),
    }),
    one('sh-staff-edit', '/team', { then: kamal }),
    one('sh-staff-password', '/team', {
      before: (page) => drawnPasswords(page, ['h3vd-8wqs']),
      then: steps(kamal, click(/পাসওয়ার্ড রিসেট/)),
    }),
    one('sh-staff-deactivate', '/team', { then: steps(kamal, click(/ইনঅ্যাক্টিভ করুন/)) }),
    one('team-deactivated', '/team', {
      then: steps(kamal, click(/ইনঅ্যাক্টিভ করুন/), async (page) => {
        await page
          .getByRole('dialog', { name: /ইনঅ্যাক্টিভ করবেন/ })
          .getByRole('button', { name: 'ইনঅ্যাক্টিভ করুন', exact: true })
          .click();
      }),
    }),
    one('sh-staff-reactivate-full', '/team', {
      state: seatsFull,
      then: steps(click(/সাবরিনা/), click(/আবার অ্যাক্টিভ করুন/)),
    }),
    one('team-full-add', '/team', { state: seatsFull, then: click('স্টাফ যোগ') }),
    one('team-full-add-nopay', '/team', {
      state: { ...seatsFull, isOwner: false, permissions: ['staff:read', 'staff:manage'] },
      then: click('স্টাফ যোগ'),
    }),
    one('sh-staff-no-roles', '/team', {
      state: { team: noRoles },
      before: (page) => drawnPasswords(page, ['k7m4-p9qx']),
      then: steps(click('স্টাফ যোগ'), typePerson),
    }),
    one('sh-staff-role-new', '/team', {
      state: { team: { ...noRoles, roles: [] } },
      before: (page) => drawnPasswords(page, ['k7m4-p9qx']),
      then: steps(click('স্টাফ যোগ'), typePerson, click('নতুন রোল'), newBillingRole),
    }),
    one('sh-staff-role-back', '/team', {
      state: { team: { ...noRoles, roles: [] } },
      before: (page) => drawnPasswords(page, ['k7m4-p9qx']),
      then: steps(
        click('স্টাফ যোগ'),
        typePerson,
        click('নতুন রোল'),
        newBillingRole,
        click('তৈরি করে বেছে নিন'),
      ),
    }),
    one('roles', '/team/roles'),
    one('roles', '/team/roles', {}, 'desktop', 'en'),
    one('roles-new', '/team/roles', { then: click('নতুন রোল') }),
    one('roles-empty', '/team/roles', {
      state: { team: { seats: 2, roles: [], staff: drawnTeam('bn').staff.slice(0, 1) } },
    }),
  ];
}

/** The Menu hub's own page and Activity (§7.18, §7.15, Slice 11.6), with Part 11's staff, install and empty states. */
function menuPairs(): Pair[] {
  const one = (
    name: string,
    path: string,
    more: Partial<Pair> = {},
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => ({ name, screen: name, device, language, path, ...more });
  const noFailures = drawnActivity('bn').filter((each) => each.result !== 'failure');
  return [
    one('menu', '/menu'),
    one('menu', '/menu', {}, 'desktop', 'en'),
    one('menu-staff', '/menu', { state: BILLING_STAFF }),
    one('menu-install', '/menu', { then: offerInstall }),
    one('menu-install-ios', '/menu', { before: onAnIphone }),
    one('activity', '/activity'),
    one('activity', '/activity', {}, 'desktop', 'en'),
    one('activity-empty', '/activity', { state: { activity: { entries: [], earlier: [] } } }),
    one('activity-filter-empty', '/activity', {
      state: { activity: { entries: noFailures, earlier: [] } },
      then: async (page) => {
        await page.getByRole('button', { name: 'শুধু ফেইলড' }).click();
        // The click scrolled the chips to it; the drawing shows them from the start.
        await page.evaluate(() => {
          for (const row of document.querySelectorAll('[role="group"]')) row.scrollLeft = 0;
        });
      },
    }),
  ];
}

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
  await page.getByLabel('শপের নাম').fill('মেঘ ফ্যাশন');
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

/**
 * Prototype Part 24 (Slice 11.12b): the dashboard in a shop's identity. Each `themed-*` screen is a screen already
 * paired, drawn again with an identity on, so its pair is that one with the same identity on /me.
 */
function themedPairs(paired: Pair[]): Pair[] {
  const themed = (
    base: string,
    name: string,
    brand: () => BrandFixture,
    device: Device = 'phone',
    language: Language = 'bn',
  ): Pair => {
    const from = paired.find(
      (each) => each.name === base && each.device === device && each.language === language,
    );
    if (!from) throw new Error(`No ${base} pair on a ${device} in ${language} to theme`);
    return {
      ...from,
      name,
      screen: name,
      state: { ...from.state, brand: brand(), brandShows: true },
    };
  };
  return [
    themed('home', 'themed-home', maroonBrand),
    themed('home', 'themed-home', maroonBrand, 'desktop', 'en'),
    themed('products', 'themed-products', maroonBrand),
    themed('sh-zone-new', 'themed-zone-sheet', maroonBrand),
    themed('billing', 'themed-billing', maroonBrand),
    themed('brand', 'themed-brand', maroonBrand),
    themed('home', 'themed-b-home', indigoBrand),
    themed('home', 'themed-b-home', indigoBrand, 'desktop', 'en'),
    themed('stock', 'themed-b-stock', indigoBrand),
    themed('sh-zone-delete', 'themed-b-zone-delete', indigoBrand),
  ];
}

const THEMED = themedPairs([...PAIRS, ...MONEY]);

/** Scrolls a heading to the top of its scrolling page, behind any open sheet. */
async function scrollTo(within: Locator, heading: RegExp): Promise<void> {
  await within
    .getByRole('heading', { name: heading })
    .first()
    .evaluate((element) => {
      element.scrollIntoView({ block: 'start' });
    });
}

test.describe('the built shell beside the prototype', () => {
  for (const pair of [...PAIRS, ...MONEY, ...STEPS, ...THEMED]) {
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
      if (pair.scroll) await scrollTo(drawing.locator('#frame .shell'), pair.scroll);
      await drawing.locator('#frame .shell').screenshot({ path: `${out}-prototype.png` });
      await drawing.close();

      const app = await browser.newPage({ viewport: AREA[pair.device] });
      if (pair.before) await pair.before(app);
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
      if (pair.scroll) await scrollTo(app.getByRole('main'), pair.scroll);
      await app.waitForTimeout(300);
      await app.screenshot({ path: `${out}-app.png` });
      await app.close();
    });
  }
});
