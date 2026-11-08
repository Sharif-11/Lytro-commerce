import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §9: every platform value that is not a rate, in thirteen groups (v5 adds Phase 6's and 7's).

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/settings');
  await expect(page.getByRole('main').getByText('Trial length')).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

const change = (page: Page, name: string) =>
  main(page).getByRole('button', { name: `Change: ${name}`, exact: true });

async function typeReason(page: Page): Promise<void> {
  await main(page).getByRole('textbox', { name: 'Reason' }).fill('Because');
}

const timeline = (page: Page) =>
  main(page).locator('section').filter({ hasText: 'What these numbers do' });

test('shows all 37 in their thirteen groups, each saying what its number counts', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByRole('button', { name: /^Change:/ })).toHaveCount(37);
  await expect(main(page).getByRole('heading', { level: 2 })).toHaveCount(13);
  await expect(main(page).locator('#settings-group-1')).toContainText('30 days');
  await expect(main(page).locator('#settings-group-1')).toContainText('৳50,000');
  await expect(main(page).locator('#settings-group-3')).toContainText('30 minutes');
  await expect(main(page).locator('#settings-group-3')).toContainText(
    'Allow, with a prompt to upgrade',
  );
  await expect(main(page).locator('#settings-group-4')).toContainText('120 a minute');
  await expect(main(page).locator('#settings-group-6')).toContainText('1.0.0');
  await expect(main(page).locator('#settings-group-7')).toContainText('100 MB');
  await expect(main(page).locator('#settings-group-8')).toContainText('300 seconds');
  await expect(main(page).locator('#settings-group-9')).toContainText('2026-11-04');
  await expect(main(page).locator('#settings-group-10')).toContainText('6 hours');
  await expect(main(page).locator('#settings-group-10')).toContainText('10 minutes');
  await expect(main(page).locator('#settings-group-11')).toContainText('Gemini');
  await expect(main(page).locator('#settings-group-11')).toContainText('gemini-3.5-flash-lite');
  await expect(main(page).locator('#settings-group-12')).toContainText('30 a minute');
  await expect(main(page).locator('#settings-group-13')).toContainText('30 days');
});

test("Phase 7's settings: the AI, its model's warning, and how long notifications stay (v5)", async ({
  page,
}) => {
  const log = await open(page);
  await change(page, 'The AI that reads').click();
  await expect(main(page).getByRole('combobox', { name: 'The AI that reads' })).toHaveValue(
    'gemini',
  );
  await expect(
    main(page).getByText('Gemini is the only AI Lytro can read with today', { exact: false }),
  ).toBeVisible();
  await main(page).getByRole('button', { name: 'Cancel' }).click();

  await change(page, 'Its model').click();
  await expect(
    main(page).getByText('The name goes to Gemini as typed.', { exact: false }),
  ).toBeVisible();
  await main(page).getByRole('textbox', { name: 'Its model' }).fill('gemini-3.5-flash');
  await typeReason(page);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  expect(log.sent('PATCH', '/operator/settings/address_read_model')).toMatchObject({
    value: 'gemini-3.5-flash',
    reason: 'Because',
  });

  await change(page, 'A notification is kept for').click();
  await expect(
    main(page).getByText('Lowering it deletes the older notifications', { exact: false }),
  ).toBeVisible();
});

test('refuses a count that is not a whole number of 1 or more, sending nothing (v5)', async ({
  page,
}) => {
  const log = await open(page);
  await change(page, 'Checks per shop').click();
  await main(page).getByRole('textbox', { name: 'Checks per shop' }).fill('0');
  await typeReason(page);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(main(page).getByRole('alert')).toHaveText(
    'A whole number of 1 or more. Nothing was saved.',
  );
  expect(log.sent('PATCH', '/operator/settings/fraud_checks_per_shop_per_minute')).toBeUndefined();
  await main(page).getByRole('textbox', { name: 'Checks per shop' }).fill('40');
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  expect(log.sent('PATCH', '/operator/settings/fraud_checks_per_shop_per_minute')).toMatchObject({
    value: 40,
  });
});

test('each row says what it does and who last changed it', async ({ page }) => {
  await open(page);
  await expect(
    main(page).getByText(
      'How many days a new shop stays on the Trial plan (TRL-01). · Updated 2 Oct 2026 · ops@lytro.app',
    ),
  ).toBeVisible();
  await expect(
    main(page).getByText(
      'The smallest amount a tenant may top up in one payment, in TK (BAL-04).',
      { exact: true },
    ),
  ).toBeVisible();
});

test('the chips go to their groups', async ({ page }) => {
  await open(page);
  await main(page).getByRole('link', { name: 'Terms and privacy' }).click();
  await expect(page).toHaveURL(/#settings-group-9$/);
  await expect(main(page).locator('#settings-group-9')).toBeInViewport();
});

test('the timeline adds the four lengths up to the day data goes', async ({ page }) => {
  await open(page);
  await expect(timeline(page)).toContainText('0–3 · Grace');
  await expect(timeline(page)).toContainText('3–7 · Read-only');
  await expect(timeline(page)).toContainText('7–15 · Locked');
  await expect(timeline(page)).toContainText('15–60 · Archived');
  // LIF-07, LIF-11, LIF-12: what each stage takes away.
  await expect(timeline(page)).toContainText('Read-only: storefront offline');
  await expect(timeline(page)).toContainText('Locked: only the owner signs in');
  await expect(timeline(page)).toContainText('Archived: only a purchase screen');
  await expect(timeline(page)).toContainText('Day 60: business data deleted (LIF-19)');
});

test('the timeline shows a length as it is typed, and goes back on Cancel', async ({ page }) => {
  await open(page);
  await change(page, 'Grace').click();
  const value = main(page).getByRole('textbox', { name: 'Grace', exact: true });
  await value.fill('5');
  await expect(timeline(page)).toContainText('5–9 · Read-only');
  await expect(timeline(page)).toContainText('Day 62: business data deleted');
  await value.fill('nonsense');
  await expect(timeline(page)).toContainText('Day 60: business data deleted');
  await value.fill('5');
  await main(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(timeline(page)).toContainText('Day 60: business data deleted');
});

test('a number needs a reason, and goes as a number', async ({ page }) => {
  const log = await open(page);
  await change(page, 'Trial length').click();
  const value = main(page).getByRole('textbox', { name: 'Trial length' });
  await expect(value).toBeFocused();
  await value.fill('14');
  const save = main(page).getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  await typeReason(page);
  await save.click();
  await expect(page.getByText('Trial length is now 14 days.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/settings/trial_days')).toEqual({
    value: 14,
    reason: 'Because',
  });
  await expect(main(page).locator('#settings-group-1')).toContainText('14 days');
});

test('the senders edit one to a line, and go as a list', async ({ page }) => {
  const log = await open(page);
  await change(page, 'Wallet senders').click();
  const value = main(page).getByRole('textbox', { name: 'Wallet senders' });
  await expect(value).toHaveValue('bKash\nNAGAD\nupay\n16216');
  await expect(
    main(page).getByText('One sender on each line, as it appears on the phone.'),
  ).toBeVisible();
  await value.fill('bKash\n\n  NAGAD \nRocket\n');
  await typeReason(page);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Wallet senders is now bKash, NAGAD, Rocket.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/settings/listener_senders')).toEqual({
    value: ['bKash', 'NAGAD', 'Rocket'],
    reason: 'Because',
  });
  await expect(main(page).locator('#settings-group-6').getByText('Rocket')).toBeVisible();
});

test('the order limit is a choice of two', async ({ page }) => {
  const log = await open(page);
  await change(page, 'Past the order limit').click();
  const value = main(page).getByRole('combobox', { name: 'Past the order limit' });
  await expect(value).toHaveValue('allow_with_prompt');
  await value.selectOption('block');
  await typeReason(page);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Past the order limit is now Block.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/settings/order_limit_mode')).toEqual({
    value: 'block',
    reason: 'Because',
  });
});

test('a terms version warns before it changes, and goes as words', async ({ page }) => {
  const log = await open(page);
  await change(page, 'Terms version').click();
  await expect(
    main(page).getByText('Change this the same day new text is published.'),
  ).toBeVisible();
  await main(page).getByRole('textbox', { name: 'Terms version' }).fill('2027-01-01');
  await typeReason(page);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Terms version is now 2027-01-01.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/settings/terms_version')).toEqual({
    value: '2027-01-01',
    reason: 'Because',
  });
});

test('an app version goes as words', async ({ page }) => {
  const log = await open(page);
  await change(page, 'Oldest app allowed').click();
  await main(page).getByRole('textbox', { name: 'Oldest app allowed' }).fill('1.2.0');
  await typeReason(page);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Oldest app allowed is now 1.2.0.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/settings/listener_min_app_version')).toEqual({
    value: '1.2.0',
    reason: 'Because',
  });
});

test('one setting opens at a time', async ({ page }) => {
  await open(page);
  await change(page, 'Trial length').click();
  await change(page, 'Grace').click();
  await expect(main(page).getByRole('textbox', { name: 'Trial length' })).toHaveCount(0);
  await expect(main(page).getByRole('textbox', { name: 'Grace', exact: true })).toBeVisible();
});

test('a refused value stays open and says why', async ({ page }) => {
  await open(page, {
    refuseWrite: {
      path: '/operator/settings/trial_days',
      status: 400,
      code: 'validation_error',
      message: 'That value is not valid for this setting.',
    },
  });
  await change(page, 'Trial length').click();
  // A whole number the field takes, which the server still refuses.
  await main(page).getByRole('textbox', { name: 'Trial length' }).fill('400');
  await typeReason(page);
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(main(page).getByText('That value is not valid for this setting.')).toBeVisible();
  await expect(main(page).getByRole('textbox', { name: 'Trial length' })).toHaveValue('400');
});

test('a failed read says so and can be tried again', async ({ page }) => {
  const log = await mockApi(page, { failing: { '/operator/settings': 503 } });
  await page.goto('/settings');
  await expect(main(page).getByText('The server did not answer')).toBeVisible();
  delete log.state.failing['/operator/settings'];
  await main(page).getByRole('button', { name: 'Try again' }).click();
  await expect(main(page).getByText('Trial length')).toBeVisible();
});

test('reads in Bangla and passes the accessibility check', async ({ page }) => {
  await mockApi(page, { language: 'bn' });
  await page.goto('/settings');
  await expect(main(page).getByRole('heading', { name: 'সেটিংস' })).toBeVisible();
  await expect(main(page).getByText('ট্রায়ালের দৈর্ঘ্য')).toBeVisible();
  await expect(main(page).locator('#settings-group-1')).toContainText('30 দিন');
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await main(page).getByRole('button', { name: 'বদলান: ওয়ালেট সেন্ডার' }).click();
  const editing = await new AxeBuilder({ page }).analyze();
  expect(editing.violations).toEqual([]);
});
