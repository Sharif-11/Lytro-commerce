import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GADGET } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §4a: shoppers' reports of payment pages, and what was done about them.

async function open(page: Page, path = '/page-reports', state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto(path);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

test('lists the open reports with their reason and note, and counts each kind', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByRole('heading', { name: 'Page reports' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Open/ })).toContainText('3');
  await expect(main(page).getByRole('button', { name: /^Dismissed/ })).toContainText('1');
  await expect(main(page).getByRole('button', { name: /^Acted on/ })).toContainText('1');
  await expect(main(page).getByText('Asked for a PIN or code')).toBeVisible();
  await expect(main(page).getByText('The order said ৳1,250')).toBeVisible();
  await expect(main(page).getByText('Rahim Fashion')).toHaveCount(0);
});

test('what was handled sits apart, both kinds together, at an address of its own', async ({
  page,
}) => {
  await open(page);
  await main(page)
    .getByRole('button', { name: /^Dismissed/ })
    .click();
  await expect(page).toHaveURL('/page-reports?view=handled');
  await expect(main(page).getByText('Rahim Fashion')).toBeVisible();
  await expect(main(page).getByText('Keya Boutique')).toBeVisible();
  await expect(main(page).getByText('Arif Electronics')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Suspend the page' })).toHaveCount(0);
  await main(page).getByRole('button', { name: /^Open/ }).click();
  await expect(page).toHaveURL('/page-reports');
});

test('opens the page apart from the console', async ({ page }) => {
  await open(page);
  const link = main(page).getByRole('link', { name: 'Open the page' }).first();
  await expect(link).toHaveAttribute('href', 'https://pay.lytro.app/p/rep-31');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('a report opens with what the shopper said, and where from', async ({ page }) => {
  await open(page);
  await main(page).getByRole('button', { name: 'Dhaka Gadget House' }).click();
  const panel = page.getByRole('dialog', { name: 'The wrong amount' });
  await expect(panel.getByText('The order said ৳1,250')).toBeVisible();
  await expect(panel.getByText('203.0.113.87')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'dhaka-gadget.lytro.app' })).toHaveAttribute(
    'href',
    `/shops/${GADGET}`,
  );
  await expect(panel.getByRole('link', { name: 'Open the page' })).toBeVisible();
});

test('a report with no note says so', async ({ page }) => {
  await open(page);
  await main(page).getByText('Asked for a PIN or code').click();
  await expect(page.getByRole('dialog').getByText('No note')).toBeVisible();
});

test("suspending needs a reason, moves the shop's reports to acted on", async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Suspend the page' }).first().click();
  const panel = page.getByRole('dialog', { name: "Suspend Arif Electronics's payment page?" });
  await expect(panel.getByRole('button', { name: 'Suspend the page' })).toBeDisabled();
  await panel.getByRole('textbox', { name: 'Reason' }).fill('Asked for a PIN');
  await panel.getByRole('button', { name: 'Suspend the page' }).click();
  await expect(
    page.getByRole('status').getByText("Arif Electronics's payment page is suspended."),
  ).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Open/ })).toContainText('2');
  await expect(main(page).getByRole('button', { name: /^Acted on/ })).toContainText('2');
  expect(log.sent('POST', '/operator/tenants/ten-0040/payment-page/suspend')).toEqual({
    reason: 'Asked for a PIN',
  });
});

test('a page already suspended has nothing to suspend', async ({ page }) => {
  const log = await mockApi(page);
  log.state.reportList = log.state.reportList.map((each) => ({
    ...each,
    shop: { ...each.shop, paymentPageSuspended: true },
  }));
  await page.goto('/page-reports');
  await expect(main(page).getByText('Page suspended').first()).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Suspend the page' })).toHaveCount(0);
  await main(page).getByText('Asked for a PIN or code').click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Suspend the page' }),
  ).toHaveCount(0);
});

test('dismissing asks first, does nothing to the shop, and moves the report', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Dismiss', exact: true }).first().click();
  const panel = page.getByRole('dialog', { name: 'Dismiss this report?' });
  await expect(panel.getByText('Nothing is done to the shop.', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByRole('status').getByText('Report dismissed.')).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Open/ })).toContainText('2');
  await expect(main(page).getByRole('button', { name: /^Dismissed/ })).toContainText('2');
  expect(
    log.calls.some((call) => call.path === '/operator/payment-page-reports/rep-31/dismiss'),
  ).toBe(true);
  expect(log.calls.some((call) => call.path.includes('payment-page/suspend'))).toBe(false);
});

test('from a report, Cancel steps back to it', async ({ page }) => {
  await open(page);
  await main(page).getByText('Asked for a PIN or code').click();
  const report = page.getByRole('dialog', { name: 'Asked for a PIN or code' });
  await report.getByRole('button', { name: 'Dismiss' }).click();
  await page
    .getByRole('dialog', { name: 'Dismiss this report?' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Asked for a PIN or code' })).toBeVisible();
});

test('the frame counts what is open', async ({ page }) => {
  await open(page);
  const nav = page.getByRole('navigation', { name: 'Console' });
  test.skip(test.info().project.name !== 'desktop', 'The sidebar is from 1024 px');
  await expect(nav.getByRole('link', { name: /^Page reports/ })).toContainText('3');
  await main(page).getByRole('button', { name: 'Dismiss', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(nav.getByRole('link', { name: /^Page reports/ })).toContainText('2');
});

test('nothing open says what fills it', async ({ page }) => {
  await open(page, '/page-reports', { reports: 0 });
  await expect(main(page).getByText('No open reports')).toBeVisible();
});

test('a read that fails offers a retry', async ({ page }) => {
  const log = await open(page, '/page-reports', {
    failing: { '/operator/payment-page-reports': 503 },
  });
  await expect(page.getByText('The server did not answer')).toBeVisible();
  log.state.failing = {};
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(main(page).getByText('Asked for a PIN or code')).toBeVisible();
});

test('in Bangla, it is too', async ({ page }) => {
  await open(page, '/page-reports', { language: 'bn' });
  await expect(main(page).getByRole('heading', { name: 'পেজ রিপোর্ট' })).toBeVisible();
  await expect(main(page).getByText('PIN বা কোড চেয়েছে')).toBeVisible();
});

test('has no accessibility problems', async ({ page }) => {
  await open(page);
  await expect(main(page).getByText('Asked for a PIN or code')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
});
