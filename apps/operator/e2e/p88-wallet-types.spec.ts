import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, type ConsoleState } from './support/mock-api';
import { upayRemoved, upayRetiring } from './support/p88-money-mock';

// OPERATOR-CONSOLE-DESIGN v7 §10d (WAL-18, D8-65 to D8-67, D8-78), Phase 8 Slice 8.8: the payment methods shops take from their
// customers, retired, brought back and removed the couriers' way.

function main(page: Page) {
  return page.getByRole('main');
}

function row(page: Page, words: string) {
  return main(page).locator('section > div').filter({ hasText: words }).first();
}

async function types(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/wallet-types');
  await expect(row(page, 'bKash')).toBeVisible();
  return log;
}

test('lists each type with what leans on it, and points to Lytro own methods', async ({ page }) => {
  await types(page);
  await expect(main(page).getByRole('heading', { name: 'Wallet types' })).toBeVisible();
  await expect(row(page, 'bKash')).toContainText('301 shops have an account for it');
  await expect(row(page, 'bKash')).toContainText('284');
  await expect(row(page, 'bKash')).toContainText('Takes it');
  await expect(row(page, 'Rocket')).toContainText("Doesn't");
  await expect(row(page, 'Bank transfer')).toContainText('bank');
  await expect(main(page).getByRole('button', { name: 'Retire' })).toHaveCount(5);
  await main(page).getByRole('link', { name: 'Payment methods' }).click();
  await expect(page).toHaveURL('/wallets');
});

test('retiring needs a reason, and says how many shops were told', async ({ page }) => {
  const log = await types(page);
  await row(page, 'Upay').getByRole('button', { name: 'Retire' }).click();
  const panel = page.getByRole('dialog', { name: 'Retire Upay?' });
  await expect(panel.getByText('3 shops have it on · 5 have an account for it')).toBeVisible();
  await expect(panel.getByText('Every shop that set it up keeps it whole')).toBeVisible();
  const button = panel.getByRole('button', { name: 'Retire Upay' });
  await expect(button).toBeDisabled();
  await panel.getByLabel('Reason').fill('No shop asked for it in a year');
  await button.click();
  await expect(page.getByText('Upay is retiring. 5 shops were told.')).toBeVisible();
  expect(log.sent('POST', '/operator/payment-method-types/upay/retire')).toEqual({
    reason: 'No shop asked for it in a year',
  });
  await expect(
    main(page).getByText('is retiring. Shops that set it up keep taking it'),
  ).toBeVisible();
  await expect(row(page, 'Upay')).toContainText('Retiring since 21 Oct 2026');
});

test('a retiring type can be brought back', async ({ page }) => {
  await types(page, { walletTypes: upayRetiring() });
  await row(page, 'Upay').getByRole('button', { name: 'Undo retiring' }).click();
  const panel = page.getByRole('dialog', { name: 'Undo retiring Upay?' });
  await panel.getByLabel('Reason').fill('A partner asked for it');
  await panel.getByRole('button', { name: 'Undo retiring' }).click();
  await expect(page.getByText('Upay is active again. 5 shops were told.')).toBeVisible();
  await expect(row(page, 'Upay').getByRole('button', { name: 'Retire' })).toBeVisible();
});

test('removing waits while something leans on it, and shows the three counts', async ({ page }) => {
  await types(page, { walletTypes: upayRetiring() });
  await row(page, 'Upay').getByRole('button', { name: 'Remove' }).click();
  const panel = page.getByRole('dialog', { name: "Upay can't be removed yet" });
  await expect(panel.getByText('Each shop switches it off itself.')).toBeVisible();
  await expect(panel.getByText('Nothing holds it here.')).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
});

test('once nothing leans on it, it is removed for good and stays, faded', async ({ page }) => {
  const log = await types(page, { walletTypes: upayRetiring(true) });
  await row(page, 'Upay').getByRole('button', { name: 'Remove' }).click();
  const panel = page.getByRole('dialog', { name: 'Remove Upay for good?' });
  await expect(panel.getByText("This can't be undone.")).toBeVisible();
  await panel.getByLabel('Reason').fill('Nothing uses it');
  await panel.getByRole('button', { name: 'Remove Upay' }).click();
  await expect(page.getByText('Upay is removed. Past payments keep their records.')).toBeVisible();
  expect(log.sent('POST', '/operator/payment-method-types/upay/remove')).toEqual({
    reason: 'Nothing uses it',
  });
  await expect(row(page, 'Upay')).toHaveClass(/text-fg-muted/);
  await expect(row(page, 'Upay').getByRole('button')).toHaveCount(0);
});

test('a removed type says when, with no action', async ({ page }) => {
  await types(page, { walletTypes: upayRemoved() });
  await expect(row(page, 'Upay')).toContainText('Removed 18 Nov 2026.');
});

test('a server that finds it still held shows the counts it found', async ({ page }) => {
  await mockApi(page, { walletTypes: upayRetiring(true) });
  await page.goto('/wallet-types');
  // The list was read clear; by the time Remove is pressed a shop has switched it on again.
  await row(page, 'Upay').getByRole('button', { name: 'Remove' }).click();
  const panel = page.getByRole('dialog', { name: 'Remove Upay for good?' });
  await panel.getByLabel('Reason').fill('Nothing uses it');
  await page.route('**/api/v1/operator/payment-method-types/upay/remove', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        statusCode: 409,
        message: "It can't be removed while it is in use.",
        errors: { code: 'conflict', details: { shopsOn: 1, openPayments: 0, lytroTakes: false } },
      }),
    }),
  );
  await panel.getByRole('button', { name: 'Remove Upay' }).click();
  const blocked = page.getByRole('dialog', { name: "Upay can't be removed yet" });
  await expect(blocked.getByText('Each shop switches it off itself.')).toBeVisible();
});

test('in Bangla, a retiring type reads রিটায়ার হচ্ছে (D8-78)', async ({ page }) => {
  await mockApi(page, { language: 'bn', walletTypes: upayRetiring() });
  await page.goto('/wallet-types');
  await expect(row(page, 'Upay')).toContainText('রিটায়ার হচ্ছে');
});

test('has no accessibility problems', async ({ page }) => {
  await types(page, { walletTypes: upayRetiring() });
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});
