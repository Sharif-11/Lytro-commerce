import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnKeys } from './support/api-keys';
import { mockApi, SLUG, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.48 (the prototype's `dev-*` screens, amended 2026-11-25 for pay-as-you-go fair use): the
// Developer docs card on API keys opens Developer API -- every public route with a sample request and answer, the shop's
// own keys and limits around them. Each test runs on a phone and on a desktop (playwright.config.ts).

const CHARGES = {
  applies: true,
  cycleStart: '2026-11-10T00:00:00.000Z',
  requests: 170_000,
  free: 10_000,
  rate: '1.0000',
  charged: '160.00',
  cap: '200.00',
  stopped: false,
  days: [],
};

async function open(page: Page, path: string, state: ShopState = {}): Promise<void> {
  await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
}

const main = (page: Page) => page.getByRole('main');
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test('API keys opens Developer API: every route, the base URL and the live keys, on any width', async ({
  page,
}) => {
  await open(page, '/settings/api-keys');
  await main(page)
    .getByRole('link', { name: /Developer docs/ })
    .click();
  await expect(page).toHaveURL(`/${SLUG}/settings/developers`);
  await expect(main(page).getByText('https://api.lytro.app/v1', { exact: true })).toBeVisible();
  await expect(main(page).locator('.dv-route')).toHaveCount(24);
  const live = drawnKeys().filter((key) => key.purpose !== 'storefront' && key.revokedAt === null);
  await expect(main(page).getByText(`You have ${String(live.length)} live keys.`)).toBeVisible();
  if (!wide(page)) {
    await expect(main(page).getByText('4 parts · 24 routes')).toBeVisible();
  }
  // Nothing scrolls sideways: the page and the main column fit; code blocks scroll inside themselves.
  const sideways = await page.evaluate(() => {
    const column = document.querySelector('main');
    return (
      document.documentElement.scrollWidth > window.innerWidth + 1 ||
      (column !== null && column.scrollWidth > column.clientWidth + 1)
    );
  });
  expect(sideways).toBe(false);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations).toEqual([]);
});

test('switches every sample to JavaScript, and a copy says Copied', async ({ page }) => {
  await open(page, '/settings/developers');
  const first = main(page).locator('#dv-start .dv-code').first();
  await expect(first.locator('pre')).toContainText(
    'curl "https://api.lytro.app/v1/catalogue/version"',
  );
  await first.getByRole('tab', { name: 'JavaScript' }).click();
  await expect(first.locator('pre')).toContainText(
    "await fetch('https://api.lytro.app/v1/catalogue/version'",
  );
  await first.getByRole('button', { name: 'Copy' }).click();
  await expect(first.getByRole('button', { name: 'Copied' })).toBeVisible();
});

test('opens a route from the list, with its parameters, request, answer and errors', async ({
  page,
}) => {
  await open(page, '/settings/developers');
  if (!wide(page)) await main(page).getByText('On this page').click();
  await main(page).locator('.dv-nav').getByRole('button', { name: 'POST /orders' }).click();
  const order = main(page).locator('#dv-order');
  await expect(order).toHaveAttribute('open', '');
  await expect(order).toContainText('Idempotency-Key');
  await expect(order).toContainText('Works past the limit');
  await expect(order.locator('.dv-code.res pre')).toContainText('"orderNumber": "261121-0057"');
  await expect(order).toContainText('idempotency_key_required');
});

test('with no key of its own, step 1 warns and offers New key; API keys shows the empty state', async ({
  page,
}) => {
  const storefrontOnly = drawnKeys().filter((key) => key.purpose === 'storefront');
  await open(page, '/settings/developers', { keys: storefrontOnly });
  await expect(
    main(page).getByText('There is no key for your own website yet. Make one first.'),
  ).toBeVisible();
  await expect(
    main(page).locator('#dv-start').getByRole('button', { name: 'New key' }),
  ).toBeVisible();
  await page.goto(`/${SLUG}/settings/api-keys`);
  await expect(main(page).getByText('No key yet for your own website or app.')).toBeVisible();
});

test("a cycle's requests used up says so, the order routes still working", async ({ page }) => {
  await open(page, '/settings/developers', {
    money: { usage: { used: { requests: 200_000 }, limits: { requests: 200_000 } } },
  });
  await expect(main(page).getByText(/This cycle's 200,000 requests are used up/)).toBeVisible();
});

test('pay-as-you-go with fair use on: the month’s API charge and limit, no request packs', async ({
  page,
}) => {
  await open(page, '/settings/developers', {
    state: 'pay_as_you_go',
    fairUse: { charges: CHARGES },
  });
  const limits = main(page).locator('#dv-limits');
  await expect(limits).toContainText('৳160 / ৳200');
  await expect(limits).toContainText(
    '170,000 requests: 10,000 free, then ৳1 per 1,000, charged each night.',
  );
  await expect(limits).toContainText('10,000 free, then ৳1 / 1,000');
  await expect(limits).toContainText('Pay-as-you-go has no request packs.');
  await expect(limits.getByText('Buy a request pack')).toHaveCount(0);
  await expect(limits.getByRole('link', { name: 'API charge and limit' })).toBeVisible();
});

test('pay-as-you-go at its limit: a red banner and Raise the limit', async ({ page }) => {
  await open(page, '/settings/developers', {
    state: 'pay_as_you_go',
    fairUse: { charges: { ...CHARGES, charged: '200.00', stopped: true } },
  });
  await expect(
    main(page).getByText(/This month's API spending limit of ৳200 is reached/),
  ).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Raise the limit' })).toBeVisible();
});

test('a read-only shop reads the docs but makes no key and buys nothing', async ({ page }) => {
  const storefrontOnly = drawnKeys().filter((key) => key.purpose === 'storefront');
  await open(page, '/settings/developers', { state: 'read_only', keys: storefrontOnly });
  await expect(main(page).locator('.dv-route')).toHaveCount(24);
  await expect(main(page).getByRole('button', { name: 'New key' })).toHaveCount(0);
  await expect(main(page).getByText('Buy a request pack')).toHaveCount(0);
});
