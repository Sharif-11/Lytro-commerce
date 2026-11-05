import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnCatalogueAddons } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §6a: what a shop can buy on top of its plan (PLN-13).

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/addons');
  await expect(main(page).getByText('Extra 500 products')).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function row(page: Page, words: string) {
  return main(page).locator('section > div').filter({ hasText: words }).first();
}

test('lists each item with its kind, unit, price and what is running', async ({ page }) => {
  await open(page);
  const seat = row(page, 'One seat');
  await expect(seat).toContainText('Limit');
  await expect(seat).toContainText('Staff seats, owner included');
  await expect(seat).toContainText('৳49/mo');
  await expect(seat).toContainText('118 running');
  // What a shop thinks in, whichever unit the limit is stored in.
  await expect(row(page, '500 MB storage')).toContainText('0.5 GB');
});

test('a pack is one payment, and counts what went this month', async ({ page }) => {
  await open(page);
  const pack = row(page, '10 GB bandwidth');
  await expect(pack).toContainText('Pack');
  await expect(pack).toContainText('10 GB');
  await expect(pack).toContainText('৳30');
  await expect(pack).not.toContainText('/mo');
  await expect(pack).toContainText('212 bought this month');
});

test('a feature raises no limit and has no unit', async ({ page }) => {
  await open(page);
  const feature = row(page, 'Brand identity');
  await expect(feature).toContainText('Feature');
  await expect(feature).toContainText('—');
});

test('a retired item says so, and cannot be retired again', async ({ page }) => {
  await open(page);
  const retired = row(page, '500 MB storage');
  await expect(retired).toContainText('Retired');
  await expect(retired.getByRole('button', { name: 'Retire' })).toHaveCount(0);
  await expect(retired.getByRole('button', { name: 'Edit' })).toBeVisible();
});

test('a new item needs its key, names, price and unit, and goes as the server takes it', async ({
  page,
}) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New item' }).click();
  const panel = page.getByRole('dialog', { name: 'New add-on' });
  const save = panel.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await panel.getByLabel('Name (English)').fill('Extra device');
  await panel.getByLabel('Name (Bangla)').fill('এক্সট্রা ডিভাইস');
  await panel.getByLabel('Key').fill('extra_device');
  await panel.getByLabel('Raises which limit').selectOption('staff');
  await panel.getByLabel('Price per month').fill('39');
  await expect(save).toBeDisabled();
  await panel.getByLabel('Unit size').fill('2');
  await save.click();
  await expect(page.getByText('Extra device created.')).toBeVisible();
  expect(log.sent('POST', '/operator/addons')).toEqual({
    key: 'extra_device',
    kind: 'limit',
    limitKey: 'staff',
    unitSize: 2,
    price: 39,
    labelEn: 'Extra device',
    labelBn: 'এক্সট্রা ডিভাইস',
  });
});

test('a new feature names no limit or unit', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New item' }).click();
  const panel = page.getByRole('dialog', { name: 'New add-on' });
  await panel.getByLabel('Kind').selectOption('feature');
  await expect(panel.getByLabel('Raises which limit')).toBeDisabled();
  await expect(panel.getByLabel('Unit size')).toBeDisabled();
  await panel.getByLabel('Name (English)').fill('Live chat');
  await panel.getByLabel('Name (Bangla)').fill('লাইভ চ্যাট');
  await panel.getByLabel('Key').fill('live_chat');
  await panel.getByLabel('Price per month').fill('99');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Live chat created.')).toBeVisible();
  expect(log.sent('POST', '/operator/addons')).toMatchObject({ limitKey: null, unitSize: null });
});

test('allowances are not on sale yet', async ({ page }) => {
  await open(page);
  await main(page).getByRole('button', { name: 'New item' }).click();
  await expect(
    page.getByRole('dialog', { name: 'New add-on' }).getByRole('option', { name: /Allowance/ }),
  ).toHaveAttribute('disabled');
});

test('a key already taken is said under the field', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/operator/addons', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            statusCode: 400,
            message: 'Some fields need attention.',
            errors: {
              code: 'validation_error',
              details: {
                fields: [{ field: 'key', problem: 'taken', message: 'This key is taken.' }],
              },
            },
          }),
        })
      : route.fallback(),
  );
  await main(page).getByRole('button', { name: 'New item' }).click();
  const panel = page.getByRole('dialog', { name: 'New add-on' });
  await panel.getByLabel('Name (English)').fill('Seat');
  await panel.getByLabel('Name (Bangla)').fill('সিট');
  await panel.getByLabel('Key').fill('seat');
  await panel.getByLabel('Price per month').fill('49');
  await panel.getByLabel('Unit size').fill('1');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByText('This key is taken.')).toBeVisible();
});

test('editing says a price runs from now, and only sends what can change', async ({ page }) => {
  const log = await open(page);
  await row(page, 'One seat').getByRole('button', { name: 'Edit' }).click();
  const panel = page.getByRole('dialog', { name: 'Edit One seat' });
  await expect(panel.getByText('seat · 118 running')).toBeVisible();
  await expect(panel.getByText('A price change applies to new purchases')).toBeVisible();
  await expect(panel.getByLabel('Kind')).toBeDisabled();
  await expect(panel.getByLabel('Raises which limit')).toBeDisabled();
  await expect(panel.getByLabel('Key')).toHaveCount(0);
  await panel.getByLabel('Price per month').fill('59');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('One seat saved.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/addons/addon-seat')).toEqual({
    labelEn: 'One seat',
    labelBn: 'একটা সিট',
    price: 59,
    unitSize: 1,
  });
  await expect(row(page, 'One seat')).toContainText('৳59/mo');
});

test('editing a feature sends no unit', async ({ page }) => {
  const log = await open(page);
  await row(page, 'Brand identity').getByRole('button', { name: 'Edit' }).click();
  const panel = page.getByRole('dialog', { name: 'Edit Brand identity' });
  await panel.getByLabel('Price per month').fill('199');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Brand identity saved.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/addons/addon-brand_identity')).toEqual({
    labelEn: 'Brand identity',
    labelBn: 'ব্র্যান্ড আইডেন্টিটি',
    price: 199,
  });
});

test('a row opens its item', async ({ page }) => {
  await open(page);
  await row(page, 'One seat').click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole('dialog', { name: 'Edit One seat' })).toBeVisible();
});

test('retiring asks first and says what happens to those running', async ({ page }) => {
  const log = await open(page);
  await row(page, 'One seat').getByRole('button', { name: 'Retire' }).click();
  const panel = page.getByRole('dialog', { name: 'Retire One seat?' });
  await expect(
    panel.getByText('The 118 running ones continue to their end and will not renew'),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Retire' }).click();
  await expect(page.getByText('One seat retired. No shop can buy it from now.')).toBeVisible();
  expect(log.calls.some((call) => call.path === '/operator/addons/addon-seat/retire')).toBe(true);
  await expect(row(page, 'One seat')).toContainText('Retired');
});

test('one running reads as one', async ({ page }) => {
  const catalogueAddons = drawnCatalogueAddons().map((addon) =>
    addon.key === 'seat' ? { ...addon, running: 1 } : addon,
  );
  await open(page, { catalogueAddons });
  await expect(row(page, 'One seat')).toContainText('1 running');
  await row(page, 'One seat').getByRole('button', { name: 'Retire' }).click();
  await expect(page.getByText('The 1 running one continues to its end')).toBeVisible();
});

test('says when there are none, and a failed read can be tried again', async ({ page }) => {
  const log = await mockApi(page, { catalogueAddons: [], failing: { '/operator/addons': 503 } });
  await page.goto('/addons');
  await expect(main(page).getByText('The server did not answer')).toBeVisible();
  delete log.state.failing['/operator/addons'];
  await main(page).getByRole('button', { name: 'Try again' }).click();
  await expect(main(page).getByText('No add-ons yet')).toBeVisible();
});

test('reads in Bangla and passes the accessibility check', async ({ page }) => {
  await mockApi(page, { language: 'bn' });
  await page.goto('/addons');
  await expect(main(page).getByText('আরও ৫০০ প্রোডাক্ট')).toBeVisible();
  await expect(row(page, 'একটা সিট')).toContainText('118টা চালু');
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await main(page).getByRole('button', { name: 'নতুন আইটেম' }).click();
  const inPanel = await new AxeBuilder({ page }).analyze();
  expect(inPanel.violations).toEqual([]);
});
