import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §8: the per-use charges, changed in their rows.

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/rates');
  await expect(main(page).getByText('SMS, per part')).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

const change = (page: Page, name: string) =>
  main(page).getByRole('button', { name: `Change: ${name}`, exact: true });
const history = (page: Page, name: string) =>
  main(page).getByRole('button', { name: `History: ${name}`, exact: true });

test('lists all nine, each with its name, unit, date and value', async ({ page }) => {
  await open(page);
  await expect(main(page).getByRole('button', { name: /^Change:/ })).toHaveCount(9);
  await expect(main(page).getByText('৳ each · since 1 Sept 2026')).toBeVisible();
  await expect(main(page).getByText('৳0.4')).toBeVisible();
  await expect(main(page).getByText('% of the order · since 2 Oct 2026')).toBeVisible();
  await expect(main(page).getByText('1.5%')).toBeVisible();
  await expect(main(page).getByText('characters · since 14 Jul 2026')).toBeVisible();
  await expect(main(page).getByText('160', { exact: true })).toBeVisible();
});

test('the verification fees are a percent of the payment', async ({ page }) => {
  await open(page);
  await expect(main(page).getByText('% of the payment · since 2 Nov 2026')).toBeVisible();
  await expect(main(page).getByText('% of the payment · since 3 Nov 2026')).toBeVisible();
});

test('a change needs a reason, saves, and offers the notice that comes later', async ({ page }) => {
  const log = await open(page);
  await change(page, 'SMS, per part').click();
  const value = main(page).getByRole('textbox', { name: 'SMS, per part' });
  await expect(value).toBeFocused();
  await expect(value).toHaveValue('0.4');
  await value.fill('0.45');
  const save = main(page).getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await main(page).getByRole('textbox', { name: 'Reason' }).fill('Provider price went up');
  await save.click();
  await expect(page.getByText('Saved. Applies from the next charge.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/rates/sms_per_unit')).toEqual({
    value: 0.45,
    reason: 'Provider price went up',
  });
  await expect(main(page).getByText('৳0.45')).toBeVisible();
  await expect(main(page).getByText('Offer a rate-change notice to shops')).toBeVisible();
  await expect(main(page).getByText('Notices arrive with NTC-13.')).toBeVisible();
});

test('Cancel changes nothing', async ({ page }) => {
  const log = await open(page);
  await change(page, 'SMS, per part').click();
  await main(page).getByRole('textbox', { name: 'SMS, per part' }).fill('9');
  await main(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(main(page).getByText('৳0.4')).toBeVisible();
  expect(log.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  await expect(main(page).getByText('Offer a rate-change notice')).toHaveCount(0);
});

test('a refused value stays open and says why', async ({ page }) => {
  await open(page, {
    refuseWrite: {
      path: '/operator/rates/sms_per_unit',
      status: 400,
      code: 'validation_error',
      message: 'Use at most two decimals.',
    },
  });
  await change(page, 'SMS, per part').click();
  await main(page).getByRole('textbox', { name: 'SMS, per part' }).fill('0.455');
  await main(page).getByRole('textbox', { name: 'Reason' }).fill('Typo check');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(main(page).getByText('Use at most two decimals.')).toBeVisible();
  await expect(main(page).getByRole('textbox', { name: 'SMS, per part' })).toHaveValue('0.455');
});

test('history opens under the row, newest first, and closes again', async ({ page }) => {
  await open(page);
  const button = history(page, 'Pay-as-you-go order fee');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const lines = main(page).getByText('→');
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toHaveText('2% → 1.5%');
  await expect(lines.last()).toHaveText('1.5% → 2%');
  await expect(main(page).getByText('2 Oct 2026 · ops@lytro.app · no notice')).toBeVisible();
  await button.click();
  await expect(main(page).getByText('→')).toHaveCount(0);
});

test('history says when there has been no change', async ({ page }) => {
  await open(page);
  await history(page, 'Chat AI reply').click();
  await expect(main(page).getByText('No changes recorded.')).toBeVisible();
});

test('a saved change is in the history', async ({ page }) => {
  await open(page);
  await change(page, 'Chat AI reply').click();
  await main(page).getByRole('textbox', { name: 'Chat AI reply' }).fill('1.25');
  await main(page).getByRole('textbox', { name: 'Reason' }).fill('Model cost');
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. Applies from the next charge.')).toBeVisible();
  await history(page, 'Chat AI reply').click();
  await expect(main(page).getByText('৳1 → ৳1.25')).toBeVisible();
});

test('a failed read says so and can be tried again', async ({ page }) => {
  const log = await mockApi(page, { failing: { '/operator/rates': 503 } });
  await page.goto('/rates');
  await expect(main(page).getByText('The server did not answer')).toBeVisible();
  delete log.state.failing['/operator/rates'];
  await main(page).getByRole('button', { name: 'Try again' }).click();
  await expect(main(page).getByText('SMS, per part')).toBeVisible();
});

test('reads in Bangla and passes the accessibility check', async ({ page }) => {
  await open(page, { language: 'bn' }).catch(() => undefined);
  await expect(main(page).getByRole('heading', { name: 'রেট' })).toBeVisible();
  await expect(main(page).getByText('SMS, প্রতি পার্ট')).toBeVisible();
  await main(page).getByRole('button', { name: 'ইতিহাস: SMS, প্রতি পার্ট' }).click();
  await main(page).getByRole('button', { name: 'বদলান: চ্যাট AI উত্তর' }).click();
  await expect(main(page).getByText('নোটিশ নেই')).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
