import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnRates, drawnSettings, NOW } from './support/console-data';
import { mockApi } from './support/mock-api';

// PAYG-FAIR-USE-PLAN (the sketch's `pf-report` and `pf-rates`): the PAYG fair use report -- orders in against those
// opened, Watch for 20 or more with under 25% opened, filtered by Watch and Paused -- and, with fair use on, the 1.5% /
// ৳20 order fee struck on the rates, its history kept.

const main = (page: Page) => page.getByRole('main');

test('the PAYG fair use report: a row a shop, Watch marked, and the Watch and Paused chips', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/reports/payg-fair-use');
  await expect(main(page).getByRole('heading', { name: 'PAYG fair use' })).toBeVisible();
  await expect(main(page).getByText('Megh Boutique')).toBeVisible();
  await expect(main(page).getByText('megh-boutique.lytro.app')).toBeVisible();
  await expect(main(page).getByText('14%')).toBeVisible();
  await expect(main(page).getByText('Rongila Fashion')).toBeVisible();
  await expect(main(page).getByText('1,70,000')).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((each) => each.id)).toEqual([]);

  await main(page)
    .getByRole('button', { name: /^Watch/ })
    .click();
  await expect(main(page).getByText('Megh Boutique')).toBeVisible();
  await expect(main(page).getByText('Rongila Fashion')).toHaveCount(0);

  await main(page)
    .getByRole('button', { name: /^Paused/ })
    .click();
  await expect(main(page).getByText('Chotto Pakhi')).toBeVisible();
  await expect(main(page).getByText('Megh Boutique')).toHaveCount(0);
});

test('with fair use on, the order fee is struck on the rates, its history kept', async ({
  page,
}) => {
  const settings = [
    ...drawnSettings(),
    {
      key: 'payg_fair_use',
      value: 'on',
      description: 'Pay-as-you-go fair use',
      updatedBy: null,
      updatedByEmail: null,
      updatedAt: '2026-11-23T00:00:00.000Z',
    },
  ];
  await mockApi(page, { settings });
  await page.goto('/rates');
  await expect(main(page).getByText('SMS, per part')).toBeVisible();
  await expect(main(page).getByText('Retired while fair use is on; history kept')).toHaveCount(2);
  await expect(
    main(page).getByRole('button', { name: 'Change: Pay-as-you-go order fee', exact: true }),
  ).toHaveCount(0);
  await expect(
    main(page).getByRole('button', { name: 'History: Pay-as-you-go order fee', exact: true }),
  ).toBeVisible();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const setting = (key: string, value: unknown, updatedAt: string) => ({
  key,
  value,
  description: key,
  updatedBy: null,
  updatedByEmail: null,
  updatedAt,
});
/** The four fair-use rates and the three PAYG settings, the switch as given and changed this long ago. */
function fairUseState(fairUse: 'on' | 'off', changedDaysAgo: number) {
  // The mock holds the page at NOW.
  const since = new Date(Date.parse(NOW) - changedDaysAgo * DAY_MS).toISOString();
  const rate = (key: string, value: string) => ({ key, value, effectiveFrom: since });
  return {
    rates: [
      ...drawnRates(),
      rate('payg_unlock_phone', '7.00'),
      rate('payg_unlock_confirm', '3.00'),
      rate('payg_booking_fee', '10.00'),
      rate('payg_api_per_thousand', '1.00'),
    ],
    settings: [
      ...drawnSettings(),
      setting('payg_fair_use', fairUse, since),
      setting('payg_activation_topup', 10, since),
      setting('payg_api_free_requests', 10000, since),
    ],
  };
}
const newBadge = (page: Page) => main(page).getByText('New', { exact: true });

test('marks what fair use brings as New, as the sketch does, until 30 days after it is turned on', async ({
  page,
}) => {
  await mockApi(page, fairUseState('off', 60));
  await page.goto('/rates');
  await expect(main(page).getByText('PAYG: show the phone (step 1)')).toBeVisible();
  await expect(newBadge(page)).toHaveCount(4);
  await expect(
    main(page).locator('span', { hasText: 'PAYG: confirm (step 2)' }).last().getByText('New'),
  ).toBeVisible();
  await expect(
    main(page).locator('span', { hasText: 'SMS, per part' }).last().getByText('New'),
  ).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).include('main').analyze();
  expect(violations.map((each) => each.id)).toEqual([]);

  await page.goto('/settings');
  await expect(
    main(page).getByText('Pay-as-you-go free API requests', { exact: true }),
  ).toBeVisible();
  // The switch and the activation top-up; the free requests were the PAYG plan's limit already.
  await expect(newBadge(page)).toHaveCount(2);
  await expect(
    main(page)
      .locator('span', { hasText: 'Pay-as-you-go free API requests' })
      .last()
      .getByText('New'),
  ).toHaveCount(0);
});

test('keeps New for 30 days once fair use is on', async ({ page }) => {
  await mockApi(page, fairUseState('on', 5));
  await page.goto('/rates');
  await expect(main(page).getByText('PAYG: show the phone (step 1)')).toBeVisible();
  await expect(newBadge(page)).toHaveCount(4);
});

test('drops New 30 days after fair use is turned on', async ({ page }) => {
  await mockApi(page, fairUseState('on', 31));
  await page.goto('/rates');
  await expect(main(page).getByText('PAYG: show the phone (step 1)')).toBeVisible();
  await expect(newBadge(page)).toHaveCount(0);
  await page.goto('/settings');
  await expect(main(page).getByText('Pay-as-you-go fair use', { exact: true })).toBeVisible();
  await expect(newBadge(page)).toHaveCount(0);
});
