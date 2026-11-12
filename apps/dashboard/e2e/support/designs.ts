import type { Language } from './mock-api';
import { PICKER, type PickerProduct } from './new-order';
import { meghOrders, type OrdersFixture } from './orders';
import { drawnProducts, type ProductFixture, type ProductsFixture } from './products';
import { DESIGN_ATTRIBUTE_ID } from './variants';

// TENANT-DASHBOARD-DESIGN §7.42 (Part 40): the prototype's burka, its photos as its designs, for the designs spec and
// the pictures beside the prototype. Design names are the seller's words, so each language has its own.

type Words = [string, string];
const say = (words: Words, language: Language): string => (language === 'bn' ? words[0] : words[1]);
export const DESIGN_ONE: Words = ['ডিজাইন 1', 'Design 1'];
export const STRIPE: Words = ['স্ট্রাইপ', 'Stripe'];

/** A picture the browser can show, standing in for a design's stored cover. */
export const shot = (id: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="40" height="50" fill="#1f2a44"/><text x="4" y="30" fill="#fff">${id}</text></svg>`,
  )}`;

/** The burka: Design 1, and Stripe in two angles, each in 54 and 56. */
export function burka(
  over: Partial<ProductFixture> = {},
  language: Language = 'en',
): ProductFixture {
  return {
    id: 'p-burka',
    name: ['ইরানি বোরকা', 'Irani burka'],
    basePrice: '2450.00',
    active: true,
    stockState: 'in',
    primaryCategoryId: null,
    variantCount: 4,
    imageIds: ['m-1', 'm-2', 'm-3'],
    photoDesigns: { 'm-1': 'd-1', 'm-2': 'd-2', 'm-3': 'd-2' },
    designs: [
      { id: 'd-1', name: say(DESIGN_ONE, language), number: 1 },
      { id: 'd-2', name: say(STRIPE, language), number: 2 },
    ],
    nextDesignNumber: 3,
    matrix: {
      splits: [
        { attributeId: DESIGN_ATTRIBUTE_ID, optionIds: ['d-1', 'd-2'] },
        { attributeId: 'a-1', optionIds: ['o-1-54', 'o-1-56'] },
      ],
      rows: [
        { id: 'v-1-54', optionIds: ['d-1', 'o-1-54'], price: null, sku: 'IB-D1-54', onHand: 3 },
        { id: 'v-1-56', optionIds: ['d-1', 'o-1-56'], price: null, sku: 'IB-D1-56', onHand: 0 },
        { id: 'v-2-54', optionIds: ['d-2', 'o-1-54'], price: null, sku: 'IB-D2-54', onHand: 2 },
        { id: 'v-2-56', optionIds: ['d-2', 'o-1-56'], price: null, sku: 'IB-D2-56', onHand: 5 },
      ],
    },
    ...over,
  };
}

/** The shop with the burka first, its products as drawn, and the burka in the order picker. */
export function withBurka(product: ProductFixture = burka()): ProductsFixture {
  const products = drawnProducts();
  return {
    ...products,
    products: [product, ...products.products],
    picker: [...PICKER, burkaPicker()],
  };
}

/** The burka in the order picker: each variant with its design's cover and name, and its size. */
export function burkaPicker(): PickerProduct {
  const design = (id: string, name: Words, image: string) => ({ id, name, image });
  const one = design('d-1', DESIGN_ONE, shot('m-1'));
  const stripe = design('d-2', STRIPE, shot('m-2'));
  const label = (name: Words, size: string): Words => [
    `${name[0]} · ${size}`,
    `${name[1]} · ${size}`,
  ];
  return {
    id: 'p-burka',
    name: ['ইরানি বোরকা', 'Irani burka'],
    kind: 'ordinary',
    variants: [
      {
        id: 'v-1-54',
        label: label(DESIGN_ONE, '54'),
        rest: ['54', '54'],
        design: one,
        price: 2450,
        available: 3,
      },
      {
        id: 'v-1-56',
        label: label(DESIGN_ONE, '56'),
        rest: ['56', '56'],
        design: one,
        price: 2450,
        available: 0,
      },
      {
        id: 'v-2-54',
        label: label(STRIPE, '54'),
        rest: ['54', '54'],
        design: stripe,
        price: 2450,
        available: 2,
      },
      {
        id: 'v-2-56',
        label: label(STRIPE, '56'),
        rest: ['56', '56'],
        design: stripe,
        price: 2450,
        available: 5,
      },
    ],
  };
}

/** Part 29's day, its first order's first line the burka in Stripe, size 54, with its SKU and its design's cover. */
export function burkaOrders(): OrdersFixture {
  const orders = meghOrders();
  const placed = orders.orders.find((each) => each.id === 'o-47');
  const [first] = placed?.items ?? [];
  if (first) {
    Object.assign(first, {
      name: ['ইরানি বোরকা', 'Irani burka'],
      variant: [`${STRIPE[0]} · 54`, `${STRIPE[1]} · 54`],
      quantity: 1,
      unitPrice: 2450,
      sku: 'IB-D2-54',
      design: true,
      thumbnail: shot('m-2'),
    });
  }
  return orders;
}
