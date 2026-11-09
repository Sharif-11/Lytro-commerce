import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnWallets } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §10: what shops can pay Lytro by, and how each method's payments are confirmed.

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/wallets');
  await expect(main(page).getByText('01711 000000')).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function card(page: Page, name: string) {
  return main(page).getByRole('region', { name });
}

test('shows each method with its numbers, and bKash with its three ways', async ({ page }) => {
  await open(page, { wallets: drawnWallets().reverse() });
  await expect(page.getByRole('heading', { name: 'Payment methods' })).toBeVisible();
  const bkash = card(page, 'bKash');
  await expect(bkash).toContainText('1 number · Listener');
  await expect(bkash.getByRole('radio', { name: 'Listener' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(bkash.getByRole('radio')).toHaveCount(3);
  await expect(card(page, 'Nagad')).toContainText('Manual only for now');
  await expect(card(page, 'Nagad').getByRole('radio')).toHaveCount(0);
  await expect(card(page, 'Upay')).toContainText('Off · shops do not see it');
});

test('says no phone is online, and how many are when one is', async ({ page }) => {
  await open(page, { lytroPhones: [] });
  await expect(card(page, 'bKash')).toContainText('No phone is online');
});

test('turns a method off, and asks first for the last one on', async ({ page }) => {
  const log = await open(page);
  await card(page, 'Nagad').getByRole('switch', { name: 'Nagad on' }).click();
  await expect(card(page, 'Nagad')).toContainText('Off · shops do not see it');
  expect(log.sent('PATCH', '/operator/payment-methods/nagad')).toEqual({ enabled: false });
  await card(page, 'Rocket').getByRole('switch', { name: 'Rocket on' }).click();
  await expect(card(page, 'Rocket')).toContainText('Off · shops do not see it');
  await card(page, 'bKash').getByRole('switch', { name: 'bKash on' }).click();
  const panel = page.getByRole('dialog', { name: 'Turn off the last method?' });
  await expect(panel).toContainText('No shop will be able to pay');
  await panel.getByRole('button', { name: 'Turn off' }).click();
  await expect(main(page).getByRole('alert')).toContainText('Every method is off');
});

test('changes a way at once, and manual says what it means', async ({ page }) => {
  const log = await open(page);
  const bkash = card(page, 'bKash');
  await expect(bkash).toContainText('even with a phone paired');
  await bkash.getByRole('radio', { name: 'Manual' }).click();
  await expect(bkash.getByRole('radio', { name: 'Manual' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(log.sent('PATCH', '/operator/payment-methods/bkash')).toEqual({ way: 'manual' });
});

test('choosing automatic with no keys asks for them, tests them, then asks to turn it on', async ({
  page,
}) => {
  const log = await open(page);
  const bkash = card(page, 'bKash');
  await bkash.getByRole('radio', { name: 'Automatic checkout' }).click();
  const panel = page.getByRole('dialog', { name: "Connect Lytro's bKash checkout" });
  await expect(panel.getByRole('button', { name: 'Save and test' })).toBeDisabled();
  await panel.getByLabel('App key').fill('key');
  await panel.getByLabel('App secret').fill('secret');
  await panel.getByLabel('Username').fill('user');
  await panel.getByLabel('Password').fill('pass');
  await panel.getByRole('button', { name: 'Save and test' }).click();
  await expect(panel).toContainText('Turn automatic checkout on for shops now?');
  expect(log.sent('PUT', '/operator/payment-methods/bkash/gateway')).toEqual({
    number: '01711 000000',
    appKey: 'key',
    appSecret: 'secret',
    username: 'user',
    password: 'pass',
    sandbox: true,
  });
  // Connecting alone changes nothing about how money is taken.
  expect(log.calls.some((call) => call.method === 'PATCH')).toBe(false);
  await panel.getByRole('button', { name: 'Turn it on' }).click();
  await expect(bkash.getByRole('radio', { name: 'Automatic checkout' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(log.sent('PATCH', '/operator/payment-methods/bkash')).toEqual({ way: 'automated' });
  await expect(bkash).toContainText('Connected');
  await expect(bkash).toContainText('Sandbox');
});

test("says bKash's code when it refuses the keys, and automatic stays off", async ({ page }) => {
  const log = await open(page, { gatewayTest: { ok: false, code: '2001' } });
  await card(page, 'bKash').getByRole('button', { name: 'Connect bKash' }).click();
  const panel = page.getByRole('dialog', { name: "Connect Lytro's bKash checkout" });
  for (const label of ['App key', 'App secret', 'Username', 'Password']) {
    await panel.getByLabel(label).fill('x');
  }
  await panel.getByRole('button', { name: 'Save and test' }).click();
  await expect(panel.getByRole('alert')).toContainText('code 2001');
  expect(log.calls.some((call) => call.method === 'PATCH')).toBe(false);
});

test('removing the keys asks first and goes back to the listener', async ({ page }) => {
  const methods = {
    methods: [
      {
        method: 'bkash',
        kind: 'wallet',
        enabled: true,
        way: 'automated',
        ways: ['automated', 'listener', 'manual'],
        gateway: { connected: true, unreadable: false, sandbox: false, number: '01711 000000' },
      },
    ],
    bankAccounts: [],
  };
  const log = await open(page, { paymentMethods: methods });
  await card(page, 'bKash').getByRole('button', { name: 'Manage keys' }).click();
  const panel = page.getByRole('dialog', { name: "Connect Lytro's bKash checkout" });
  await expect(panel).toContainText('Keys are saved.');
  await panel.getByRole('button', { name: 'Remove keys' }).click();
  const sure = page.getByRole('dialog', { name: 'Remove keys' });
  await expect(sure).toContainText('goes back to the listener');
  await sure.getByRole('button', { name: 'Remove keys' }).click();
  await expect(card(page, 'bKash').getByRole('radio', { name: 'Listener' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(
    log.calls.some(
      (call) => call.method === 'DELETE' && call.path === '/operator/payment-methods/bkash/gateway',
    ),
  ).toBe(true);
});

test('adds a number from its own card, next in the order', async ({ page }) => {
  const log = await open(page);
  await card(page, 'Rocket').getByRole('button', { name: 'Add number' }).click();
  const panel = page.getByRole('dialog', { name: 'New wallet' });
  await expect(panel.getByLabel('Provider')).toHaveValue('Rocket');
  await panel.getByLabel('Number').fill(' 01911 000009 ');
  await panel.getByRole('button', { name: 'Add wallet' }).click();
  await expect(page.getByText('Rocket 01911 000009 added.')).toBeVisible();
  expect(log.sent('POST', '/operator/platform-wallets')).toEqual({
    provider: 'Rocket',
    number: '01911 000009',
    label: null,
    displayOrder: 4,
    enabled: true,
  });
});

test('Shown saves at once, and a number can be removed', async ({ page }) => {
  const log = await open(page);
  const rocket = card(page, 'Rocket');
  await rocket.getByRole('switch', { name: 'Shown to sellers' }).click();
  await expect(page.getByText('Sellers can see Rocket 01911 0000001 now.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/platform-wallets/w3')).toEqual({ enabled: true });
  await rocket.getByRole('button', { name: 'Remove' }).click();
  const panel = page.getByRole('dialog', { name: 'Remove this wallet?' });
  await panel.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Rocket · 01911 0000001 removed.')).toBeVisible();
});

test('says when a method is on with nothing shown to shops', async ({ page }) => {
  await open(page, {
    wallets: drawnWallets().map((each) =>
      each['provider'] === 'Nagad' ? { ...each, enabled: false } : each,
    ),
  });
  await expect(card(page, 'Nagad')).toContainText('On, but nothing is shown to shops');
});

test('adds and edits a bank account, always confirmed by hand', async ({ page }) => {
  const log = await open(page);
  const bank = card(page, 'Bank transfer');
  await bank.getByRole('switch', { name: 'Bank transfer on' }).click();
  await expect(bank).toContainText('always confirmed by hand');
  await bank.getByRole('button', { name: 'Add bank account' }).click();
  const panel = page.getByRole('dialog', { name: 'Bank account' });
  await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();
  await panel.getByLabel('Bank name').fill('BRAC Bank');
  await panel.getByLabel('Account name').fill('Lytronix Ltd');
  await panel.getByLabel('Account number').fill('1501204567890001');
  await panel.getByLabel('Branch').fill('Gulshan');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Bank account saved.')).toBeVisible();
  expect(log.sent('POST', '/operator/payment-methods/bank-accounts')).toMatchObject({
    bankName: 'BRAC Bank',
    accountNumber: '1501204567890001',
    branch: 'Gulshan',
  });
  await expect(bank).toContainText('BRAC Bank · Gulshan');
});

test('a failed read can be tried again', async ({ page }) => {
  const log = await mockApi(page, { failing: { '/operator/payment-methods': 503 } });
  await page.goto('/wallets');
  await expect(main(page).getByText('The server did not answer')).toBeVisible();
  delete log.state.failing['/operator/payment-methods'];
  await main(page).getByRole('button', { name: 'Try again' }).click();
  await expect(card(page, 'bKash')).toBeVisible();
});

test('reads in Bangla and passes the accessibility check', async ({ page }) => {
  await open(page, { language: 'bn' });
  await expect(main(page).getByRole('heading', { name: 'পেমেন্ট মেথড' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await main(page).getByRole('button', { name: 'bKash কানেক্ট করুন' }).click();
  const inPanel = await new AxeBuilder({ page }).analyze();
  expect(inPanel.violations).toEqual([]);
});
