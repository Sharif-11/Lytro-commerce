import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import type { CartLine } from '../src/lib/cart/cart-store';
import {
  CODE,
  eidCombo,
  EMBROIDER,
  GIFT_WRAP,
  hijab,
  idOf,
  jacket,
  type Language,
  PACKING,
  panjabi,
  rumana,
  RUMANA_PASSWORD,
  THANA,
  type ShopFixture,
  threePiece,
  trackedOrder,
  VAT,
  WRAP,
} from './support/fixtures';
import { openShop, seedArea, seedCart, signIn } from './support/shop';

// STOREFRONT-DESIGN §11: each built screen beside the prototype's drawing of it, at the prototype's own frame sizes, saved
// to test-results/compare for the pull request and CI's artifacts. No pixel baseline is committed: a font renders a little
// differently on Windows and Linux, so the pictures are for a person to compare.
const PROTOTYPE = pathToFileURL(
  resolve(__dirname, '../../../docs/brand/lytro-storefront.html'),
).href;

type Device = 'phone' | 'desktop';

// The area the prototype's frame gives its shell, long enough to hold a whole page: a person reads the whole of it.
const AREA: Record<Device, { width: number; height: number }> = {
  phone: { width: 374, height: 1900 },
  desktop: { width: 1280, height: 1300 },
};

interface Pair {
  name: string;
  screen: string;
  path: string;
  shop?: (language: Language) => Partial<ShopFixture>;
  cart?: (language: Language) => CartLine[];
  area?: number;
  /** Signed in as the shop's first shopper before the page opens. */
  signedIn?: boolean;
  then?: (page: Page, language: Language) => Promise<void>;
}

const pick = (language: Language, bn: string, en: string) => (language === 'bn' ? bn : en);

/** The prototype's `E48_LINES`: a panjabi with gift wrap, an Eid combo, two hijabs. */
function drawnLines(language: Language): CartLine[] {
  const wrap = pick(language, 'গিফট র‍্যাপ', 'Gift wrap');
  return [
    {
      variantId: idOf(`panjabi-M ${pick(language, 'সাদা', 'White')}`),
      productSlug: 'cotton-panjabi',
      name: pick(language, 'কটন পাঞ্জাবি', 'Cotton Panjabi'),
      choice: pick(language, 'M · সাদা', 'M · White'),
      price: '1250.00',
      image: null,
      quantity: 1,
      modifiers: [{ groupId: GIFT_WRAP.id, optionIds: [WRAP] }],
      addOns: [{ name: wrap, priceChange: '50.00' }],
    },
    {
      variantId: idOf('eid-v'),
      productSlug: 'eid-combo',
      name: pick(language, 'ঈদ কম্বো', 'Eid combo'),
      choice: '',
      price: '1500.00',
      image: null,
      quantity: 1,
      comboPicks: [{ part: 1, variantIds: ['combo-L'] }],
      partsText: pick(language, 'পাঞ্জাবি L, চেক লুঙ্গি', 'Panjabi L, Check lungi'),
    },
    {
      variantId: idOf('hijab-কালো'),
      productSlug: 'chiffon-hijab',
      name: pick(language, 'শিফন হিজাব', 'Chiffon hijab'),
      choice: pick(language, 'কালো', 'Black'),
      price: '350.00',
      image: null,
      quantity: 2,
    },
  ];
}

/** The same in the words a shop in this language has its hijab under. */
function lines(language: Language): CartLine[] {
  const [first, second, third] = drawnLines(language);
  if (!first || !second || !third) throw new Error('the sketch draws three lines');
  return [first, second, { ...third, variantId: idOf(`hijab-${pick(language, 'কালো', 'Black')}`) }];
}

const wrapGroup = (language: Language) => {
  const name = pick(language, 'গিফট র‍্যাপ', 'Gift wrap');
  return {
    ...GIFT_WRAP,
    name,
    options: [{ ...GIFT_WRAP.options[0], id: WRAP, name, priceChange: '50.00', isDefault: false }],
  };
};
const askedName = (language: Language) => ({
  ...EMBROIDER,
  name: pick(language, 'যে নাম এমব্রয়ডারি হবে', 'Name to embroider'),
});

/** Megh with the panjabi's gift wrap, as the sketch's order has it. */
const wrapped = (language: Language): Partial<ShopFixture> => {
  const base = { ...panjabi(language, { tax: VAT }) };
  base.product = { ...base.product, modifierGroups: [wrapGroup(language)] };
  return { products: [base, ...shopRest(language)] };
};

function shopRest(language: Language) {
  return [hijab(language), eidCombo(language), jacket(language), threePiece(language)];
}

async function fillCheckout(
  page: Page,
  language: Language,
  thana: number = THANA.mirpur,
  district = 1,
) {
  await page.locator('#co-name').fill(pick(language, 'রুমানা আক্তার', 'Rumana Akter'));
  await page.locator('#co-phone').fill('01711 223344');
  await page.locator('.grid2 select').first().selectOption(String(district));
  await page.locator('.grid2 select').last().selectOption(String(thana));
  await page
    .locator('#co-address')
    .fill(pick(language, 'বাসা ১২/বি, রোড ৩, মিরপুর ১০', 'House 12/B, Road 3, Mirpur 10'));
}

async function fillLanding(
  page: Page,
  language: Language,
  thana: number = THANA.mirpur,
  district = 1,
) {
  await page.locator('#order-name').fill(pick(language, 'রুমানা আক্তার', 'Rumana Akter'));
  await page.locator('#order-phone').fill('01711 223344');
  await page.locator('.grid2 select').first().selectOption(String(district));
  await page.locator('.grid2 select').last().selectOption(String(thana));
}

const placeButton = (page: Page) => page.locator('.side .btn.primary.lg');

const withRumana = (language: Language): Partial<ShopFixture> => ({ shoppers: [rumana(language)] });

/** A wrong password, this many times, so the page says what the sketch draws of it. */
async function tryPassword(page: Page, times: number) {
  await page.locator('#si-phone').fill('01711 223344');
  await page.locator('#si-password').fill('not-the-one');
  for (let tries = 0; tries < times; tries += 1) {
    const answered = page.waitForResponse('**/api/shopper/signin');
    await page.locator('form button[type="submit"]').click();
    await answered;
    await expect(page.locator('.banner')).toBeVisible();
  }
}

async function sendCode(page: Page) {
  await page.locator('#su-phone').fill('01711 223344');
  await page.locator('form button[type="submit"]').click();
}

async function toDetails(page: Page, code: string) {
  await sendCode(page);
  await page.locator('#su-code').fill(code);
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('#su-name')).toBeVisible();
}

async function placeAndWait(page: Page) {
  await expect(placeButton(page)).toBeEnabled();
  await placeButton(page).click();
}

/** A tracked order as the sketch draws it: its three lines, ৳3,570 in all. */
function drawnTracked(language: Language, stage: Parameters<typeof trackedOrder>[1]) {
  const order = trackedOrder(language, stage);
  return {
    K7F2M9QX: {
      ...order,
      items: [
        ...order.items.map((item) => ({ ...item, captured: [] })),
        {
          variantId: idOf('hijab'),
          productName: pick(language, 'শিফন হিজাব', 'Chiffon hijab'),
          attributes: [
            { name: 'Colour', value: pick(language, 'কালো', 'Black'), variantDefining: true },
          ],
          quantity: '2.000',
          stockUnit: order.items[0]?.stockUnit ?? ('piece' as never),
          unitPrice: '350.00',
          itemTotal: '700.00',
          modifiers: [],
          captured: [],
          components: [],
        },
      ],
      subtotal: '3500.00',
      grandTotal: '3570.00',
      codAmount: '3570.00',
      due: '3570.00',
      taxes: [{ name: 'VAT', rate: '5.00', amount: '166.67' }],
    },
  };
}

const PAIRS: Pair[] = [
  // Checkout (§7a, §7b).
  {
    name: 'checkout',
    screen: 'checkout',
    path: '/checkout',
    shop: wrapped,
    cart: lines,
    then: fillCheckout,
  },
  {
    name: 'checkout-errors',
    screen: 'checkout-errors',
    path: '/checkout',
    shop: wrapped,
    cart: lines,
    then: async (page) => {
      await page.locator('#co-phone').fill('0171');
      await page.locator('.grid2 select').first().selectOption('1');
      await placeButton(page).click();
    },
  },
  {
    name: 'checkout-nodelivery',
    screen: 'checkout-nodelivery',
    path: '/checkout',
    shop: wrapped,
    cart: lines,
    then: async (page, language) => {
      await fillCheckout(page, language, THANA.ruma, 7);
    },
  },
  {
    name: 'checkout-advance',
    screen: 'e48-checkout-advance',
    path: '/checkout',
    shop: wrapped,
    cart: (language) => [
      ...lines(language),
      {
        variantId: idOf('lawn-L'),
        productSlug: 'lawn-three-piece',
        name: pick(language, 'লন থ্রি-পিস', 'Lawn three-piece'),
        choice: 'L',
        price: '1850.00',
        image: null,
        quantity: 1,
      },
    ],
    then: fillCheckout,
  },
  {
    name: 'checkout-short',
    screen: 'e48-checkout-short',
    path: '/checkout',
    shop: (language) => ({
      ...wrapped(language),
      nextOrders: [
        { refuse: { status: 409, code: 'conflict', details: { variantId: idOf('jacket-M') } } },
      ],
    }),
    cart: (language) => [
      ...lines(language),
      {
        variantId: idOf('jacket-M'),
        productSlug: 'denim-jacket',
        name: pick(language, 'ডেনিম জ্যাকেট', 'Denim jacket'),
        choice: 'M',
        price: '1890.00',
        image: null,
        quantity: 1,
      },
    ],
    then: async (page, language) => {
      await fillCheckout(page, language);
      await placeAndWait(page);
      await expect(page.locator('.cl.off')).toBeVisible();
    },
  },
  {
    name: 'checkout-failed',
    screen: 'e48-checkout-failed',
    path: '/checkout',
    shop: (language) => ({
      ...wrapped(language),
      nextOrders: [{ refuse: { status: 500, code: 'internal_error' } }],
    }),
    cart: lines,
    then: async (page, language) => {
      await fillCheckout(page, language);
      await placeAndWait(page);
      await expect(page.locator('.banner.bad')).toBeVisible();
    },
  },
  {
    name: 'checkout-busy',
    screen: 'e48-checkout-busy',
    path: '/checkout',
    shop: (language) => ({
      ...wrapped(language),
      nextOrders: [{ refuse: { status: 429, code: 'rate_limited' } }],
    }),
    cart: lines,
    then: async (page, language) => {
      await fillCheckout(page, language);
      await placeAndWait(page);
      await expect(page.locator('.banner.warn')).toBeVisible();
    },
  },
  {
    name: 'checkout-asked',
    screen: 'e48-checkout-asked',
    path: '/checkout',
    shop: (language) => {
      const base = wrapped(language);
      const [first, ...rest] = base.products ?? [];
      return first
        ? {
            ...base,
            products: [
              { ...first, product: { ...first.product, asked: [askedName(language)] } },
              ...rest,
            ],
          }
        : base;
    },
    cart: (language) => {
      const [first, ...rest] = lines(language);
      return first
        ? [
            {
              ...first,
              answers: [
                {
                  attributeId: EMBROIDER.attributeId,
                  name: askedName(language).name,
                  value: 'Rafi',
                },
              ],
            },
            ...rest,
          ]
        : [];
    },
    then: fillCheckout,
  },
  { name: 'checkout-empty', screen: 'e48-checkout-empty', path: '/checkout' },
  // Order placed.
  {
    name: 'placed',
    screen: 'confirm-cod',
    path: '/checkout',
    shop: wrapped,
    cart: lines,
    then: async (page, language) => {
      await fillCheckout(page, language);
      await placeAndWait(page);
      await page.waitForURL('**/order/K7F2M9QX');
    },
  },
  {
    name: 'placed-later',
    screen: 'e48-placed-later',
    path: '/order/K7F2M9QX',
    shop: (language) => ({ tracked: drawnTracked(language, 'placed') }),
  },
  // Tracking.
  {
    name: 'tracking',
    screen: 'tracking',
    path: '/track/K7F2M9QX',
    shop: (language) => ({ tracked: drawnTracked(language, 'shipped') }),
  },
  {
    name: 'tracking-new',
    screen: 'e48-tracking-new',
    path: '/track/K7F2M9QX',
    shop: (language) => ({ tracked: drawnTracked(language, 'placed') }),
  },
  {
    name: 'tracking-confirmed',
    screen: 'e48-tracking-confirmed',
    path: '/track/K7F2M9QX',
    shop: (language) => ({ tracked: drawnTracked(language, 'confirmed') }),
  },
  {
    name: 'tracking-cancelled',
    screen: 'e48-tracking-cancelled',
    path: '/track/K7F2M9QX',
    shop: (language) => ({ tracked: drawnTracked(language, 'cancelled') }),
  },
  {
    name: 'tracking-delivered',
    screen: 'e48-tracking-delivered',
    path: '/track/K7F2M9QX',
    shop: (language) => ({ tracked: drawnTracked(language, 'delivered') }),
  },
  {
    name: 'tracking-returned',
    screen: 'e48-tracking-returned',
    path: '/track/K7F2M9QX',
    shop: (language) => ({ tracked: drawnTracked(language, 'returned') }),
  },
  { name: 'tracking-start', screen: 'e48-tracking-start', path: '/track' },
  { name: 'tracking-none', screen: 'e48-tracking-none', path: '/track/K7F2M9QX' },
  // The pickers.
  {
    name: 'combo',
    screen: 'combo',
    path: '/p/eid-combo',
    then: async (page) => {
      await page.locator('.combo button.vb', { hasText: /^L$/ }).click();
    },
  },
  {
    name: 'addons',
    screen: 'e48-addons',
    path: '/p/cotton-panjabi',
    shop: wrapped,
    then: async (page) => {
      await page.locator('button.radio').click();
    },
  },
  {
    name: 'addons-required',
    screen: 'e48-addons-required',
    path: '/p/cotton-panjabi',
    shop: (language) => {
      const base = panjabi(language);
      const named = (bn: string, en: string) => pick(language, bn, en);
      return {
        products: [
          {
            ...base,
            product: {
              ...base.product,
              modifierGroups: [
                {
                  ...PACKING,
                  name: named('প্যাকিং', 'Packing'),
                  options: [
                    {
                      ...PACKING.options[0],
                      id: idOf('plain'),
                      name: named('সাধারণ', 'Plain'),
                      priceChange: '0.00',
                      isDefault: false,
                    },
                    {
                      ...PACKING.options[1],
                      id: idOf('box'),
                      name: named('গিফট বক্স', 'Gift box'),
                      priceChange: '80.00',
                      isDefault: false,
                    },
                  ],
                },
              ],
            },
          },
        ],
      };
    },
    then: async (page) => {
      await page
        .locator('.dbtns .btn.ghost, .buybar .btn.primary')
        .filter({ visible: true })
        .last()
        .click();
    },
  },
  {
    name: 'asked',
    screen: 'e48-asked',
    path: '/p/cotton-panjabi',
    shop: (language) => {
      const base = panjabi(language);
      return {
        products: [{ ...base, product: { ...base.product, asked: [askedName(language)] } }],
      };
    },
    then: async (page) => {
      await page.locator('.buy input.input').fill('Rafi');
    },
  },
  // The cart.
  {
    name: 'cart',
    screen: 'e48-cart',
    path: '/p/cotton-panjabi',
    shop: (language) => {
      const base = wrapped(language);
      const [first, ...rest] = base.products ?? [];
      return first
        ? {
            ...base,
            products: [
              { ...first, product: { ...first.product, asked: [askedName(language)] } },
              ...rest,
            ],
          }
        : base;
    },
    cart: (language) => {
      const [first, ...rest] = lines(language);
      return first
        ? [
            {
              ...first,
              answers: [
                {
                  attributeId: EMBROIDER.attributeId,
                  name: askedName(language).name,
                  value: 'Rafi',
                },
              ],
            },
            ...rest,
          ]
        : [];
    },
    area: THANA.mirpur,
    then: async (page) => {
      await page.locator('.hdr button.ib').last().click();
    },
  },
  {
    name: 'cart-refit',
    screen: 'e48-cart-refit',
    path: '/p/cotton-panjabi',
    shop: wrapped,
    cart: (language) => {
      const [first, ...rest] = lines(language);
      return first
        ? [
            ...rest,
            {
              ...first,
              modifiers: [{ groupId: idOf('no-such-group'), optionIds: [] }],
              addOns: [],
            },
          ]
        : [];
    },
    area: THANA.mirpur,
    then: async (page) => {
      await page.locator('.hdr button.ib').last().click();
    },
  },
  // The landing page.
  {
    name: 'landing',
    screen: 'landing',
    path: '/l/cotton-panjabi',
    then: fillLanding,
  },
  {
    name: 'landing-placed',
    screen: 'e48-landing-placed',
    path: '/l/cotton-panjabi',
    then: async (page, language) => {
      await fillLanding(page, language);
      await page
        .locator('#order-address')
        .fill(pick(language, 'বাসা ১২/বি, রোড ৩, মিরপুর ১০', 'House 12/B, Road 3, Mirpur 10'));
      await placeAndWait(page);
      await expect(page.locator('.bare.placed')).toBeVisible();
    },
  },
  {
    name: 'landing-picks',
    screen: 'e48-landing-picks',
    path: '/l/cotton-panjabi',
    shop: (language) => {
      const base = wrapped(language);
      const [first, ...rest] = base.products ?? [];
      return first
        ? {
            ...base,
            products: [
              { ...first, product: { ...first.product, asked: [askedName(language)] } },
              ...rest,
            ],
          }
        : base;
    },
    then: async (page, language) => {
      await page.locator('button.radio').click();
      await fillLanding(page, language);
    },
  },
  {
    name: 'landing-errors',
    screen: 'e48-landing-errors',
    path: '/l/cotton-panjabi',
    then: async (page) => {
      await page.locator('#order-phone').fill('0171');
      await page.locator('.grid2 select').first().selectOption('1');
      await placeButton(page).click();
    },
  },
  {
    name: 'landing-nodelivery',
    screen: 'e48-landing-nodelivery',
    path: '/l/cotton-panjabi',
    then: async (page, language) => {
      await fillLanding(page, language, THANA.ruma, 7);
    },
  },
  {
    name: 'landing-advance',
    screen: 'e48-landing-advance',
    path: '/l/lawn-three-piece',
    then: fillLanding,
  },
  { name: 'landing-out', screen: 'e48-landing-out', path: '/l/kids-frock', then: fillLanding },
  // The account (§7a, §7c).
  {
    name: 'signin',
    screen: 'account-signin',
    path: '/sign-in',
    shop: withRumana,
    then: async (page) => {
      await page.locator('#si-phone').fill('01711 223344');
    },
  },
  {
    name: 'signin-wrong',
    screen: 'e48-signin-wrong',
    path: '/sign-in',
    shop: withRumana,
    then: async (page) => {
      await tryPassword(page, 1);
    },
  },
  {
    name: 'signin-locked',
    screen: 'e48-signin-locked',
    path: '/sign-in',
    shop: withRumana,
    then: async (page) => {
      await tryPassword(page, 6);
    },
  },
  {
    name: 'signin-badphone',
    screen: 'e48-signin-badphone',
    path: '/sign-in',
    shop: withRumana,
    then: async (page) => {
      await page.locator('#si-phone').fill('0171');
      await page.locator('#si-password').fill('x');
      await page.locator('form button[type="submit"]').click();
    },
  },
  {
    name: 'forgot',
    screen: 'e48-forgot',
    path: '/sign-in',
    shop: withRumana,
    then: async (page) => {
      await page.locator('#si-phone').fill('01711 223344');
      await page.locator('form button[type="button"]').click();
    },
  },
  {
    name: 'signup',
    screen: 'e48-signup',
    path: '/sign-up',
    then: async (page) => {
      await page.locator('#su-phone').fill('01711 223344');
    },
  },
  {
    name: 'signup-taken',
    screen: 'e48-signup-taken',
    path: '/sign-up',
    shop: withRumana,
    then: async (page) => {
      await sendCode(page);
      await expect(page.locator('.banner')).toBeVisible();
    },
  },
  {
    name: 'signup-nosend',
    screen: 'e48-signup-nosend',
    path: '/sign-up',
    shop: () => ({ nextCodes: [{ status: 429, code: 'quota_exceeded' }] }),
    then: async (page) => {
      await sendCode(page);
      await expect(page.locator('.banner')).toBeVisible();
    },
  },
  {
    name: 'signup-failed',
    screen: 'e48-signup-failed',
    path: '/sign-up',
    shop: () => ({ nextCodes: [{ status: 503, code: 'service_unavailable' }] }),
    then: async (page) => {
      await sendCode(page);
      await expect(page.locator('.banner')).toBeVisible();
    },
  },
  {
    name: 'otp',
    screen: 'account-otp',
    path: '/sign-up',
    then: async (page) => {
      await sendCode(page);
      await page.locator('#su-code').fill('481');
    },
  },
  {
    name: 'otp-wrong',
    screen: 'e48-otp-wrong',
    path: '/sign-up',
    then: async (page) => {
      await toDetails(page, '481906');
      await page.locator('#su-name').fill('Rafi');
      await page.locator('#su-password').fill('a-good-password');
      await page.locator('form button[type="submit"]').click();
      await expect(page.locator('#su-code')).toBeVisible();
    },
  },
  {
    name: 'otp-old',
    screen: 'e48-otp-old',
    path: '/sign-up',
    shop: () => ({ resendAfterSeconds: 0 }),
    then: async (page) => {
      await toDetails(page, '000000');
      await page.locator('#su-name').fill('Rafi');
      await page.locator('#su-password').fill('a-good-password');
      await page.locator('form button[type="submit"]').click();
      await expect(page.locator('#su-code')).toBeVisible();
    },
  },
  {
    name: 'signup-details',
    screen: 'e48-signup-details',
    path: '/sign-up',
    then: async (page, language) => {
      await toDetails(page, CODE);
      await page.locator('#su-name').fill(pick(language, 'রুমানা আক্তার', 'Rumana Akter'));
    },
  },
  {
    name: 'signup-details-errors',
    screen: 'e48-signup-details-errors',
    path: '/sign-up',
    then: async (page) => {
      await toDetails(page, CODE);
      await page.locator('#su-password').fill('abcd');
      await page.locator('form button[type="submit"]').click();
    },
  },
  { name: 'orders', screen: 'account-orders', path: '/account', shop: withRumana, signedIn: true },
  {
    name: 'orders-empty',
    screen: 'e48-orders-empty',
    path: '/account',
    shop: (language) => ({ shoppers: [rumana(language, { orders: [] })] }),
    signedIn: true,
  },
  {
    name: 'addresses',
    screen: 'account-addresses',
    path: '/account/addresses',
    shop: withRumana,
    signedIn: true,
  },
  {
    name: 'addresses-empty',
    screen: 'e48-addresses-empty',
    path: '/account/addresses',
    shop: (language) => ({ shoppers: [rumana(language, { addresses: [] })] }),
    signedIn: true,
  },
  {
    name: 'address-new',
    screen: 'e48-address-new',
    path: '/account/addresses',
    shop: withRumana,
    signedIn: true,
    then: async (page) => {
      await page.locator('button.btn.ghost.block').click();
      await page.locator('[role="dialog"] .grid2 select').first().selectOption('1');
    },
  },
  {
    name: 'address-edit',
    screen: 'e48-address-edit',
    path: '/account/addresses',
    shop: withRumana,
    signedIn: true,
    then: async (page) => {
      await page.locator('button.btn.quiet').last().click();
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    },
  },
  {
    name: 'address-errors',
    screen: 'e48-address-errors',
    path: '/account/addresses',
    shop: withRumana,
    signedIn: true,
    then: async (page) => {
      await page.locator('button.btn.ghost.block').click();
      await page.locator('[role="dialog"] .grid2 select').first().selectOption('1');
      await page.locator('[role="dialog"] .sf .btn.primary').click();
    },
  },
  {
    name: 'address-full',
    screen: 'e48-address-full',
    path: '/account/addresses',
    shop: (language) => {
      const [home, office] = rumana(language).addresses;
      if (!home || !office) throw new Error('Rumana has two addresses');
      const more = Array.from({ length: 8 }, (_, at) => ({
        ...office,
        id: idOf(`more-${String(at)}`),
      }));
      return { shoppers: [rumana(language, { addresses: [home, office, ...more] })] };
    },
    signedIn: true,
  },
  {
    name: 'profile',
    screen: 'e48-profile',
    path: '/account/profile',
    shop: withRumana,
    signedIn: true,
  },
  {
    name: 'profile-saved',
    screen: 'e48-profile-saved',
    path: '/account/profile',
    shop: withRumana,
    signedIn: true,
    then: async (page) => {
      await page.locator('form .btn.primary').click();
      await expect(page.locator('.toast')).toBeVisible();
    },
  },
  {
    name: 'password-wrong',
    screen: 'e48-password-wrong',
    path: '/account/profile',
    shop: withRumana,
    signedIn: true,
    then: async (page) => {
      await page.locator('#pf-current').fill('not-the-one');
      await page.locator('#pf-new').fill('a-new-password');
      await page.locator('form .btn.ghost').click();
      await expect(page.locator('#pf-current ~ .err')).toBeVisible();
    },
  },
  {
    name: 'password-done',
    screen: 'e48-password-done',
    path: '/account/profile',
    shop: withRumana,
    signedIn: true,
    then: async (page) => {
      await page.locator('#pf-current').fill(RUMANA_PASSWORD);
      await page.locator('#pf-new').fill('a-new-password');
      await page.locator('form .btn.ghost').click();
      await expect(page.locator('.toast')).toBeVisible();
    },
  },
  {
    name: 'checkout-signedin',
    screen: 'e48-checkout-signedin',
    path: '/checkout',
    shop: (language) => ({ ...wrapped(language), shoppers: [rumana(language)] }),
    cart: lines,
    signedIn: true,
  },
  { name: 'header', screen: 'e48-header', path: '/' },
  // The catalogue's pages, whose base type this slice set to the prototype's.
  { name: 'category', screen: 'category', path: '/c/panjabi' },
  { name: 'new-arrivals', screen: 'new-arrivals', path: '/new' },
  // Home's install card, after a first order.
  {
    name: 'install',
    screen: 'home-pwa',
    path: '/',
    then: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem('lytro-ordered', '1');
      });
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, { prompt: () => Promise.resolve() });
        window.dispatchEvent(event);
      });
      await expect(page.locator('.pwa')).toBeVisible();
    },
  },
];

const LANGUAGES: Language[] = ['bn', 'en'];
const DEVICES: Device[] = ['phone', 'desktop'];

test.describe('the built storefront beside the prototype', () => {
  for (const pair of PAIRS) {
    for (const device of DEVICES) {
      for (const language of LANGUAGES) {
        test(`${pair.name} on a ${device} in ${language}`, async ({ browser }) => {
          // The pictures set their own sizes, so they are taken once, not in every project.
          test.skip(test.info().project.name !== 'desktop', 'taken once, in the desktop project');
          const out = `test-results/compare/${pair.name}-${device}-${language}`;
          const area = AREA[device];

          const drawing = await browser.newPage({ viewport: { width: 1500, height: 2100 } });
          await drawing.goto(PROTOTYPE);
          await drawing.click(`#segLang button[data-v="${language}"]`);
          await drawing.click(`#segDevice button[data-v="${device}"]`);
          // As long as the app's window, so the whole page is on both pictures.
          await drawing.addStyleTag({
            content: `.frame.phone{height:${String(area.height + 60)}px!important}.frame.desktop{height:${String(area.height + 42)}px!important}`,
          });
          await drawing.selectOption('#selScreen', pair.screen);
          await drawing.waitForTimeout(400);
          await drawing.locator('#frame .shell').screenshot({ path: `${out}-prototype.png` });
          await drawing.close();

          const context = await browser.newContext({ viewport: area, serviceWorkers: 'block' });
          const app = await context.newPage();
          const shop = await openShop(app, pair.shop ?? (() => ({})), language);
          if (pair.cart) await seedCart(app, pair.cart(language));
          if (pair.area) await seedArea(app, shop, pair.area);
          if (pair.signedIn) await signIn(app, shop);
          await app.goto(shop.url(pair.path));
          await app.waitForLoadState('networkidle');
          await app.evaluate(() => document.fonts.ready);
          if (pair.then) await pair.then(app, language);
          await app.waitForLoadState('networkidle');
          await app.waitForTimeout(500);
          await app.screenshot({ path: `${out}-app.png` });
          await context.close();
        });
      }
    }
  }
});
