import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnProducts } from './support/products';
import { EID_ID, OFFER_PRODUCTS, PUJA_ID } from './support/offers';

// OFFERS-PLAN (the sketch's `of-*`): Shop › Offers -- the list by state, a new offer with its products picked whole or
// by design and each new price shown before Start, a cut too big refused before it is sent, a running offer changed
// live and ended after asking, an ended one run again or deleted; the product editor's offer card and locked price,
// and the products list's tag. Each test runs on a phone and a desktop (playwright.config.ts).

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

const productId = (name: string) => OFFER_PRODUCTS.find((each) => each.name === name)?.id ?? '';

test('lists the offers by state, each with its cut and products', async ({ page }) => {
  await open(page, '/offers');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Running' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Not started' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Ended' })).toBeVisible();
  const eid = main.getByRole('link', { name: /Eid offer/ });
  await expect(eid).toContainText('20% off · 4 products');
  await expect(main.getByRole('link', { name: /Flash sale/ })).toContainText('৳200 off');
  await expect(main.getByRole('link', { name: /New offer/ })).toBeVisible();
});

test('makes an offer: a product whole and one design of another, each new price shown, then Start', async ({
  page,
}) => {
  const log = await open(page, '/offers/new');
  const main = page.getByRole('main');
  await main.getByLabel("Offer's name").fill('Winter offer');
  await main.getByRole('button', { name: 'Pick products' }).click();
  const sheet = page.getByRole('dialog', { name: 'Pick products' });
  await sheet.getByRole('checkbox', { name: 'Denim jacket' }).check();
  // The burka opens to its designs: Stripe is in the Eid offer already; Design 4 is ticked.
  await sheet.getByRole('button', { name: '5 designs' }).click();
  await expect(sheet.getByRole('checkbox', { name: 'Irani burka · Stripe' })).toBeDisabled();
  await sheet.getByRole('checkbox', { name: 'Irani burka · Design 4' }).check();
  // OF-16: the Linen panjabi is in the Flash sale, not started, so it cannot be picked.
  await expect(sheet.getByRole('checkbox', { name: 'Linen panjabi' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Add 2 products' }).click();
  await expect(main.getByText('৳1,512')).toBeVisible();
  await expect(main.getByText('৳1,960')).toBeVisible();
  await expect(main.getByText('1 of 5 designs: Design 4')).toBeVisible();
  await main.getByRole('button', { name: 'Start offer' }).first().click();
  await expect(page).toHaveURL(/\/offers\/0ff/);
  expect(log.sent('POST', '/offers')).toEqual({
    name: 'Winter offer',
    cut: { kind: 'percent', amount: 20 },
    items: [
      { productId: productId('Denim jacket'), designId: null },
      {
        productId: productId('Irani burka'),
        designId: OFFER_PRODUCTS[0]?.designs?.[3]?.id,
      },
    ],
    start: true,
  });
});

test('says which products cost less than the taka off, and keeps Start off', async ({ page }) => {
  const log = await open(page, '/offers/new');
  const main = page.getByRole('main');
  await main.getByLabel("Offer's name").fill('Flash');
  await main.getByRole('button', { name: '৳ off' }).click();
  await main.getByLabel('Taka off each product').fill('500');
  await main.getByRole('button', { name: 'Pick products' }).click();
  const sheet = page.getByRole('dialog', { name: 'Pick products' });
  await sheet.getByRole('checkbox', { name: 'Hair band' }).check();
  await sheet.getByRole('button', { name: 'Add 1 product' }).click();
  await expect(main.getByRole('alert').filter({ hasText: 'Hair band cost less' })).toBeVisible();
  await expect(main.getByText('More off than its price')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Start offer' }).first()).toBeDisabled();
  expect(log.sent('POST', '/offers')).toBeUndefined();
});

test('a running offer: its link, a new cut, a product taken out, and End after asking', async ({
  page,
}) => {
  const log = await open(page, `/offers/${EID_ID}`);
  const main = page.getByRole('main');
  await expect(main.getByText('megh.lytro.app/offers/eid-offer')).toBeVisible();
  await main.getByRole('button', { name: 'Change' }).click();
  const change = page.getByRole('dialog', { name: 'Change the discount' });
  await change.getByLabel('Percent off').fill('25');
  await change.getByRole('button', { name: 'Save' }).click();
  await expect(change).toBeHidden();
  expect(log.sent('PATCH', `/offers/${EID_ID}`)).toEqual({ cut: { kind: 'percent', amount: 25 } });
  // OF-15: taking a product out changes its price at once.
  await main.getByRole('button', { name: 'Remove' }).last().click();
  await expect
    .poll(
      () => (log.sent('PATCH', `/offers/${EID_ID}`) as { items?: unknown[] } | undefined)?.items,
    )
    .toHaveLength(4);
  await main.getByRole('button', { name: 'End offer' }).first().click();
  const ask = page.getByRole('dialog', { name: 'End Eid offer?' });
  await expect(ask).toContainText('Orders already placed keep the offer price.');
  await ask.getByRole('button', { name: 'End offer' }).click();
  // Ended: its actions are Delete and Run it again now.
  await expect(main.getByRole('button', { name: 'Run it again' }).first()).toBeVisible();
  expect(
    log.calls.some((call) => call.method === 'POST' && call.path === `/offers/${EID_ID}/end`),
  ).toBe(true);
});

test('an ended offer runs again as a copy not started, or is deleted after asking', async ({
  page,
}) => {
  const log = await open(page, `/offers/${PUJA_ID}`);
  const main = page.getByRole('main');
  await expect(main.getByText('Shoppers see “This offer has ended”')).toBeVisible();
  await main.getByRole('button', { name: 'Run it again' }).first().click();
  // The copy, not started, opens as its form.
  await expect(main.getByLabel("Offer's name")).toHaveValue('Puja offer');
  expect(log.calls.some((call) => call.path === `/offers/${PUJA_ID}/copy`)).toBe(true);
  await page.goto(`/${SLUG}/offers/${PUJA_ID}`);
  await main.getByRole('button', { name: 'Delete' }).first().click();
  const ask = page.getByRole('dialog', { name: 'Delete Puja offer?' });
  await ask.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/offers$`));
});

test('the product editor names the offer holding it and locks its price; the list tags it', async ({
  page,
}) => {
  const products = drawnProducts();
  const first = products.products[0];
  if (!first) throw new Error('the drawn products');
  first.offers = [
    {
      offerId: EID_ID,
      name: 'Eid offer',
      state: 'running',
      designIds: null,
      lockedVariantIds: [],
    },
  ];
  await open(page, '/products', { products });
  await expect(page.getByRole('main').getByText('Eid offer')).toBeVisible();
  await page.goto(`/${SLUG}/products/${first.id}`);
  const main = page.getByRole('main');
  await expect(main.getByText('This product is in the offer.')).toBeVisible();
  await expect(main.getByRole('link', { name: 'Open offer' })).toHaveAttribute(
    'href',
    `/${SLUG}/offers/${EID_ID}`,
  );
  await expect(main.getByLabel('Price', { exact: true })).not.toBeEditable();
  await expect(main.getByText('Locked while the offer runs.')).toBeVisible();
});
