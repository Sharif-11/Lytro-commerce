import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ShopState } from './support/mock-api';

// PAYG-FAIR-USE-PLAN (the sketch's `pf-home`, `pf-day25` and `pf-api`): with fair use on, a paused pay-as-you-go
// shop's home asks for its one ৳10 top-up, a trial is warned five days before it ends, and the API page shows the
// cycle's requests, the cap and the charges by day. With fair use off, none of it shows. Each test runs on a phone and
// on a desktop (playwright.config.ts).

const CHARGES = {
  applies: true,
  cycleStart: '2026-11-10T00:00:00.000Z',
  requests: 170_000,
  free: 10_000,
  rate: '1.0000',
  charged: '160.00',
  cap: '200.00',
  stopped: false,
  days: [
    { day: '2026-11-22', requests: 18_000, billable: 18_000, charged: '18.00' },
    { day: '2026-11-23', requests: 12_000, billable: 12_000, charged: '12.00' },
  ],
};

async function open(page: Page, path: string, state: ShopState): Promise<void> {
  await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
}

const main = (page: Page) => page.getByRole('main');

test('asks a paused pay-as-you-go shop for its one top-up, the sheet opening on it', async ({
  page,
}) => {
  await open(page, '', { state: 'pay_as_you_go', fairUse: { paused: true } });
  await expect(
    main(page).getByRole('heading', { name: 'Your storefront is off now' }),
  ).toBeVisible();
  await main(page).getByRole('link', { name: 'Top up ৳10' }).click();
  await expect(page).toHaveURL(/\/balance\?.*topup=1/);
  await expect(page).toHaveURL(/amount=10/);
});

test('warns a trial five days before it ends', async ({ page }) => {
  await open(page, '', { state: 'trial', periodEndDays: 4.5, fairUse: {} });
  await expect(main(page).getByText('5 days of your trial left.')).toBeVisible();
});

test('shows none of it with fair use off', async ({ page }) => {
  await open(page, '', { state: 'pay_as_you_go' });
  await expect(main(page).getByRole('heading', { name: 'Your storefront is off now' })).toHaveCount(
    0,
  );
  await open(page, '/settings/api-keys', { state: 'pay_as_you_go' });
  await expect(main(page).getByText('API requests this month')).toHaveCount(0);
});

test("the API page: the cycle's requests, the 80% warning, the cap and the charges by day", async ({
  page,
}) => {
  await open(page, '/settings/api-keys', {
    state: 'pay_as_you_go',
    fairUse: { charges: CHARGES },
  });
  await expect(
    main(page).getByText("This month's API cost is ৳160, 80% of your ৳200 limit."),
  ).toBeVisible();
  await expect(main(page).getByText('API requests this month')).toBeVisible();
  await expect(main(page).getByText('1,70,000')).toBeVisible();
  await expect(main(page).getByText('Free 10,000 · used up')).toBeVisible();
  await expect(main(page).getByText('Then 1,60,000 · ৳160')).toBeVisible();
  await expect(main(page).getByText('Spent ৳160 · ৳40 left')).toBeVisible();
  await expect(main(page).getByText('Charges by day')).toBeVisible();
  // The latest day first.
  const days = main(page).locator('.kv');
  await expect(days.first()).toContainText('23 Nov');
  await expect(days.first()).toContainText('৳12');
  await main(page).getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue('200');
});
