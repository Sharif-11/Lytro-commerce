import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OrderStatus, PaymentSessionState, StockUnit } from '@lytronix/validators/enums';
import { expect, type Page, test } from '@playwright/test';
import type { CartLine } from '../src/lib/cart/cart-store';
import {
  CODE,
  designed,
  eidCombo,
  EMBROIDER,
  GIFT_WRAP,
  hijab,
  idOf,
  makeProduct,
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

type Device = 'phone' | 'tablet' | 'desktop';

// The area the prototype's frame gives its shell, long enough to hold a whole page: a person reads the whole of it.
const AREA: Record<Device, { width: number; height: number }> = {
  phone: { width: 374, height: 1900 },
  tablet: { width: 804, height: 1900 },
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
  /** The frames it is drawn in; the phone and the computer unless it says. */
  devices?: Device[];
}

const pick = (language: Language, bn: string, en: string) => (language === 'bn' ? bn : en);

/** LND-07: the sketch's rice, sold by the kg. */
const measured = (language: Language): Partial<ShopFixture> => ({
  products: [
    makeProduct({
      id: idOf('rice'),
      slug: 'miniket-rice',
      name: pick(language, 'মিনিকেট চাল', 'Miniket rice'),
      price: 85,
      stockUnit: StockUnit.Kg,
    }),
  ],
});

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
/** Slice 6.7: the sketch's shipped order with its courier's latest words, as tracking reads them. */
function courierSaid(
  language: Language,
  said: { en: string; bn: string },
  patch: Record<string, unknown> = {},
): Partial<ShopFixture> {
  const drawn = drawnTracked(language, 'shipped');
  return {
    tracked: {
      K7F2M9QX: {
        ...drawn.K7F2M9QX,
        courier: {
          name: 'Steadfast',
          trackingCode: '15BAEB8A',
          trackingLink: 'https://steadfast.example/t/15BAEB8A',
        },
        courierMessage: { ...said, at: '2026-11-06T04:30:00.000Z' },
        ...patch,
      },
    },
  };
}

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
          thumbnail: null,
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

/** The sketch's cart with an advance: what it already draws, and a three-piece asking ৳200. */
const advanceCart = (language: Language) => [
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
];

/** An order that owed the sketch's ৳200, as tracking reads it. */
const owedShop =
  (status: OrderStatus, state: PaymentSessionState | null) =>
  (language: Language): Partial<ShopFixture> => ({
    tracked: {
      K7F2M9QX: {
        ...trackedOrder(language, 'placed'),
        orderNumber: '261104-0042',
        status,
        grandTotal: '5420.00',
        codAmount: '5220.00',
        due: '5220.00',
        payment:
          state === null
            ? null
            : {
                paymentUrl: 'http://localhost:4181/__pay/K7F2M9QX',
                amount: '200.00',
                expiresAt: new Date(Date.now() + 18 * 60_000).toISOString(),
                state,
              },
      },
    },
  });

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
    screen: 'pay58-checkout',
    path: '/checkout',
    shop: wrapped,
    cart: advanceCart,
    then: fillCheckout,
  },
  {
    name: 'checkout-none',
    screen: 'pay58-checkout-none',
    path: '/checkout',
    shop: (language) => ({ ...wrapped(language), paymentMethods: [] }),
    cart: advanceCart,
    then: fillCheckout,
  },
  {
    name: 'checkout-cap',
    screen: 'pay58-checkout-cap',
    path: '/checkout',
    shop: (language) => ({
      ...wrapped(language),
      nextOrders: [
        { refuse: { status: 409, code: 'conflict', details: { reason: 'new_shop_cap' } } },
      ],
    }),
    cart: advanceCart,
    then: async (page, language) => {
      await fillCheckout(page, language);
      await page.locator('.side .btn.primary').click();
    },
  },
  {
    name: 'pay-paid',
    screen: 'pay-paid',
    path: '/order/K7F2M9QX',
    shop: owedShop(OrderStatus.Pending, null),
  },
  {
    name: 'pay-checking',
    screen: 'pay-checking',
    path: '/order/K7F2M9QX',
    shop: owedShop(OrderStatus.Unverified, PaymentSessionState.Checking),
  },
  {
    name: 'pay-unpaid',
    screen: 'pay-cancelled',
    path: '/order/K7F2M9QX',
    shop: owedShop(OrderStatus.Unverified, PaymentSessionState.AwaitingPayment),
  },
  {
    name: 'pay-expired',
    screen: 'pay-expired',
    path: '/order/K7F2M9QX',
    shop: owedShop(OrderStatus.Cancelled, null),
  },
  {
    name: 'pay-tracking',
    screen: 'pay58-tracking',
    path: '/track/K7F2M9QX',
    shop: owedShop(OrderStatus.Unverified, PaymentSessionState.AwaitingPayment),
  },
  {
    name: 'pay-tracking-checking',
    screen: 'pay58-tracking-checking',
    path: '/track/K7F2M9QX',
    shop: owedShop(OrderStatus.Unverified, PaymentSessionState.Checking),
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
    screen: 'pay58-landing',
    path: '/l/lawn-three-piece',
    then: fillLanding,
  },
  { name: 'landing-out', screen: 'e48-landing-out', path: '/l/kids-frock', then: fillLanding },
  {
    name: 'product-kg',
    screen: 'e48-product-kg',
    path: '/p/miniket-rice',
    shop: measured,
    then: async (page) => {
      await page.getByRole('button', { name: '+', exact: true }).first().click();
    },
  },
  {
    name: 'landing-kg',
    screen: 'e48-landing-kg',
    path: '/l/miniket-rice',
    shop: measured,
    then: async (page, language) => {
      await page.getByRole('button', { name: '−', exact: true }).first().click();
      await fillLanding(page, language);
    },
  },
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
  // Phase 6 Slice 6.7 (STOREFRONT-DESIGN §7e): the courier's own words on tracking.
  {
    name: 'tracking-courier',
    screen: 't67-tracking',
    path: '/track/K7F2M9QX',
    shop: (language) =>
      courierSaid(language, {
        en: 'Your parcel is out with the rider and arrives today.',
        bn: 'পার্সেলটি রাইডারের কাছে আছে, আজ ডেলিভারি হবে।',
      }),
  },
  {
    name: 'tracking-courier-redx',
    screen: 't67-tracking-redx',
    path: '/track/K7F2M9QX',
    shop: (language) =>
      courierSaid(
        language,
        {
          en: 'Your parcel has reached the Mirpur hub.',
          bn: 'পার্সেলটি মিরপুর হাবে পৌঁছেছে।',
        },
        {
          courier: {
            name: 'RedX',
            trackingCode: '21A001REDX',
            trackingLink: 'https://redx.example/track/21A001REDX',
          },
        },
      ),
  },
  {
    name: 'tracking-courier-partly',
    screen: 't67-tracking-partly',
    path: '/track/K7F2M9QX',
    shop: (language) =>
      courierSaid(
        language,
        { en: 'Partly delivered.', bn: 'আংশিক ডেলিভারি হয়েছে।' },
        { status: OrderStatus.PartialDelivered },
      ),
  },
  {
    name: 'tracking-courier-back',
    screen: 't67-tracking-back',
    path: '/track/K7F2M9QX',
    shop: (language) =>
      courierSaid(
        language,
        { en: 'The parcel is on its way back.', bn: 'পার্সেলটি ফেরত যাচ্ছে।' },
        { courierReturning: true },
      ),
  },
  // Photo designs (STOREFRONT-DESIGN §7f): the photo cards, choosing one, buying before choosing, the landing page, and
  // the cart's trash button, units and highest charge; at the phone's, the tablet's and the computer's width.
  {
    name: 'photos',
    screen: 'product-photos',
    path: '/p/irani-burka',
    shop: (language) => ({ products: [designed(language)] }),
    devices: ['phone', 'tablet', 'desktop'],
    then: async (page) => {
      await page
        .locator('.buy .vals')
        .last()
        .getByRole('button', { name: 'L', exact: true })
        .click();
    },
  },
  {
    name: 'photos-chosen',
    screen: 'product-photos-chosen',
    path: '/p/irani-burka',
    shop: (language) => ({ products: [designed(language)] }),
    devices: ['phone', 'tablet', 'desktop'],
    then: async (page) => {
      await page.locator('.pcards .pcard').nth(2).click();
      await page
        .locator('.buy .vals')
        .last()
        .getByRole('button', { name: 'L', exact: true })
        .click();
    },
  },
  {
    name: 'photos-nudge',
    screen: 'product-photos-nudge',
    path: '/p/irani-burka',
    shop: (language) => ({ products: [designed(language)] }),
    devices: ['phone', 'tablet', 'desktop'],
    then: async (page) => {
      await page
        .locator('.buy .vals')
        .last()
        .getByRole('button', { name: 'L', exact: true })
        .click();
      await page
        .locator('.dbtns .btn.ghost, .buybar .btn.primary')
        .filter({ visible: true })
        .last()
        .click();
      await page.locator('.scroll').evaluate((scroller) => {
        scroller.scrollTo({ top: 0 });
      });
    },
  },
  {
    name: 'landing-photos',
    screen: 'landing-photos',
    path: '/l/irani-burka',
    shop: (language) => ({ products: [designed(language)] }),
    devices: ['phone', 'tablet', 'desktop'],
    then: async (page) => {
      await page.locator('.pcards .pcard').nth(2).click();
      await page
        .locator('.buy .vals')
        .last()
        .getByRole('button', { name: 'M', exact: true })
        .click();
    },
  },
  {
    name: 'cart-photos',
    screen: 'cart',
    path: '/p/cotton-panjabi',
    devices: ['phone', 'tablet', 'desktop'],
    cart: (language) => [
      {
        variantId: idOf(`panjabi-M ${pick(language, 'সাদা', 'White')}`),
        productSlug: 'cotton-panjabi',
        name: pick(language, 'কটন পাঞ্জাবি', 'Cotton Panjabi'),
        choice: pick(language, 'M · সাদা', 'M · White'),
        price: '1250.00',
        image: null,
        quantity: 1,
        stockUnit: StockUnit.Piece,
      },
      {
        variantId: idOf('lawn-L'),
        productSlug: 'lawn-three-piece',
        name: pick(language, 'লন থ্রি-পিস', 'Lawn three-piece'),
        choice: pick(language, 'L · সবুজ', 'L · Green'),
        price: '1850.00',
        image: null,
        quantity: 1,
        stockUnit: StockUnit.Piece,
      },
      {
        variantId: idOf(`hijab-${pick(language, 'কালো', 'Black')}`),
        productSlug: 'chiffon-hijab',
        name: pick(language, 'শিফন হিজাব', 'Chiffon Hijab'),
        choice: pick(language, 'কালো', 'Black'),
        price: '350.00',
        image: null,
        quantity: 2,
        stockUnit: StockUnit.Piece,
      },
    ],
    then: async (page) => {
      await page.locator('.hdr button.ib').last().click();
    },
  },
];

const LANGUAGES: Language[] = ['bn', 'en'];
const DEVICES: Device[] = ['phone', 'desktop'];

test.describe('the built storefront beside the prototype', () => {
  for (const pair of PAIRS) {
    for (const device of pair.devices ?? DEVICES) {
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
            content: `.frame.phone,.frame.tablet{height:${String(area.height + 60)}px!important}.frame.desktop{height:${String(area.height + 42)}px!important}`,
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
