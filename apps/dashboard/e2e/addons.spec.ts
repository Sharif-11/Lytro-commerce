import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import type { AddonsFixture, UsageFixture } from './support/usage';

// TENANT-DASHBOARD-DESIGN §7.25, Slice 11.5c: Add-ons -- every item with its price and one action, how what the shop
// has renews, the Buy and pack sheets with the amount shown, the renewal switch, and the cards on Plan and the
// pay-as-you-go page. Each test runs on a phone and on a desktop (playwright.config.ts).

const HAS_THREE: AddonsFixture = {
  owned: [{ key: 'extra_products' }, { key: 'extra_seat' }, { key: 'brand_identity' }],
  packsLeft: { bandwidth: 6.2, requests: 61_400 },
};

async function open(
  page: Page,
  addons: AddonsFixture & UsageFixture = {},
  state: ShopState = {},
  path = '/addons',
): Promise<ApiLog> {
  const log = await mockApi(page, {
    language: 'en',
    ...state,
    money: { ...state.money, usage: addons },
  });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function sheet(page: Page) {
  return page.getByRole('dialog');
}

function row(page: Page, name: string) {
  return main(page)
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .last();
}

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('lists every add-on with its price and one action, and how what the shop has renews and for how much', async ({
  page,
}) => {
  await open(page, HAS_THREE);
  await expect(
    main(page).getByText(/^3 add-ons active · renew with the plan on \d+ \w{3} for ৳347$/),
  ).toBeVisible();
  // A page below Usage: back to it in the app bar, and no section chips.
  await expect(main(page).getByRole('navigation', { name: 'This hub’s pages' })).toHaveCount(0);
  for (const group of ['Raise a limit', 'Packs', 'Features']) {
    await expect(main(page).getByText(group, { exact: true })).toBeVisible();
  }
  const products = row(page, 'Extra 500 products');
  await expect(products).toContainText('Active');
  await expect(products).toContainText('renews with the plan');
  await expect(products).toContainText('৳149/month');
  await expect(
    main(page).getByRole('switch', { name: 'Renew · Extra 500 products' }),
  ).toBeChecked();
  await expect(row(page, '1 GB storage').getByRole('button', { name: 'Buy' })).toBeVisible();
  await expect(row(page, '10 GB bandwidth')).toContainText('6.2 GB left');
  await expect(row(page, '100,000 requests')).toContainText('61,400 left');
  await expect(
    main(page).getByRole('switch', { name: 'Buy a 10 GB pack when bandwidth reaches 100%' }),
  ).toBeVisible();
  await expectAccessible(page);
});

test('buys from the balance: the amount for that many, the limit before and after, then the toast', async ({
  page,
}) => {
  const log = await open(page);
  await row(page, 'Extra 500 products').getByRole('button', { name: 'Buy' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Buy Extra 500 products' })).toBeVisible();
  await expect(sheet(page).getByText('100 → 600 products')).toBeVisible();
  await expect(sheet(page).getByText('৳99', { exact: true })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'How many +' }).click();
  // BIL-09: the server's own amount for two, rounded once on the total -- not twice ৳99.
  await expect(sheet(page).getByText('100 → 1,100 products')).toBeVisible();
  await expect(
    sheet(page).getByText(/^For the 20 days left to \d+ \w{3}; then ৳298 with the plan\.$/),
  ).toBeVisible();
  expect(log.calls.some((call) => call.path === '/addons/quote')).toBe(false);
  await sheet(page).getByRole('button', { name: 'Buy · ৳199' }).click();
  await expect(
    page.getByRole('status').filter({
      hasText:
        'Extra 500 products active · the products limit is now 1,100 · Invoice INV-000215 · ৳199',
    }),
  ).toBeVisible();
  expect(log.sent('POST', '/addons/quote')).toEqual({
    addonId: 'a-products',
    quantity: 2,
    amount: 199,
    renews: true,
  });
  expect(log.sent('POST', '/addons/purchase')).toEqual({
    paymentId: 'payment-1',
    method: 'balance',
  });
});

test('pays by wallet when the balance is short, and then says the payment is being checked', async ({
  page,
}) => {
  const log = await open(page, {}, { money: { balance: '48.00' } });
  await row(page, 'Extra 500 products').getByRole('button', { name: 'Buy' }).click();
  await expect(sheet(page).getByRole('radio', { name: /From the balance/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(sheet(page).getByRole('radio', { name: /^By bKash or Nagad/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(sheet(page).getByRole('alert')).toContainText(
    'this needs ৳99. Top up, or pay by bKash or Nagad.',
  );
  await sheet(page).getByRole('switch', { name: 'Renew with the plan' }).click();
  await sheet(page).getByRole('button', { name: 'Continue · ৳99' }).click();
  expect(log.sent('POST', '/addons/quote')).toMatchObject({ amount: 99, renews: false });
  await sheet(page).getByLabel(/TrxID/).fill('5KD9QW11');
  await sheet(page).getByLabel('Number you sent from').fill('1711000231');
  await sheet(page).getByRole('button', { name: 'Submit the payment' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'The add-on turns on once it is checked' }),
  ).toBeVisible();
  expect(log.sent('POST', '/addons/purchase')).toMatchObject({
    method: 'wallet',
    transactionId: '5KD9QW11',
  });
  await expect(
    main(page)
      .getByRole('status')
      .filter({ hasText: 'Your ৳99 payment for "Extra 500 products" is being checked.' }),
  ).toBeVisible();
  await expect(row(page, 'Extra 500 products')).toContainText('Being checked');
});

test('turns renewal off after saying what happens, and on again from the ending banner', async ({
  page,
}) => {
  const log = await open(page, { owned: [{ key: 'extra_seat' }] });
  await main(page).getByRole('switch', { name: 'Renew · One seat' }).click();
  // Two seats on the plan and the add-on's one: three now, two again without it.
  await expect(sheet(page)).toContainText(
    'seats return to 2. Staff over it will need to be deactivated.',
  );
  await sheet(page).getByRole('button', { name: 'Turn off' }).click();
  await expect(row(page, 'One seat')).toContainText('renewal off · ends');
  expect(log.sent('PATCH', '/addons/mine/p-extra_seat')).toEqual({ renews: false });

  await page.unrouteAll();
  const ending = await open(page, {
    owned: [{ key: 'extra_seat', renewal: 'off', endsSoon: true, endsInDays: 7 }],
  });
  const banner = main(page).getByRole('alert');
  await expect(banner).toHaveText(
    '"One seat" ends in 7 days and renewal is off. Keep it, or you will need to deactivate someone.Turn renewal on',
  );
  // The banner takes the first line's place.
  await expect(main(page).getByText(/^Raise one limit without changing plans/)).toHaveCount(0);
  await banner.getByRole('button', { name: 'Turn renewal on' }).click();
  await expect
    .poll(() => ending.sent('PATCH', '/addons/mine/p-extra_seat'))
    .toEqual({ renews: true });
});

test("buys a pack from the balance only, opened from Usage's link, and says when its price changed", async ({
  page,
}) => {
  const log = await open(page, { amountChangedTo: '25.00' }, {}, '/addons?pack=requests');
  await expect(sheet(page).getByRole('heading', { name: 'Buy a pack' })).toBeVisible();
  await expect(page).toHaveURL(`/${SLUG}/addons`);
  await expect(sheet(page).getByRole('radio', { name: /100,000 requests/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await sheet(page).getByRole('button', { name: 'Buy · ৳20' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText(
    'The amount is now ৳25. Check it and pay again.',
  );
  await sheet(page).getByRole('button', { name: 'Buy · ৳25' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '100,000 requests added · Invoice INV-000216 · ৳25' }),
  ).toBeVisible();
  expect(log.sent('POST', '/addons/packs')).toEqual({
    addonId: 'a-requests',
    quantity: 1,
    amount: 25,
  });
});

test('opens an add-on from its link, and a short balance greys the pack with Top up', async ({
  page,
}) => {
  await open(page, {}, {}, '/addons?buy=extra_seat');
  await expect(sheet(page).getByRole('heading', { name: 'Buy One seat' })).toBeVisible();
  await expect(sheet(page).getByText('2 → 3 seats')).toBeVisible();

  await page.unrouteAll();
  await open(page, {}, { money: { balance: '12.00' } }, '/addons?pack=bandwidth');
  await expect(sheet(page).getByRole('alert')).toContainText(
    'this pack needs ৳30. Packs are paid from the balance only.',
  );
  await expect(sheet(page).getByRole('button', { name: 'Buy · ৳30' })).toBeDisabled();
});

test('a trial buys none, grace renews first, and pay-as-you-go renews from the balance', async ({
  page,
}) => {
  await open(page, {}, { state: 'trial', periodEndDays: 27 });
  await expect(
    main(page).getByText('Add-ons cannot be bought on the trial. Pick a plan first.'),
  ).toBeVisible();
  await expect(row(page, 'One seat')).toContainText('Needs a plan');

  await page.unrouteAll();
  await open(page, { owned: [{ key: 'extra_products' }] }, { state: 'grace', periodEndDays: -1 });
  await expect(
    main(page).getByRole('alert').filter({ hasText: 'Renew it to buy add-ons' }),
  ).toContainText('The plan ended on');
  await expect(main(page).getByRole('link', { name: 'Renew for ৳449' })).toHaveAttribute(
    'href',
    `/${SLUG}/plan`,
  );
  await expect(row(page, 'One seat')).toContainText('Renew first');
  // What the shop has works until the grace ends, which the banner says; its row names no end of its own.
  await expect(row(page, 'Extra 500 products')).toContainText('renews with the plan');
  await expect(row(page, 'Extra 500 products')).not.toContainText('until');

  await page.unrouteAll();
  await open(
    page,
    { owned: [{ key: 'extra_products', renewal: 'from_balance' }] },
    { state: 'pay_as_you_go' },
  );
  await expect(
    main(page).getByText('1 add-on active · it renews from the balance at its own end'),
  ).toBeVisible();
  await expect(row(page, 'Extra 500 products')).toContainText('renews from the balance');
  await row(page, 'One seat').getByRole('button', { name: 'Buy' }).click();
  await expect(
    sheet(page).getByText(/^For 30 days, to \d+ \w{3}; then ৳49 from the balance every 30 days\.$/),
  ).toBeVisible();
});

test('says which add-ons end without renewing, and why, with no switch', async ({ page }) => {
  await open(page, {
    owned: [
      { key: 'extra_seat', renewal: 'retired' },
      { key: 'extra_storage', renewal: 'unlimited' },
    ],
  });
  await expect(row(page, 'One seat')).toContainText('no longer sold, won’t renew');
  await expect(row(page, '1 GB storage')).toContainText('not needed on Starter, won’t renew');
  await expect(main(page).getByRole('switch', { name: /^Renew · / })).toHaveCount(0);
});

test('Plan and the pay-as-you-go page show what the shop has, with the way to all of it', async ({
  page,
}) => {
  await open(page, HAS_THREE, {}, '/plan');
  await expect(main(page).getByRole('link', { name: 'See all' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons`,
  );
  await expect(main(page).getByText(/^3 add-ons active · renew with the plan on/)).toBeVisible();
  await expect(main(page).getByText('6.2 GB left')).toBeVisible();

  await page.unrouteAll();
  await open(
    page,
    { owned: [{ key: 'extra_products', renewal: 'from_balance' }] },
    { state: 'pay_as_you_go' },
    '/plan',
  );
  await expect(
    main(page).getByText('Add-ons run in 30-day periods and renew from the balance.'),
  ).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Add-ons', exact: true })).toHaveAttribute(
    'href',
    `/${SLUG}/addons`,
  );
});

test('shows staff who may only read the add-ons without Buy or a switch', async ({ page }) => {
  await open(page, HAS_THREE, { isOwner: false, permissions: ['payments:read'] });
  await expect(row(page, 'Extra 500 products')).toContainText('renews with the plan');
  await expect(main(page).getByRole('button', { name: 'Buy' })).toHaveCount(0);
  await expect(main(page).getByRole('switch', { name: /^Renew · / })).toHaveCount(0);
});
