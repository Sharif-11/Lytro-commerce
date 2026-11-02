import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.32, Slice 4.8b (the prototype's Part 30; CUS-01, CUS-02, CUS-09, CUS-14): who ordered last
// first, searched by name or digits; the customer with their figures, last address, account and orders; a new password
// to copy and send; the privacy delete, refused while an order is open; the order after it; and the one search over
// orders, customers and products. The mocked customers are Part 30's six. Each test runs on a phone and on a desktop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  // The clipboard as the browser gives it to the page, whatever the headless browser allows.
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { copied });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          copied.push(text);
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { copied: string[] }).copied);
const row = (page: Page, name: string) => main(page).getByRole('link', { name: new RegExp(name) });

function sent(log: ApiLog, method: string, path: string): unknown[] {
  return log.calls
    .filter((call) => call.method === method && call.path === path)
    .map((call) => call.body);
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

test('the list: who ordered last first, with orders, spend and an account; found by name or digits', async ({
  page,
}) => {
  await open(page, '/orders');
  await page
    .getByRole('navigation', { name: 'This hub’s pages' })
    .filter({ visible: true })
    .getByRole('link', { name: 'Customers' })
    .click();
  await expect(page).toHaveURL(`/${SLUG}/customers`);
  const nusrat = row(page, 'Nusrat Jahan').first();
  await expect(nusrat).toContainText('01711 234 567 · 4 orders · ৳5,890 total');
  await expect(nusrat).toContainText('Last order today');
  await expect(nusrat).toContainText('Has an account');
  await expect(row(page, 'Farhana Islam').first()).toContainText('Last order yesterday');
  await expect(row(page, 'Sumaiya Akter').first()).not.toContainText('Has an account');
  await expectAccessible(page);

  await main(page).getByLabel('Name or last 4 digits of the phone').fill('0171');
  await expect(page).toHaveURL(`/${SLUG}/customers?q=0171`);
  await expect(main(page).getByRole('link', { name: /Sumaiya/ })).toHaveCount(0);
  await expect(row(page, 'Farhana Islam').first()).toBeVisible();
  await main(page).getByLabel('Name or last 4 digits of the phone').fill('nobody');
  await expect(main(page)).toContainText('No customer matches "nobody"');
});

test('none yet: they appear with the first order', async ({ page }) => {
  await open(page, '/customers', { customers: { customers: [], passwords: {} } });
  await expect(main(page)).toContainText('Customers appear here with their first order.');
});

test('the customer: figures, last address, their storefront account and their orders', async ({
  page,
}) => {
  await open(page, '/customers/c-nusrat');
  await expect(main(page).getByRole('heading', { name: 'Nusrat Jahan' })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Call' })).toHaveAttribute(
    'href',
    'tel:01711234567',
  );
  await main(page).getByRole('button', { name: 'Copy the number' }).click();
  await expect(page.getByText('Number copied')).toBeVisible();
  expect(await copied(page)).toEqual(['01711234567']);
  await expect(main(page)).toContainText('On delivered orders');
  await expect(main(page)).toContainText('House 5, Road 10, Mirpur 11 · Mirpur, Dhaka');
  await expect(main(page)).toContainText('signs in with phone and password');
  // Their orders, this one opening the order; earlier ones listed under it.
  await expect(main(page).getByRole('link', { name: /^#261024-0033/ })).toBeVisible();
  await main(page)
    .getByRole('link', { name: /^#261031-0047/ })
    .click();
  await expect(page).toHaveURL(`/${SLUG}/orders/o-47`);
  // And back: the order's count opens the customer.
  await main(page).getByRole('link', { name: '4 orders' }).click();
  await expect(page).toHaveURL(`/${SLUG}/customers/c-nusrat`);
  await expectAccessible(page);
});

test('a guest has no account, and no new password to set', async ({ page }) => {
  await open(page, '/customers/c-sumaiya');
  await expect(main(page)).toContainText('No account; orders as a guest');
  await expect(main(page).getByRole('button', { name: 'Set new password' })).toHaveCount(0);
});

test('a new password is made, can be typed instead, saved and copied; all their sign-ins end', async ({
  page,
}) => {
  const log = await open(page, '/customers/c-nusrat');
  await main(page).getByRole('button', { name: 'Set new password' }).click();
  const sheet = page.getByRole('dialog', { name: 'A new password for Nusrat Jahan' });
  await expect(sheet).toContainText('all their sign-ins end');
  const field = sheet.getByLabel('Password');
  await expect(field).toHaveValue(/^[a-z]+-\d{4}-[a-z]+$/);
  const made = await field.inputValue();
  await sheet.getByRole('button', { name: 'Make another' }).click();
  await expect
    .poll(async () => {
      if ((await field.inputValue()) === made) {
        await sheet.getByRole('button', { name: 'Make another' }).click();
      }
      return field.inputValue();
    })
    .not.toBe(made);
  await field.fill('short');
  await expect(sheet.getByRole('button', { name: 'Save and copy' })).toBeDisabled();
  await field.fill('nusrat-2026-shop');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Save and copy' }).click();
  await expect(
    page.getByText('New password saved and copied; send it to Nusrat Jahan'),
  ).toBeVisible();
  expect(sent(log, 'POST', '/customers/c-nusrat/password')).toEqual([
    { password: 'nusrat-2026-shop' },
  ]);
  expect(await copied(page)).toEqual(['nusrat-2026-shop']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the browser blocking the clipboard: the password is saved, and the sheet stays to copy it by hand', async ({
  page,
}) => {
  await open(page, '/customers/c-nusrat');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('blocked')) },
    });
  });
  await main(page).getByRole('button', { name: 'Set new password' }).click();
  const sheet = page.getByRole('dialog', { name: 'A new password for Nusrat Jahan' });
  await sheet.getByRole('button', { name: 'Save and copy' }).click();
  await expect(sheet).toContainText("Saved, but the browser wouldn't copy it.");
});

test('the privacy delete says what goes and stays; Cancel keeps them; Delete removes them, the order kept', async ({
  page,
}) => {
  await open(page, '/customers/c-nusrat');
  await main(page).getByText('Delete at a privacy request').click();
  await main(page).getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: "Delete Nusrat Jahan's details?" });
  await expect(dialog).toContainText('Their orders stay, with items and totals');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(main(page).getByRole('heading', { name: 'Nusrat Jahan' })).toBeVisible();

  await main(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: "Delete Nusrat Jahan's details?" })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.getByText("The customer's details were deleted")).toBeVisible();
  await expect(page).toHaveURL(`/${SLUG}/customers`);
  await expect(main(page).getByRole('link', { name: /Nusrat/ })).toHaveCount(0);

  await page.goto(`/${SLUG}/orders/o-47`);
  await expect(main(page)).toContainText("Details deleted at the customer's request");
  await expect(main(page)).toContainText('No name, phone or address');
  await expect(main(page)).toContainText('Mirpur, Dhaka');
  await expect(main(page).getByRole('link', { name: 'Call' })).toHaveCount(0);
});

test('the privacy delete is refused while an order is open, naming the orders', async ({
  page,
}) => {
  await open(page, '/customers/c-rakib');
  await main(page).getByText('Delete at a privacy request').click();
  await main(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: "Delete Rakib Hasan's details?" })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  const refused = page.getByRole('dialog', { name: "Can't delete yet" });
  await expect(refused).toContainText(
    'Rakib Hasan has 2 orders still open: #261031-0046, #261029-0027.',
  );
  await refused.getByRole('button', { name: 'OK' }).click();
  await expect(main(page).getByRole('heading', { name: 'Rakib Hasan' })).toBeVisible();
});

test('who may do what: read without changing; no customers without the permission', async ({
  page,
}) => {
  await open(page, '/customers/c-nusrat', { isOwner: false, permissions: ['customers:read'] });
  await expect(main(page).getByRole('heading', { name: 'Nusrat Jahan' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Set new password' })).toHaveCount(0);
  await expect(main(page).getByText('Delete at a privacy request')).toHaveCount(0);
  // Their orders need orders:read.
  await expect(main(page).getByRole('link', { name: /^#261031-0047/ })).toHaveCount(0);

  await mockApi(page, { language: 'en', isOwner: false, permissions: ['orders:read'] });
  await page.goto(`/${SLUG}/orders/o-47`);
  await expect(main(page).getByRole('link', { name: '4 orders' })).toHaveCount(0);
  await expect(main(page)).toContainText('4 orders');
  await page.goto(`/${SLUG}/customers`);
  await expect(main(page).getByRole('searchbox', { name: /last 4 digits/ })).toHaveCount(0);
});

test('one search: orders, customers and products grouped, each with See all', async ({ page }) => {
  const log = await open(page, '/search?q=0171');
  const orders = main(page).getByRole('link', { name: /^#261031-0047/ });
  await expect(orders).toBeVisible();
  await expect(main(page).getByRole('link', { name: /Nusrat Jahan.*01711 234 567/ })).toBeVisible();
  expect(log.calls.some((call) => call.path === '/orders' && call.query.includes('q=0171'))).toBe(
    true,
  );
  await page.goto(`/${SLUG}/search?q=${encodeURIComponent('hasan')}`);
  await expect(
    main(page)
      .getByRole('link', { name: /Rakib Hasan/ })
      .first(),
  ).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'See all (2)' })).toHaveCount(0);
  await expectAccessible(page);
});

test('See all opens the list, searched; a full order number finds that order alone; nothing suggests what to type', async ({
  page,
}) => {
  await open(page, '/search?q=a');
  const all = main(page).getByRole('link', { name: /^See all \(\d+\)$/ });
  await expect(all.first()).toBeVisible();
  await all.first().click();
  await expect(page).toHaveURL(`/${SLUG}/orders?tab=all&q=a`);

  await page.goto(`/${SLUG}/search?q=261031-0047`);
  await expect(main(page).getByRole('link', { name: /^#261031-0047/ })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^#261031-0046/ })).toHaveCount(0);
  await expect(main(page).getByText('Customers', { exact: true })).toHaveCount(0);

  await page.goto(`/${SLUG}/search?q=${encodeURIComponent('saree 9')}`);
  await expect(main(page)).toContainText('Nothing matches "saree 9"');
  await expect(main(page)).toContainText('Try an order number');
});

test('the search finds only what the person may read', async ({ page }) => {
  const log = await open(page, '/search?q=nusrat', {
    isOwner: false,
    permissions: ['orders:read'],
  });
  await expect(main(page).getByRole('link', { name: /^#261031-0047/ })).toBeVisible();
  expect(log.calls.some((call) => call.path === '/customers')).toBe(false);
  expect(log.calls.some((call) => call.path === '/products')).toBe(false);
});
