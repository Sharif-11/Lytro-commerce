import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnPlans, drawnPrices, drawnTerms } from './support/console-data';
import { mockApi, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §6: the price matrix, and a plan's editor, versions and delete.

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/plans');
  await expect(page.getByRole('main').getByRole('table')).toBeVisible();
  return log;
}

const main = (page: Page) => page.getByRole('main');
const cell = (page: Page, name: string) => main(page).getByRole('textbox', { name });
const editOf = (page: Page, name: string) =>
  main(page).getByRole('button', { name: `Edit ${name}` });

test('lists each plan by rank with its prices, and only the live terms', async ({ page }) => {
  await open(page, { plans: drawnPlans().reverse() });
  const rows = main(page).getByRole('row');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(1)).toContainText('Trial');
  await expect(rows.nth(3)).toContainText('Starter');
  await expect(rows.nth(3)).toContainText('v3');
  await expect(rows.nth(3)).toContainText('100 products');
  await expect(rows.nth(2)).toContainText('Unlimited orders handled a month');
  await expect(cell(page, 'Starter, 6 months')).toHaveValue('2,559');
  await expect(main(page).getByText('Launch offer')).toHaveCount(0);
});

test('a plan not for sale has no price to change', async ({ page }) => {
  await open(page);
  await expect(cell(page, 'Trial, 1 month')).toBeDisabled();
  await expect(cell(page, 'Growth, 1 month')).toBeEnabled();
});

test('marks a term sellers cannot see', async ({ page }) => {
  const log = await mockApi(page);
  const hidden = log.state.terms.find((term) => term.id === 't12');
  if (hidden) hidden.visible = false;
  await page.goto('/plans');
  await expect(main(page).getByRole('columnheader', { name: /12 months/ })).toContainText('hidden');
});

test('a price saves on Enter', async ({ page }) => {
  const log = await open(page);
  const price = cell(page, 'Starter, 1 month');
  await price.fill('499');
  await price.press('Enter');
  await expect(page.getByText('Starter, 1 month: ৳499 saved.')).toBeVisible();
  expect(log.sent('PUT', '/operator/plans/p-starter/prices/t1')).toEqual({ price: 499 });
  await expect(price).toHaveValue('499');
});

test('a cleared cell saves as not offered', async ({ page }) => {
  const log = await open(page);
  const price = cell(page, 'Pro, 12 months');
  await price.focus();
  await expect(price).toHaveValue('10549');
  await price.fill('');
  await price.press('Enter');
  await expect(page.getByText('Pro is no longer offered for 12 months.')).toBeVisible();
  expect(
    log.calls.some((call) => call.method === 'DELETE' && call.path.endsWith('p-pro/prices/t12')),
  ).toBe(true);
  await expect(price).toHaveValue('');
});

test('a price that is not whole taka is refused here, and nothing is sent', async ({ page }) => {
  const log = await open(page);
  const price = cell(page, 'Starter, 1 month');
  for (const typed of ['449.50', '0', 'abc']) {
    await price.fill(typed);
    await price.press('Enter');
    await expect(main(page).getByText('A price is whole taka, above zero.')).toBeVisible();
  }
  expect(log.calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
});

test('a change left without Enter says so, and Esc takes it back', async ({ page }) => {
  const log = await open(page);
  const price = cell(page, 'Starter, 1 month');
  await price.fill('500');
  await price.blur();
  await expect(main(page).getByText("Starter, 1 month isn't saved yet.")).toBeVisible();
  await expect(price).toHaveValue('500');
  await price.focus();
  await price.press('Escape');
  await expect(price).toHaveValue('449');
  await expect(main(page).getByText("isn't saved yet")).toHaveCount(0);
  expect(log.calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
});

test('looking at a cell changes nothing', async ({ page }) => {
  const log = await open(page);
  const price = cell(page, 'Starter, 6 months');
  await price.focus();
  await expect(price).toHaveValue('2559');
  await price.blur();
  await expect(price).toHaveValue('2,559');
  await expect(main(page).getByText("isn't saved yet")).toHaveCount(0);
  await price.focus();
  await price.press('Enter');
  expect(log.calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
});

test("an empty cell starts from the term's discount, and saves only on Enter", async ({ page }) => {
  const prices = drawnPrices().filter(
    (price) => !(price.planId === 'p-pro' && price.billingTermId === 't6'),
  );
  const log = await open(page, { prices });
  const price = cell(page, 'Pro, 6 months');
  await expect(price).toHaveValue('');
  await price.focus();
  // ৳999 a month, for 6, less 5%.
  await expect(price).toHaveValue('5694');
  await price.blur();
  await expect(price).toHaveValue('');
  await expect(main(page).getByText("isn't saved yet")).toHaveCount(0);
  expect(log.calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  await price.focus();
  await price.press('Enter');
  await expect(page.getByText('Pro, 6 months: ৳5,694 saved.')).toBeVisible();
  expect(log.sent('PUT', '/operator/plans/p-pro/prices/t6')).toEqual({ price: 5694 });
});

test('a term with no discount, or nothing to work from, starts empty', async ({ page }) => {
  await open(page, {
    prices: drawnPrices().filter(
      (price) => price.billingTermId === 't1' && price.planId !== 'p-pro',
    ),
    terms: drawnTerms().map((term) =>
      term.id === 't6' ? { ...term, defaultDiscountPct: null } : term,
    ),
  });
  const noDiscount = cell(page, 'Starter, 6 months');
  await noDiscount.focus();
  await expect(noDiscount).toHaveValue('');
  const noBase = cell(page, 'Pro, 12 months');
  await noBase.focus();
  await expect(noBase).toHaveValue('');
  const withBoth = cell(page, 'Starter, 12 months');
  await withBoth.focus();
  await expect(withBoth).toHaveValue('4741');
});

test('a price the server refuses says why and stays in the cell', async ({ page }) => {
  await open(page, {
    refuseWrite: {
      path: '/operator/plans/p-starter/prices/t1',
      status: 409,
      code: 'conflict',
      message: 'That term is retired.',
    },
  });
  const price = cell(page, 'Starter, 1 month');
  await price.fill('499');
  await price.press('Enter');
  await expect(main(page).getByText('That term is retired.')).toBeVisible();
  await expect(price).toHaveValue('499');
});

test('the editor shows what is set, and saves the next version', async ({ page }) => {
  const log = await open(page);
  await editOf(page, 'Starter').click();
  const panel = page.getByRole('dialog', { name: 'Edit Starter' });
  await expect(panel.getByText('v3 · Rank 2')).toBeVisible();
  await expect(panel.getByLabel('Name', { exact: true })).toHaveValue('Starter');
  await expect(panel.getByLabel('Rank')).toHaveValue('2');
  await expect(panel.getByRole('textbox', { name: 'Products', exact: true })).toHaveValue('100');
  await expect(
    panel.getByRole('checkbox', { name: 'Unlimited Essential SMS, total' }),
  ).toBeChecked();
  await expect(
    panel.getByText(
      'v3 recorded 29 Sept 2026. Saving records v4; shops already on v3 keep it until they renew (PLN-02).',
    ),
  ).toBeVisible();

  await panel.getByRole('textbox', { name: 'Products', exact: true }).fill('150');
  await panel.getByRole('checkbox', { name: 'Unlimited Bandwidth, GB' }).check();
  await panel.getByRole('textbox', { name: 'Storage, MB' }).fill('');
  await panel.getByRole('button', { name: 'ai_reply' }).click();
  await panel.getByRole('button', { name: 'Save as v4' }).click();

  await expect(page.getByText('Starter saved as v4.')).toBeVisible();
  await expect(panel).toBeHidden();
  const sent = log.sent('PATCH', '/operator/plans/p-starter') as {
    limits: Record<string, unknown>;
    features: Record<string, boolean>;
  };
  expect(sent.limits.products).toBe(150);
  // Unlimited is null; an emptied limit is left out, for the reader's own default.
  expect(sent.limits.bandwidth_gb).toBeNull();
  expect('storage_mb' in sent.limits).toBe(false);
  expect(sent.limits.essential_sms_total).toBeNull();
  expect(sent.features.ai_reply).toBe(true);
  await expect(main(page).getByRole('row').nth(3)).toContainText('v4');
});

test('retention is never unlimited', async ({ page }) => {
  await open(page);
  await editOf(page, 'Starter').click();
  const panel = page.getByRole('dialog', { name: 'Edit Starter' });
  await expect(panel.getByRole('textbox', { name: 'Activity retention, days' })).toBeVisible();
  await expect(
    panel.getByRole('checkbox', { name: 'Unlimited Activity retention, days' }),
  ).toHaveCount(0);
});

test('a new plan starts above the others, with their flags off', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'New plan' }).click();
  const panel = page.getByRole('dialog', { name: 'New plan' });
  await expect(panel.getByLabel('Rank')).toHaveValue('5');
  await expect(panel.getByRole('button', { name: 'Create plan' })).toBeDisabled();
  await panel.getByLabel('Name', { exact: true }).fill('Scale');
  await panel.getByRole('textbox', { name: 'Products', exact: true }).fill('9000');
  await panel.getByRole('button', { name: 'api' }).click();
  await panel.getByRole('button', { name: 'Add a flag' }).click();
  await panel.getByRole('textbox', { name: 'Add a flag' }).fill('white_label');
  await panel.getByRole('textbox', { name: 'Add a flag' }).press('Enter');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'white_label' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByText('Scale created.')).toBeVisible();
  expect(log.sent('POST', '/operator/plans')).toMatchObject({
    name: 'Scale',
    rank: 5,
    forSale: true,
    limits: { products: 9000 },
    features: { api: true, custom_domain: false, white_label: true },
  });
  await expect(main(page).getByRole('row').last()).toContainText('Scale');
});

test('a rank already taken is said under the field', async ({ page }) => {
  await open(page);
  await page.route('**/api/v1/operator/plans/p-pro', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        statusCode: 400,
        message: 'Some fields need attention.',
        errors: {
          code: 'validation_error',
          details: {
            fields: [{ field: 'rank', problem: 'taken', message: 'Another plan has this rank.' }],
          },
        },
      }),
    }),
  );
  await editOf(page, 'Pro').click();
  const panel = page.getByRole('dialog', { name: 'Edit Pro' });
  await panel.getByRole('button', { name: 'Save as v2' }).click();
  await expect(panel.getByText('Another plan has this rank.')).toBeVisible();
  await expect(panel.getByText('Some fields need attention.')).toHaveCount(0);
});

test('version history says when, what changed and who is on each', async ({ page }) => {
  await open(page);
  await editOf(page, 'Starter').click();
  await page
    .getByRole('dialog', { name: 'Edit Starter' })
    .getByRole('button', { name: 'Version history' })
    .click();
  const panel = page.getByRole('dialog', { name: 'Version history' });
  await expect(panel.getByText('v3 "Starter" · recorded 29 Sept 2026')).toBeVisible();
  await expect(panel.getByText('current')).toBeVisible();
  await expect(panel.getByText('Products 80 → 100')).toBeVisible();
  await expect(panel.getByText('v2 "Starter" · recorded 12 Aug 2026')).toBeVisible();
  await expect(panel.getByText('Orders handled a month 250 → 300')).toBeVisible();
  await expect(panel.getByText('v1 "Starter" · recorded 14 Jul 2026')).toBeVisible();
  await expect(panel.getByText('Products 80 · Orders handled a month 250')).toBeVisible();
  await expect(panel.getByText('188 shops · v3 ×131 · v2 ×57 · v1 ×0')).toBeVisible();
});

test('a plan shops are on cannot go, and says why', async ({ page }) => {
  await open(page);
  await editOf(page, 'Starter').click();
  const panel = page.getByRole('dialog', { name: 'Edit Starter' });
  await expect(panel.getByRole('button', { name: 'Delete plan' })).toBeDisabled();
  await expect(
    panel.getByText('188 shops are on this plan; take it off sale instead.'),
  ).toBeVisible();
});

test('a plan named elsewhere with no shops says that instead', async ({ page }) => {
  const plans = drawnPlans().map((plan) => ({ ...plan, shopsByVersion: [] }));
  await open(page, { plans });
  await editOf(page, 'Starter').click();
  const panel = page.getByRole('dialog', { name: 'Edit Starter' });
  await expect(panel.getByRole('button', { name: 'Delete plan' })).toBeDisabled();
  await expect(
    panel.getByText('Its prices, payments or past versions still name it'),
  ).toBeVisible();
  await expect(panel.getByText('0 shops')).toHaveCount(0);
});

test('a plan nothing names can go, after asking', async ({ page }) => {
  const plans = drawnPlans().map((plan) =>
    plan.id === 'p-pro' ? { ...plan, shopsByVersion: [], deletable: true } : plan,
  );
  const log = await open(page, { plans });
  await editOf(page, 'Pro').click();
  await page
    .getByRole('dialog', { name: 'Edit Pro' })
    .getByRole('button', { name: 'Delete plan' })
    .click();
  const panel = page.getByRole('dialog', { name: 'Delete plan' });
  await expect(panel.getByText('It goes for good.')).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  const back = page.getByRole('dialog', { name: 'Edit Pro' });
  await back.getByRole('button', { name: 'Delete plan' }).click();
  await page
    .getByRole('dialog', { name: 'Delete plan' })
    .getByRole('button', { name: 'Delete plan' })
    .click();
  await expect(page.getByText('Pro deleted.')).toBeVisible();
  expect(
    log.calls.some((call) => call.method === 'DELETE' && call.path === '/operator/plans/p-pro'),
  ).toBe(true);
  await expect(main(page).getByRole('row')).toHaveCount(5);
});

test('a delete the server now refuses stays open and says why', async ({ page }) => {
  const plans = drawnPlans().map((plan) =>
    plan.id === 'p-pro' ? { ...plan, shopsByVersion: [], deletable: true } : plan,
  );
  await open(page, {
    plans,
    refuseWrite: {
      path: '/operator/plans/p-pro',
      status: 409,
      code: 'conflict',
      message: 'A shop just bought this plan.',
    },
  });
  await editOf(page, 'Pro').click();
  await page
    .getByRole('dialog', { name: 'Edit Pro' })
    .getByRole('button', { name: 'Delete plan' })
    .click();
  const panel = page.getByRole('dialog', { name: 'Delete plan' });
  await panel.getByRole('button', { name: 'Delete plan' }).click();
  await expect(panel.getByText('A shop just bought this plan.')).toBeVisible();
});

// PLN-21: the suggested plan, the one the landing page highlights.
const SAVED_AT_ONCE = 'Saved at once; the plan keeps its version.';
const suggestedSwitch = (page: Page, plan: string) =>
  page
    .getByRole('dialog', { name: `Edit ${plan}` })
    .getByRole('switch', { name: 'Suggested plan' });
const chips = (page: Page) => main(page).getByText('suggested', { exact: true });

test('the suggested plan carries a chip in the matrix, and no other plan does', async ({
  page,
}) => {
  await open(page);
  await expect(chips(page)).toHaveCount(1);
  await expect(
    main(page).getByRole('row').nth(3).getByText('suggested', { exact: true }),
  ).toBeVisible();
});

test('the switch moves the mark the moment it is flipped, and records no version', async ({
  page,
}) => {
  const log = await open(page);
  await editOf(page, 'Growth').click();
  const panel = page.getByRole('dialog', { name: 'Edit Growth' });
  const mark = suggestedSwitch(page, 'Growth');
  await expect(mark).not.toBeChecked();
  await expect(
    panel.getByText(
      `Turn it on and the landing page highlights this plan instead of Starter. ${SAVED_AT_ONCE}`,
    ),
  ).toBeVisible();

  await mark.click();
  await expect(mark).toBeChecked();
  await expect(
    panel.getByText(`The landing page highlights this plan. ${SAVED_AT_ONCE}`),
  ).toBeVisible();
  expect(log.sent('PUT', '/operator/plans/p-growth/suggested')).toEqual({ suggested: true });
  await expect(chips(page)).toHaveCount(1);
  await expect(
    main(page).getByRole('row').nth(4).getByText('suggested', { exact: true }),
  ).toBeVisible();
  // Not a plan edit: the panel stays open, nothing is patched, and Growth is still v2.
  await expect(panel).toBeVisible();
  expect(log.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  await expect(main(page).getByRole('row').nth(4)).toContainText('v2');

  await mark.click();
  await expect(mark).not.toBeChecked();
  expect(log.sent('PUT', '/operator/plans/p-growth/suggested')).toEqual({ suggested: false });
  await expect(chips(page)).toHaveCount(0);
  await expect(
    panel.getByText(`Turn it on and the landing page highlights this plan. ${SAVED_AT_ONCE}`),
  ).toBeVisible();
});

test('a mark the server refuses flips back and says why', async ({ page }) => {
  const log = await open(page);
  await editOf(page, 'Growth').click();
  // Taken off sale in another tab after this page read the list: the server now refuses the mark.
  const growth = log.state.plans.find((plan) => plan.id === 'p-growth');
  if (growth) growth.onPricingPage = false;
  const mark = suggestedSwitch(page, 'Growth');
  await mark.click();
  await expect(
    page
      .getByRole('dialog', { name: 'Edit Growth' })
      .getByText(
        'Only a plan on the pricing page can be suggested: one for sale, or Pay-as-you-go.',
      ),
  ).toBeVisible();
  await expect(mark).not.toBeChecked();
  await expect(
    main(page).getByRole('row').nth(3).getByText('suggested', { exact: true }),
  ).toBeVisible();
});

test('the Trial and a new plan have no switch; a plan off the pricing page has it greyed', async ({
  page,
}) => {
  const legacy = {
    ...drawnPlans()[4],
    id: 'p-legacy',
    name: 'Legacy',
    rank: 5,
    forSale: false,
    onPricingPage: false,
    suggested: false,
  };
  await open(page, { plans: [...drawnPlans(), legacy] });
  await editOf(page, 'Trial').click();
  const trial = page.getByRole('dialog', { name: 'Edit Trial' });
  await expect(trial.getByRole('switch', { name: 'For sale' })).toBeVisible();
  await expect(trial.getByRole('switch', { name: 'Suggested plan' })).toHaveCount(0);
  await trial.getByRole('button', { name: 'Cancel' }).click();

  await editOf(page, 'Legacy').click();
  await expect(suggestedSwitch(page, 'Legacy')).toBeDisabled();
  await expect(
    page
      .getByRole('dialog', { name: 'Edit Legacy' })
      .getByText('Only a plan on the pricing page (for sale, or pay-as-you-go) can be suggested.'),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Edit Legacy' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  // Pay-as-you-go is not for sale, yet the pricing page shows it.
  await editOf(page, 'Pay-as-you-go').click();
  await expect(suggestedSwitch(page, 'Pay-as-you-go')).toBeEnabled();
  await page
    .getByRole('dialog', { name: 'Edit Pay-as-you-go' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  await main(page).getByRole('button', { name: 'New plan' }).click();
  await expect(
    page.getByRole('dialog', { name: 'New plan' }).getByRole('switch', { name: 'Suggested plan' }),
  ).toHaveCount(0);
});

test('a failed read says so and can be tried again', async ({ page }) => {
  const log = await mockApi(page, { failing: { '/operator/billing-terms/prices': 503 } });
  await page.goto('/plans');
  await expect(main(page).getByText('The server did not answer')).toBeVisible();
  delete log.state.failing['/operator/billing-terms/prices'];
  await main(page).getByRole('button', { name: 'Try again' }).click();
  await expect(cell(page, 'Starter, 1 month')).toHaveValue('449');
});

test('reads in Bangla and passes the accessibility check', async ({ page }) => {
  await open(page, { language: 'bn' });
  await expect(main(page).getByRole('heading', { name: 'প্ল্যান ও দাম' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'নতুন প্ল্যান' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await main(page).getByRole('button', { name: 'এডিট Starter' }).click();
  const inPanel = await new AxeBuilder({ page }).analyze();
  expect(inPanel.violations).toEqual([]);
});
