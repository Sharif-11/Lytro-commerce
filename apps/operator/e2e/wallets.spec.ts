import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnWallets } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §10: the numbers sellers send plan payments and top-ups to.

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/wallets');
  await expect(main(page).getByText('01711 000000')).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function row(page: Page, words: string) {
  return main(page).locator('section > div').filter({ hasText: words }).first();
}

test('lists each number in the order sellers see them', async ({ page }) => {
  await open(page, { wallets: drawnWallets().reverse() });
  const numbers = main(page).locator('section .mono');
  await expect(numbers).toHaveText(['01711 000000', '01811 000000', '01911 0000001']);
  await expect(row(page, '01711 000000')).toContainText('Lytronix · personal');
  await expect(row(page, '01911 0000001')).toContainText('None');
});

test('Shown saves at once', async ({ page }) => {
  const log = await open(page);
  const toggle = row(page, '01911 0000001').getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(page.getByText('Sellers can see Rocket 01911 0000001 now.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/platform-wallets/w3')).toEqual({ enabled: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('adding one sends what was typed, next in the order', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Add wallet' }).click();
  const panel = page.getByRole('dialog', { name: 'New wallet' });
  await expect(panel.getByRole('button', { name: 'Add wallet' })).toBeDisabled();
  await panel.getByLabel('Provider').selectOption('Upay');
  await panel.getByLabel('Number').fill(' 01511 000000 ');
  await panel.getByRole('button', { name: 'Add wallet' }).click();
  await expect(page.getByText('Upay 01511 000000 added.')).toBeVisible();
  expect(log.sent('POST', '/operator/platform-wallets')).toEqual({
    provider: 'Upay',
    number: '01511 000000',
    label: null,
    displayOrder: 4,
    enabled: true,
  });
  await expect(row(page, '01511 000000')).toContainText('Upay');
});

test('editing keeps its values, and a provider the list does not name', async ({ page }) => {
  const log = await open(page, {
    wallets: [
      {
        id: 'w9',
        provider: 'SureCash',
        number: '01711 000000',
        label: 'Old',
        enabled: true,
        displayOrder: 1,
        createdAt: '2026-07-14T00:00:00.000Z',
      },
    ],
  });
  await row(page, '01711 000000').getByRole('button', { name: 'Edit' }).click();
  const panel = page.getByRole('dialog', { name: 'Edit wallet' });
  await expect(panel.getByLabel('Provider')).toHaveValue('SureCash');
  await expect(panel.getByLabel('Label, optional')).toHaveValue('Old');
  await panel.getByLabel('Label, optional').fill('');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('SureCash 01711 000000 saved.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/platform-wallets/w9')).toMatchObject({
    provider: 'SureCash',
    label: null,
  });
});

test('removing asks first and says what it does', async ({ page }) => {
  const log = await open(page);
  await row(page, '01911 0000001').getByRole('button', { name: 'Remove' }).click();
  const panel = page.getByRole('dialog', { name: 'Remove this wallet?' });
  await expect(panel.getByText('Sellers stop seeing it at once.')).toBeVisible();
  await panel.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Rocket · 01911 0000001 removed.')).toBeVisible();
  expect(
    log.calls.some(
      (call) => call.method === 'DELETE' && call.path === '/operator/platform-wallets/w3',
    ),
  ).toBe(true);
  await expect(main(page).getByText('01911 0000001')).toHaveCount(0);
});

test('holds the place for gateways', async ({ page }) => {
  await open(page);
  await expect(
    main(page).getByText("Gateway credentials for Lytro's own wallets arrive with ADM-10."),
  ).toBeVisible();
});

test('says when there are none, and a failed read can be tried again', async ({ page }) => {
  const log = await mockApi(page, { wallets: [], failing: { '/operator/platform-wallets': 503 } });
  await page.goto('/wallets');
  await expect(main(page).getByText('The server did not answer')).toBeVisible();
  delete log.state.failing['/operator/platform-wallets'];
  await main(page).getByRole('button', { name: 'Try again' }).click();
  await expect(main(page).getByText('No wallets yet')).toBeVisible();
});

test('reads in Bangla and passes the accessibility check', async ({ page }) => {
  await open(page, { language: 'bn' });
  await expect(main(page).getByRole('heading', { name: 'প্ল্যাটফর্ম ওয়ালেট' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await main(page).getByRole('button', { name: 'ওয়ালেট যোগ' }).click();
  const inPanel = await new AxeBuilder({ page }).analyze();
  expect(inPanel.violations).toEqual([]);
});
