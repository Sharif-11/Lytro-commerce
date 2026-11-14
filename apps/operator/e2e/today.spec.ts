import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §3: what needs a person, then what changed.

const FIGURES = [
  ['Needs review', '3', 'Quoted ৳449, ৳448 arrived'],
  ['Pending', '4', 'No receipt yet'],
  ['Taka waiting', '৳13,032', '7 payments'],
  ['Oldest waiting', '17 h', 'Keya Boutique'],
];

test('opens on what needs a person, from the queue itself', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
  for (const [label, value, detail] of FIGURES) {
    const box = page.getByRole('main').locator('div', { hasText: label }).last();
    await expect(box).toContainText(value as string);
    await expect(box).toContainText(detail as string);
  }
  // What needs a person stands out in marigold.
  const review = page
    .getByRole('main')
    .locator('div')
    .filter({ hasText: /^Needs review/ })
    .last();
  await expect(review.locator('.text-warning')).toHaveText('3');
});

test('what else is waiting opens its own screen', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const main = page.getByRole('main');
  const reports = main.getByRole('link', { name: /Open page reports/ });
  await expect(reports).toContainText('3');
  await expect(reports).toContainText('Newest: Asked for a PIN or code');
  const phones = main.getByRole('link', { name: /Lytro's phones online/ });
  await expect(phones).toContainText('1 of 2');
  await expect(phones).toContainText('Lytro Nagad phone offline 41 min');
  await expect(main.getByRole('link', { name: /Unclaimed receipts/ })).toContainText('1');
  // Today's two wordings, not yesterday's.
  const unread = main.getByRole('link', { name: /Unreadable messages today/ });
  await expect(unread).toContainText('25');
  await expect(unread).toContainText("You're told at 20 in a day");

  await reports.click();
  await expect(page).toHaveURL('/page-reports');
  await page.goBack();
  await phones.click();
  await expect(page).toHaveURL('/phones');
  await page.goBack();
  await main.getByRole('link', { name: /Unclaimed receipts/ }).click();
  await expect(page).toHaveURL('/phones/receipts');
  await page.goBack();
  await unread.click();
  await expect(page).toHaveURL('/phones/unread');
});

test('says what changed, each change opening where it was made', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: /^SMS.*0\.35 → 0\.40/ })).toContainText(
    'ops@lytro.app',
  );
  await main.getByRole('link', { name: /Trial length: 7 → 30 days/ }).click();
  await expect(page).toHaveURL('/settings');
  await page.goBack();
  await main.getByRole('link', { name: 'Dhaka Gadget House suspended' }).click();
  await expect(page).toHaveURL('/shops/ten-0007');
});

test('its two buttons find a shop and open the queue', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Find a shop' }).click();
  await expect(page).toHaveURL('/shops');
  await page.goBack();
  await page.getByRole('button', { name: 'Open the queue' }).click();
  await expect(page).toHaveURL('/queue');
});

test('a quiet day says nothing is waiting, and flags nothing', async ({ page }) => {
  await mockApi(page, {
    queue: 0,
    reports: 0,
    unread: [],
    receipts: [],
    changes: [],
    lytroPhones: [],
    // Slice 9.9: and nothing in the money check.
    differences: [],
  });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByText('Nothing waiting').first()).toBeVisible();
  await expect(main.getByRole('link', { name: /Open page reports/ })).toContainText('0');
  await expect(main.getByText('Nothing changed lately.')).toBeVisible();
  await expect(main.locator('.text-warning')).toHaveCount(0);
});

test('a queue that fails says nothing was changed, and its retry works', async ({ page }) => {
  const log = await mockApi(page, { failing: { '/operator/payment-queue': 503 } });
  await page.goto('/');
  await expect(page.getByText('The server did not answer')).toBeVisible();
  log.state.failing = {};
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('main').getByText('Needs review')).toBeVisible();
});

test('in Bangla, every word is', async ({ page }) => {
  await mockApi(page, { language: 'bn' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'আজ' })).toBeVisible();
  await expect(page.getByRole('main').getByText('রিভিউ লাগবে')).toBeVisible();
  await expect(page.getByRole('main').getByText('আরও যা দেখার')).toBeVisible();
  await expect(page.getByRole('main').getByText('সাম্প্রতিক বদল')).toBeVisible();
});

test('has no accessibility problems', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('main').getByText('1 of 2')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
});
