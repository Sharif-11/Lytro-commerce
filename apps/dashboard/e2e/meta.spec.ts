import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { emptyMeta } from './support/meta';

// TENANT-DASHBOARD-DESIGN §7.27, Slice 11.6: Facebook and Meta -- the pixel, the Conversions API token entered once with
// Replace and Remove, and the catalog feed link with a new link on demand. Each test runs on a phone and on a desktop
// (playwright.config.ts).

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/settings/meta`);
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Meta catalog feed' }),
  ).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
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

test('a connected shop shows its pixel, the token hidden, and the feed with its steps', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await expect(main(page).getByText('Connected', { exact: true })).toBeVisible();
  await expect(main(page).getByLabel('Meta Pixel ID')).toHaveValue('1234567890123456');
  await expect(main(page).getByText('Token set · hidden')).toBeVisible();
  // The token itself never comes back.
  await expect(main(page).getByLabel('Conversions API token')).toHaveCount(0);
  await expect(main(page).getByLabel('Meta catalog feed')).toHaveValue(
    'megh.lytro.app/feeds/meta/a9f27c41d0b8e5f3k1.csv',
  );
  await expect(main(page).getByText('link made 14 Oct 2026')).toBeVisible();
  // FED-06: the feed link copies whole, to paste into Commerce Manager.
  await main(page).getByRole('button', { name: 'Copy' }).click();
  await expect(main(page).getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://megh.lytro.app/feeds/meta/a9f27c41d0b8e5f3k1.csv',
  );
  await expect(main(page).getByRole('listitem')).toHaveCount(4);
  // Requirement ids stay out of what the seller reads.
  await expect(main(page).getByText(/LND-|FED-/)).toHaveCount(0);
  await expectAccessible(page);
});

test('connects a pixel and a token in one Save', async ({ page }) => {
  const log = await open(page, { meta: emptyMeta() });
  await expect(main(page).getByText('Not connected')).toBeVisible();
  await main(page).getByLabel('Meta Pixel ID').fill('1234567890123456');
  await main(page).getByLabel('Conversions API token').fill('EAAGsecret');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(log.sent('PUT', '/ad-tracking')).toEqual({
    metaPixelId: '1234567890123456',
    conversionsApiToken: 'EAAGsecret',
  });
  await expect(main(page).getByText('Token set · hidden')).toBeVisible();
  await expect(main(page).getByText('Connected', { exact: true })).toBeVisible();
});

test('saving the pixel alone keeps the token, and an emptied pixel disconnects it', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByLabel('Meta Pixel ID').fill('');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(log.sent('PUT', '/ad-tracking')).toEqual({ metaPixelId: null });
  await expect(main(page).getByText('Not connected')).toBeVisible();
});

test('a pixel ID the server refuses is said under its field', async ({ page }) => {
  await open(page);
  await main(page).getByLabel('Meta Pixel ID').fill('123');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(main(page).getByText('Use the Pixel ID: 5 to 20 digits.')).toBeVisible();
});

test('Replace takes a new token, and Cancel keeps the old one', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Replace' }).click();
  await main(page).getByLabel('Conversions API token').fill('EAAGnew');
  await main(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(main(page).getByText('Token set · hidden')).toBeVisible();
  expect(log.calls.some((call) => call.method === 'PUT')).toBe(false);

  await main(page).getByRole('button', { name: 'Replace' }).click();
  await main(page).getByLabel('Conversions API token').fill('EAAGnew');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(log.sent('PUT', '/ad-tracking')).toEqual({
    metaPixelId: '1234567890123456',
    conversionsApiToken: 'EAAGnew',
  });
});

test('Remove takes the token away at once, the pixel kept', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('status')).toHaveText('Token removed');
  expect(log.sent('PUT', '/ad-tracking')).toEqual({
    metaPixelId: '1234567890123456',
    conversionsApiToken: null,
  });
  await expect(main(page).getByLabel('Conversions API token')).toBeVisible();
});

test('a new feed link is made after saying the old one stops working', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New link' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('The old link stops working at once');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'New link' }).click();
  await expect(page.getByRole('status')).toHaveText('New link made');
  expect(
    log.calls.some((call) => call.method === 'POST' && call.path === '/catalog-feed/regenerate'),
  ).toBe(true);
  await expect(main(page).getByLabel('Meta catalog feed')).toHaveValue(
    'megh.lytro.app/feeds/meta/b3c81e07f2a9d4c6m8.csv',
  );
});

test('Settings leads here', async ({ page }) => {
  await mockApi(page, { language: 'en' });
  await page.goto(`/${SLUG}/settings`);
  await expect(main(page).getByRole('link', { name: /^Ad tracking and feed/ })).toHaveAttribute(
    'href',
    `/${SLUG}/settings/meta`,
  );
});
