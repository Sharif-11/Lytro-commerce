import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import type { CartLine } from '../../src/lib/cart/cart-store';
import {
  idOf,
  type Language,
  meghShop,
  RUMANA_PASSWORD,
  type SentOrder,
  type ShopFixture,
  type ShopperFixture,
} from './fixtures';
import { MOCK_PORT, STOREFRONT_PORT } from './mock-server';

const MOCK = `http://127.0.0.1:${String(MOCK_PORT)}`;

export interface OpenShop {
  slug: string;
  fixture: ShopFixture;
  /** An address on this shop's own host. */
  url: (path: string) => string;
  /** What the server was sent, and holds of its shoppers. */
  sent: () => Promise<{
    orders: SentOrder[];
    requests: number;
    shopperRequests: number;
    shoppers: ShopperFixture[];
  }>;
}

/** A shop of the test's own, at its own host: `<slug>.localhost` reaches the app, and the host names the shop (TEN-08).
    English unless asked for, so tests read by what they say; `language` also sets the shopper's cookie. */
export async function openShop(
  page: Page,
  overrides: (language: Language) => Partial<ShopFixture> = () => ({}),
  language: Language = 'en',
): Promise<OpenShop> {
  const slug = `t${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const fixture = meghShop(language, { ...overrides(language), slug });
  const made = await fetch(`${MOCK}/__shop`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fixture),
  });
  expect(made.status).toBe(201);
  const origin = `http://${slug}.localhost:${String(STOREFRONT_PORT)}`;
  if (language === 'en') {
    await page.context().addCookies([{ name: 'lytro-lang', value: 'en', url: origin }]);
  }
  return {
    slug,
    fixture,
    url: (path) => `${origin}${path}`,
    sent: async () => {
      const answer = await fetch(`${MOCK}/__orders/${slug}`);
      const body = (await answer.json()) as {
        data: {
          orders: SentOrder[];
          requests: number;
          shopperRequests: number;
          shoppers: ShopperFixture[];
        };
      };
      return body.data;
    },
  };
}

/** Lines already in the shopper's cart; only the first time, so a test can watch the cart change after. */
export async function seedCart(page: Page, lines: CartLine[]): Promise<void> {
  await page.addInitScript((held: string) => {
    if (localStorage.getItem('e2e-seeded') !== null) return;
    localStorage.setItem('e2e-seeded', '1');
    localStorage.setItem('lytro-cart', held);
  }, JSON.stringify(lines));
}

/** The area the shopper already set, as a cookie (SFT-20). */
export async function seedArea(page: Page, shop: OpenShop, thanaId: number): Promise<void> {
  await page
    .context()
    .addCookies([{ name: 'lytro-area', value: String(thanaId), url: shop.url('/') }]);
}

export const panjabiLine = (extra: Partial<CartLine> = {}): CartLine => ({
  variantId: idOf('panjabi-M White'),
  productSlug: 'cotton-panjabi',
  name: 'Cotton Panjabi',
  choice: 'M · White',
  price: '1250.00',
  image: null,
  quantity: 1,
  ...extra,
});

export const hijabLine = (extra: Partial<CartLine> = {}): CartLine => ({
  variantId: idOf('hijab-Black'),
  productSlug: 'chiffon-hijab',
  name: 'Chiffon Hijab',
  choice: 'Black',
  price: '350.00',
  image: null,
  quantity: 2,
  ...extra,
});

/** A call on the storefront from inside the page it is on: only the browser resolves `<slug>.localhost`, and its cookies
    go with it. */
export function callFromPage(
  page: Page,
  method: string,
  path: string,
  data?: unknown,
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async (call) => {
      const answer = await fetch(call.path, {
        method: call.method,
        ...(call.data === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(call.data),
            }),
      });
      return { status: answer.status, body: await answer.text() };
    },
    { method, path, data },
  );
}

/** Signs a shopper in as the page would, by the storefront's own route, its cookie landing in the browser. */
export async function signIn(
  page: Page,
  shop: OpenShop,
  phone = '01711223344',
  password = RUMANA_PASSWORD,
): Promise<void> {
  await page.goto(shop.url('/sign-in'));
  const answer = await callFromPage(page, 'POST', '/api/shopper/signin', { phone, password });
  expect(answer.status).toBe(200);
}

/** A sign-in made straight at the mocked server, for a storefront whose own route is shut. */
export async function serverSignIn(
  shop: OpenShop,
  phone = '01711223344',
  password = RUMANA_PASSWORD,
): Promise<string> {
  const answer = await fetch(`${MOCK}/v1/shopper/signin`, {
    method: 'POST',
    headers: { authorization: `Bearer key-${shop.slug}`, 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  expect(answer.status).toBe(200);
  const body = (await answer.json()) as { data: { token: string } };
  return body.data.token;
}

/** What the page itself says went wrong; Next's own route announcer is an alert too, always there and empty. */
export function alertOn(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/** Fills the checkout's or landing form's fields, as a shopper would. */
export async function fillOrderForm(
  page: Page,
  fields: { name?: string; phone?: string; thana?: string; address?: string } = {},
): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(fields.name ?? 'Rumana Akter');
  await page.getByLabel('Mobile number').fill(fields.phone ?? '01711223344');
  await page.getByLabel('District').selectOption({ label: 'Dhaka' });
  await page.getByLabel('Thana').selectOption({ label: fields.thana ?? 'Mirpur' });
  await page.getByLabel('Full address').fill(fields.address ?? 'House 12/B, Road 3, Mirpur 10');
}
