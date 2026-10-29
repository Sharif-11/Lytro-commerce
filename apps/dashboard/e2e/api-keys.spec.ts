import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CREATED_KEY } from './support/api-keys';
import { DAY_ONE, mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.26, Slice 11.6: API keys -- the keys with their first characters, websites, last use and
// expiry, a new key shown once, a live key's edit, revoking, and the requests this cycle for whoever may read usage;
// Slice 12a: the key Lytro keeps for the storefront, first. Each test runs on a phone and on a desktop
// (playwright.config.ts).

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/settings/api-keys`);
  await expect(page.getByRole('heading', { name: 'API keys' }).first()).toBeAttached();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function sheet(page: Page) {
  return page.getByRole('dialog');
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

test('lists the keys, a revoked one kept, and the requests this cycle', async ({ page }) => {
  await open(page);
  await expect(main(page).getByRole('button', { name: /^Website/ })).toContainText(
    'lytro_pk_7f2k… · https://meghfashion.com · last used 21 Oct',
  );
  await expect(main(page).getByRole('button', { name: /^Mobile app/ })).toContainText(
    'last used 2 h · Expires 31 Dec 2026',
  );
  // API-03: a revoked key stays, marked, with nothing to do.
  await expect(main(page).getByText('Old site')).toBeVisible();
  await expect(main(page).getByText('Revoked', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Revoke' })).toHaveCount(2);
  await expect(main(page).getByText('48,210 / 200,000 requests this cycle')).toBeVisible();
  await expectAccessible(page);
});

test('the key Lytro keeps for the storefront comes first, marked, with nothing to change or revoke', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByText('Lytro storefront')).toBeVisible();
  await expect(main(page).getByText("Lytro's", { exact: true })).toBeVisible();
  await expect(
    main(page).getByText('lytro_pk_3hdw… · https://megh.lytro.app', { exact: false }),
  ).toBeVisible();
  // No button names it: it opens nothing and has no Revoke; the two Revokes are the shop's own live keys.
  await expect(main(page).getByRole('button', { name: /Lytro storefront/ })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Revoke' })).toHaveCount(2);
  await expect(
    main(page).getByText('The first key is the one Lytro keeps for your storefront.', {
      exact: false,
    }),
  ).toBeVisible();
  await expectAccessible(page);
});

test('the requests show only to whoever may read the shop’s usage', async ({ page }) => {
  const log = await open(page, { isOwner: false, permissions: ['keys:manage'] });
  await expect(main(page).getByText('To rotate:', { exact: false })).toBeVisible();
  await expect(main(page).getByText('requests this cycle', { exact: false })).toHaveCount(0);
  expect(log.calls.some((call) => call.path === '/usage')).toBe(false);
});

test('makes a key from its name, websites and expiry, and shows its value once', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New key' }).click();
  await sheet(page).getByLabel('Name').fill('Shop app');
  await sheet(page)
    .getByLabel('Websites (origins)')
    .fill('https://shop.example\n\nhttp://insecure.example');
  await sheet(page).getByRole('button', { name: 'Create key' }).click();
  // API-08: the server's check, under the field it is about.
  await expect(
    sheet(page).getByText('Use the address only, starting with https://, with no path after it.'),
  ).toBeVisible();

  await sheet(page)
    .getByLabel('Websites (origins)')
    .fill('https://shop.example\n\nhttps://www.shop.example');
  await sheet(page).getByLabel('Expires (optional)').fill('2026-12-31');
  await sheet(page).getByRole('button', { name: 'Create key' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Key made: copy it now' })).toBeVisible();
  await expect(sheet(page).getByText(CREATED_KEY)).toBeVisible();
  await expect(sheet(page).getByRole('link', { name: 'Download' })).toHaveAttribute(
    'download',
    /lytro-api-key-.*\.txt/,
  );
  expect(log.sent('POST', '/api-keys')).toEqual({
    name: 'Shop app',
    websites: ['https://shop.example', 'https://www.shop.example'],
    expiresAt: '2026-12-31T23:59:59+06:00',
  });
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(main(page).getByRole('button', { name: /^Shop app/ })).toBeVisible();
});

test('a key with no expiry is sent without one', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New key' }).click();
  await sheet(page).getByLabel('Name').fill('Shop app');
  await sheet(page).getByLabel('Websites (origins)').fill('https://shop.example');
  await sheet(page).getByRole('button', { name: 'Create key' }).click();
  await expect(sheet(page).getByText(CREATED_KEY)).toBeVisible();
  expect(log.sent('POST', '/api-keys')).toEqual({
    name: 'Shop app',
    websites: ['https://shop.example'],
  });
});

test('edits a live key’s name and websites; its value is never shown again', async ({ page }) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /^Website/ })
    .click();
  await expect(sheet(page).getByLabel('Websites (origins)')).toHaveValue('https://meghfashion.com');
  await expect(sheet(page).getByLabel('Expires (optional)')).toHaveValue('—');
  await expect(
    sheet(page).getByText('The key value is never shown again', { exact: false }),
  ).toBeVisible();
  await sheet(page).getByLabel('Name').fill('Main website');
  await sheet(page)
    .getByLabel('Websites (origins)')
    .fill('https://meghfashion.com\nhttps://www.meghfashion.com');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(log.sent('PATCH', '/api-keys/k-website')).toEqual({
    name: 'Main website',
    websites: ['https://meghfashion.com', 'https://www.meghfashion.com'],
  });
});

test('revokes a key after saying what that does, and keeps it in the list', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Revoke' }).first().click();
  await expect(sheet(page)).toContainText('It stops working at once');
  await sheet(page).getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByRole('status')).toHaveText('Key revoked');
  expect(
    log.calls.some((call) => call.method === 'POST' && call.path === '/api-keys/k-website/revoke'),
  ).toBe(true);
  await expect(main(page).getByRole('button', { name: 'Revoke' })).toHaveCount(1);
  await expect(main(page).getByText('Revoked', { exact: true })).toHaveCount(2);
});

test('a shop with no key yet says what one is for', async ({ page }) => {
  await open(page, { keys: [] });
  await expect(main(page).getByText('No API keys yet.', { exact: false })).toBeVisible();
  await expectAccessible(page);
});

test('Settings and Home lead to the keys', async ({ page }) => {
  await mockApi(page, { language: 'en', ...DAY_ONE });
  await page.goto(`/${SLUG}`);
  await main(page).getByRole('link', { name: 'Create an API key' }).click();
  await expect(page).toHaveURL(`/${SLUG}/settings/api-keys`);
  await page.goto(`/${SLUG}/settings`);
  await expect(main(page).getByRole('link', { name: /^API keys/ })).toHaveAttribute(
    'href',
    `/${SLUG}/settings/api-keys`,
  );
});
