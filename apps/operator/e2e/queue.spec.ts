import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADDON,
  addonPayment,
  drawnPayments,
  REVIEW_RENEWAL,
  REVIEW_SENDER,
  TOP_UP,
  UPGRADE,
} from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §4: evidence before action, and each action in its own panel. Each test runs on a phone and on
// a desktop.

async function open(page: Page, path = '/queue', state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto(path);
  return log;
}

function dialog(page: Page, name: string | RegExp) {
  return page.getByRole('dialog', { name });
}

test('lists what needs review first, with its evidence', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Payment queue' })).toBeVisible();
  const rows = page
    .getByRole('main')
    .getByRole('link', { name: /Collection|Boutique|Shoes|Fashion/ });
  await expect(rows.first()).toHaveText('Sadia Collection');
  // The third needing review is the sketch's last payment, ahead of those with no receipt.
  await expect(rows.nth(2)).toHaveText('Faiza Shoes');
  await expect(rows.nth(3)).toHaveText('Rahim Fashion');
  await expect(page.getByText('sadia-collection.lytro.app')).toBeVisible();
  await expect(page.getByText('Starter · 1 month').first()).toBeVisible();
  await expect(page.getByText('quoted ৳449', { exact: true })).toBeVisible();
  await expect(page.getByText('BKH7A2M9Q1 · bKash')).toBeVisible();
  await expect(page.getByText('Credits ৳500 to the balance')).toBeVisible();
});

test('a wallet shows only once a receipt has seen the money', async ({ page }) => {
  await open(page);
  await expect(page.getByText('BKH9Z1C4T7', { exact: true })).toBeVisible();
});

test('filters by kind and to what needs review, with the counts', async ({ page }) => {
  await open(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: /^All/ })).toContainText('7');
  await main.getByRole('button', { name: /^Top-up/ }).click();
  await expect(main.getByText('Rahim Fashion')).toBeVisible();
  await expect(main.getByText('Sadia Collection')).toHaveCount(0);
  await main.getByRole('button', { name: /^All/ }).click();
  await main.getByRole('button', { name: 'Needs review only' }).click();
  await expect(main.getByText('Sadia Collection')).toBeVisible();
  await expect(main.getByText('Rahim Fashion')).toHaveCount(0);
});

test('opens a payment at its own address, which a reload keeps', async ({ page }) => {
  await open(page);
  await page.getByRole('link', { name: 'Sadia Collection' }).click();
  await expect(page).toHaveURL(`/queue/${REVIEW_RENEWAL}`);
  const panel = dialog(page, /৳448 · Renewal/);
  await expect(panel.getByText("The amount isn't what was quoted.")).toBeVisible();
  await expect(panel.getByText('Seller says they sent')).toBeVisible();
  await expect(panel.getByText('A receipt says arrived')).toBeVisible();
  await expect(panel.getByText('Starter v3 · 1 month')).toBeVisible();
  await page.reload();
  await expect(dialog(page, /৳448 · Renewal/)).toBeVisible();
  await dialog(page, /৳448 · Renewal/)
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(page).toHaveURL('/queue');
});

test('a click anywhere on a row opens it; its buttons go straight to their step', async ({
  page,
}) => {
  await open(page);
  await page.getByText('Credits ৳500 to the balance').click();
  await expect(page).toHaveURL(`/queue/${TOP_UP}`);
  await dialog(page, /৳500 · Top-up/)
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await expect(dialog(page, 'Approve this payment?')).toBeVisible();
});

test("approving what a receipt says sends no amount: the server's figure stands", async ({
  page,
}) => {
  const log = await open(page, `/queue/${REVIEW_RENEWAL}?step=approve`);
  const panel = dialog(page, 'Approve this payment?');
  await expect(panel.getByText('goes on')).toBeVisible();
  await expect(panel).toContainText('Sadia Collection goes on Starter for 1 month');
  // D7-20: the invoice tells the owner, as plan-invoicing does.
  await expect(panel).toContainText('the owner is told in the dashboard, and by SMS and email');
  await expect(panel).toContainText('This accepts ৳448 against a quote of ৳449');
  await expect(panel.getByLabel('What arrived')).toHaveValue('448');
  await panel.getByRole('button', { name: 'Approve ৳448' }).click();
  await expect(page).toHaveURL('/queue');
  await expect(
    page.getByRole('status').getByText('Approved ৳448. Sadia Collection is on Starter.'),
  ).toBeVisible();
  expect(log.sent('POST', `/operator/payment-queue/${REVIEW_RENEWAL}/approve`)).toBeNull();
  await expect(page.getByRole('main').getByText('Sadia Collection')).toHaveCount(0);
});

test('approving a different amount sends it, and the button follows it', async ({ page }) => {
  const log = await open(page, `/queue/${REVIEW_RENEWAL}?step=approve`);
  const panel = dialog(page, 'Approve this payment?');
  await panel.getByLabel('What arrived').fill('450');
  await panel.getByRole('button', { name: 'Approve ৳450' }).click();
  await expect(page).toHaveURL('/queue');
  expect(log.sent('POST', `/operator/payment-queue/${REVIEW_RENEWAL}/approve`)).toEqual({
    amount: 450,
  });
});

test('says how the owner is told (D7-20), and promises no end date', async ({ page }) => {
  await open(page, `/queue/${UPGRADE}?step=approve`);
  const panel = dialog(page, 'Approve this payment?');
  await expect(panel).toContainText('Arif Electronics goes on Pro for 1 month');
  await expect(panel).toContainText('by SMS and email where they have them');
  await expect(panel).not.toContainText('until');
});

test('an amount that is no amount cannot be approved', async ({ page }) => {
  await open(page, `/queue/${UPGRADE}?step=approve`);
  const panel = dialog(page, 'Approve this payment?');
  await panel.getByLabel('What arrived').fill('');
  await expect(panel.getByRole('button', { name: /^Approve/ })).toBeDisabled();
  await panel.getByLabel('What arrived').fill('abc');
  await expect(panel.getByRole('button', { name: /^Approve/ })).toBeDisabled();
});

test('a top-up says what is credited, and has no balance step of its own', async ({ page }) => {
  await open(page, `/queue/${TOP_UP}`);
  const facts = dialog(page, /৳500 · Top-up/);
  await expect(facts.getByText('No receipt yet')).toBeVisible();
  await expect(facts.getByRole('button', { name: /balance instead/ })).toHaveCount(0);
  await facts.getByRole('button', { name: 'Approve ৳500' }).click();
  const panel = dialog(page, 'Approve this payment?');
  await expect(panel).toContainText("৳500 is credited to Rahim Fashion's balance, once.");
  await panel.getByRole('button', { name: 'Approve ৳500' }).click();
  await expect(
    page.getByRole('status').getByText('Approved ৳500. Balance credited.'),
  ).toBeVisible();
});

test('a review for another reason says that reason, with no talk of amounts', async ({ page }) => {
  await open(page, `/queue/${REVIEW_SENDER}`);
  const panel = dialog(page, /৳2,000 · Top-up/);
  await expect(
    panel.getByText("The money came from a number the seller didn't name."),
  ).toBeVisible();
});

test('an add-on names itself and says what approving does', async ({ page }) => {
  await open(page, `/queue/${ADDON}`, { payments: [addonPayment(), ...drawnPayments()] });
  const panel = dialog(page, /৳99 · Add-on/);
  await expect(panel.getByText('Approving activates the add-on at once')).toBeVisible();
  await expect(panel.getByText(/Extra 500 products ×1 · 24 days to 14 Nov 2026/)).toBeVisible();
  await panel.getByRole('button', { name: 'Approve ৳99' }).click();
  await dialog(page, 'Approve this payment?').getByRole('button', { name: 'Approve ৳99' }).click();
  await expect(page.getByRole('status').getByText('Approved ৳99. The add-on is on.')).toBeVisible();
});

test('rejecting needs a note, which goes with it', async ({ page }) => {
  const log = await open(page, `/queue/${UPGRADE}`);
  await dialog(page, /৳400 · Upgrade/)
    .getByRole('button', { name: 'Reject' })
    .click();
  const panel = dialog(page, 'Reject this payment?');
  await expect(panel.getByText('Nothing is credited.', { exact: false })).toBeVisible();
  const send = panel.getByRole('button', { name: 'Reject with note' });
  await expect(send).toBeDisabled();
  await panel.getByLabel('Note the seller will read').fill('  Not in the statement  ');
  await send.click();
  await expect(page).toHaveURL('/queue');
  await expect(
    page.getByRole('status').getByText('Rejected. The seller will see your note.'),
  ).toBeVisible();
  expect(log.sent('POST', `/operator/payment-queue/${UPGRADE}/reject`)).toEqual({
    note: 'Not in the statement',
  });
});

test('with no receipt, putting it on the balance needs the amount from the statement', async ({
  page,
}) => {
  const log = await open(page, `/queue/${UPGRADE}?step=credit`);
  const panel = dialog(page, 'Put it on the balance?');
  await expect(panel.getByLabel('What arrived')).toHaveValue('');
  await expect(panel.getByRole('button', { name: /on the balance/ })).toBeDisabled();
  await panel.getByLabel('What arrived').fill('400');
  await panel.getByRole('button', { name: 'Put ৳400 on the balance' }).click();
  await expect(
    page.getByRole('status').getByText("৳400 is on Arif Electronics's balance."),
  ).toBeVisible();
  expect(log.sent('POST', `/operator/payment-queue/${UPGRADE}/credit`)).toEqual({ amount: 400 });
});

test("with a receipt, the balance takes the receipt's figure unless it is changed", async ({
  page,
}) => {
  const log = await open(page, `/queue/${REVIEW_RENEWAL}`);
  await dialog(page, /৳448/)
    .getByRole('button', { name: 'Put the money on the balance instead' })
    .click();
  const panel = dialog(page, 'Put it on the balance?');
  await expect(panel).toContainText('Nothing is activated.');
  await expect(panel).not.toContainText('The owner is told');
  await panel.getByRole('button', { name: 'Put ৳448 on the balance' }).click();
  await expect(page).toHaveURL('/queue');
  expect(log.sent('POST', `/operator/payment-queue/${REVIEW_RENEWAL}/credit`)).toBeNull();
});

test("a top-up can't reach the balance step by its address", async ({ page }) => {
  await open(page, `/queue/${TOP_UP}?step=credit`);
  await expect(dialog(page, /৳500 · Top-up/)).toBeVisible();
});

test('Cancel steps back to the payment; closing returns to the queue unchanged', async ({
  page,
}) => {
  await open(page, `/queue/${REVIEW_RENEWAL}?step=reject`);
  await dialog(page, 'Reject this payment?').getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page, /৳448 · Renewal/)).toBeVisible();
  await expect(page).toHaveURL(`/queue/${REVIEW_RENEWAL}`);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/queue');
  await expect(page.getByRole('main').getByText('Sadia Collection')).toBeVisible();
});

test('a refusal stays in the panel, with nothing lost', async ({ page }) => {
  const path = `/operator/payment-queue/${UPGRADE}/reject`;
  await open(page, `/queue/${UPGRADE}?step=reject`, {
    refuseWrite: {
      path,
      status: 409,
      code: 'conflict',
      message: 'This payment was already handled.',
    },
  });
  const panel = dialog(page, 'Reject this payment?');
  await panel.getByLabel('Note the seller will read').fill('Not in the statement');
  await panel.getByRole('button', { name: 'Reject with note' }).click();
  await expect(panel.getByText('This payment was already handled.')).toBeVisible();
  await expect(panel.getByLabel('Note the seller will read')).toHaveValue('Not in the statement');
});

test('a payment no longer waiting goes back to the queue', async ({ page }) => {
  await open(page, '/queue/pay-gone');
  await expect(page).toHaveURL('/queue');
});

test('a queue with nothing in it says what fills it', async ({ page }) => {
  await open(page, '/queue', { queue: 0 });
  await expect(page.getByRole('main').getByText('New wallet payments appear here')).toBeVisible();
});

test('a queue that fails offers a retry', async ({ page }) => {
  const log = await open(page, '/queue', { failing: { '/operator/payment-queue': 503 } });
  await expect(page.getByText('The server did not answer')).toBeVisible();
  log.state.failing = {};
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: 'Sadia Collection' })).toBeVisible();
});

test('approving takes the payment off the count in the frame', async ({ page }) => {
  await open(page, `/queue/${TOP_UP}?step=approve`, { queue: 3 });
  const tab = page
    .getByRole('navigation')
    .filter({ visible: true })
    .getByRole('link', { name: /Payment queue/ })
    .first();
  await expect(tab).toContainText('3');
  await dialog(page, 'Approve this payment?')
    .getByRole('button', { name: /^Approve/ })
    .click();
  await expect(tab).toContainText('2');
});

test('in Bangla, the panel is too', async ({ page }) => {
  await open(page, `/queue/${REVIEW_RENEWAL}`, { language: 'bn' });
  await expect(page.getByRole('dialog').getByText('টাকার অঙ্ক কোটের সাথে মেলেনি।')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '৳448 অ্যাপ্রুভ' }),
  ).toBeVisible();
});

test('has no accessibility problems, with a panel open or closed', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('link', { name: 'Sadia Collection' })).toBeVisible();
  let found = await new AxeBuilder({ page }).analyze();
  expect(found.violations.map((violation) => violation.id)).toEqual([]);
  await page.goto(`/queue/${REVIEW_RENEWAL}?step=approve`);
  await expect(dialog(page, 'Approve this payment?')).toBeVisible();
  found = await new AxeBuilder({ page }).analyze();
  expect(found.violations.map((violation) => violation.id)).toEqual([]);
});
