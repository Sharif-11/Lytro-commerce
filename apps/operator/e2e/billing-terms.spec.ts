import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnTerms } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §7: how long a plan can be bought for.

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/billing-terms');
  await expect(main(page).getByText('1 month').first()).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

const LIVE_ONE = '6 months';

function row(page: Page, words: string) {
  return main(page).locator('section > div').filter({ hasText: words }).first();
}

test('lists each term in its order, with what its months, discount and prices say', async ({
  page,
}) => {
  await open(page);
  const six = row(page, LIVE_ONE);
  await expect(six).toContainText('৬ মাস');
  await expect(six).toContainText('5%');
  await expect(six).toContainText('3 / 3');
  await expect(row(page, '1 month')).toContainText('—');
});

test('a retired term stays, marked, with no way to show it again', async ({ page }) => {
  await open(page);
  const offer = row(page, 'Launch offer');
  await expect(offer).toContainText('one shop');
  await expect(offer).toContainText('retired 30 Sept 2026');
  await expect(offer.getByRole('switch')).toBeDisabled();
  await expect(offer.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(offer.getByRole('button', { name: 'Retire' })).toHaveCount(0);
});

test('Visible saves at once', async ({ page }) => {
  const log = await open(page);
  const toggle = row(page, LIVE_ONE).getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(page.getByText('Sellers no longer see 6 months.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/billing-terms/t6')).toEqual({ visible: false });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(page.getByText('Sellers can see 6 months now.')).toBeVisible();
});

test('a new term sends what was typed', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New term' }).click();
  const panel = page.getByRole('dialog', { name: 'New billing term' });
  await expect(panel.getByRole('button', { name: 'Create term' })).toBeDisabled();
  await panel.getByLabel('Label, English').fill('Quarter deal');
  await panel.getByLabel('Label, Bangla').fill('কোয়ার্টার ডিল');
  await panel.getByLabel('Months').fill('2');
  await expect(panel.getByLabel('Display order')).toHaveValue('5');
  await panel.getByLabel('Default discount, %').fill('2.5');
  await panel.getByRole('button', { name: 'Create term' }).click();
  await expect(page.getByText('Quarter deal created.')).toBeVisible();
  expect(log.sent('POST', '/operator/billing-terms')).toEqual({
    labelEn: 'Quarter deal',
    labelBn: 'কোয়ার্টার ডিল',
    months: 2,
    displayOrder: 5,
    visible: true,
    defaultDiscountPct: 2.5,
  });
  await expect(row(page, 'Quarter deal')).toContainText('2.5%');
});

test('a single-shop term names its shop when made, and only then', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New term' }).click();
  const made = page.getByRole('dialog', { name: 'New billing term' });
  await made.getByLabel('Label, English').fill('Deal');
  await made.getByLabel('Label, Bangla').fill('ডিল');
  await made.getByLabel('Months').fill('2');
  await made.getByLabel('Single-shop term').fill('ten-0007');
  await made.getByRole('button', { name: 'Create term' }).click();
  await expect(page.getByText('Deal created.')).toBeVisible();
  expect(log.sent('POST', '/operator/billing-terms')).toMatchObject({ tenantId: 'ten-0007' });

  await row(page, LIVE_ONE).getByRole('button', { name: 'Edit' }).click();
  const edited = page.getByRole('dialog', { name: 'Edit term' });
  await expect(edited.getByLabel('Single-shop term')).toBeDisabled();
  await expect(edited.getByText("it can't move to another shop")).toBeVisible();
});

test('editing a term keeps its values, and a cleared discount reaches the server', async ({
  page,
}) => {
  const log = await open(page);
  await row(page, LIVE_ONE).getByRole('button', { name: 'Edit' }).click();
  const panel = page.getByRole('dialog', { name: 'Edit term' });
  await expect(panel.getByLabel('Months')).toHaveValue('6');
  await expect(panel.getByLabel('Default discount, %')).toHaveValue('5');
  await panel.getByLabel('Default discount, %').fill('');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('6 months saved.')).toBeVisible();
  expect(log.sent('PATCH', '/operator/billing-terms/t6')).toMatchObject({ defaultDiscountPct: 0 });
  await expect(row(page, LIVE_ONE)).not.toContainText('%');
});

test('a problem with one field is said under it', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/operator/billing-terms', (route) =>
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
                fields: [{ field: 'months', problem: 'too_large', message: 'At most 60.' }],
              },
            },
          }),
        })
      : route.fallback(),
  );
  await main(page).getByRole('button', { name: 'New term' }).click();
  const panel = page.getByRole('dialog', { name: 'New billing term' });
  await panel.getByLabel('Label, English').fill('Long');
  await panel.getByLabel('Label, Bangla').fill('লম্বা');
  await panel.getByLabel('Months').fill('61');
  await panel.getByRole('button', { name: 'Create term' }).click();
  await expect(panel.getByText('At most 60.')).toBeVisible();
});

test('retiring asks first and says how many invoices keep it', async ({ page }) => {
  const log = await open(page);
  await row(page, LIVE_ONE).getByRole('button', { name: 'Retire' }).click();
  const panel = page.getByRole('dialog', { name: 'Retire this term?' });
  await expect(panel.getByText('57 invoices keep it as bought.')).toBeVisible();
  await panel.getByRole('button', { name: 'Retire' }).click();
  await expect(page.getByText('6 months retired.')).toBeVisible();
  expect(log.calls.some((call) => call.path === '/operator/billing-terms/t6/retire')).toBe(true);
  await expect(row(page, LIVE_ONE).getByRole('switch')).toBeDisabled();
});

test('one invoice reads as one', async ({ page }) => {
  const terms = drawnTerms().map((term) => (term.id === 't6' ? { ...term, invoices: 1 } : term));
  await open(page, { terms });
  await row(page, LIVE_ONE).getByRole('button', { name: 'Retire' }).click();
  await expect(page.getByText('1 invoice keeps it as bought.')).toBeVisible();
});

test('a retired term something names cannot be deleted', async ({ page }) => {
  await open(page);
  await expect(row(page, 'Launch offer').getByRole('button', { name: 'Delete' })).toBeDisabled();
});

test('a retired term nothing names can go, after asking', async ({ page }) => {
  const terms = drawnTerms().map((term) =>
    term.id === 't3x' ? { ...term, invoices: 0, deletable: true } : term,
  );
  const log = await open(page, { terms });
  await row(page, 'Launch offer').getByRole('button', { name: 'Delete' }).click();
  const panel = page.getByRole('dialog', { name: 'Delete this term?' });
  await expect(panel.getByText('It goes for good.')).toBeVisible();
  await panel.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Launch offer · 3 months deleted.')).toBeVisible();
  expect(
    log.calls.some(
      (call) => call.method === 'DELETE' && call.path === '/operator/billing-terms/t3x',
    ),
  ).toBe(true);
});

test('a failed read says so and can be tried again', async ({ page }) => {
  const log = await mockApi(page, { failing: { '/operator/billing-terms': 503 } });
  await page.goto('/billing-terms');
  await expect(main(page).getByText('The server did not answer')).toBeVisible();
  delete log.state.failing['/operator/billing-terms'];
  await main(page).getByRole('button', { name: 'Try again' }).click();
  await expect(main(page).getByText('1 month').first()).toBeVisible();
});

test('says when there are none', async ({ page }) => {
  await mockApi(page, { terms: [] });
  await page.goto('/billing-terms');
  await expect(main(page).getByText('No billing terms yet')).toBeVisible();
});

test('reads in Bangla and passes the accessibility check', async ({ page }) => {
  await open(page, { language: 'bn' });
  await expect(main(page).getByRole('heading', { name: 'বিলিং টার্ম' })).toBeVisible();
  await expect(row(page, LIVE_ONE)).toContainText('৩ / ৩'.replaceAll('৩', '3'));
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await row(page, LIVE_ONE).getByRole('button', { name: 'রিটায়ার' }).click();
  await expect(page.getByText('57টি ইনভয়েসে যেমন ছিল থাকবে।')).toBeVisible();
  const inPanel = await new AxeBuilder({ page }).analyze();
  expect(inPanel.violations).toEqual([]);
});
