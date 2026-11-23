import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnSettings } from './support/console-data';
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
