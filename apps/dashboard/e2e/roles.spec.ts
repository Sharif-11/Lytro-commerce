import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, refusal, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnTeam } from './support/team';

// TENANT-DASHBOARD-DESIGN §7.14, Slice 11.6: Team's Roles -- the roles with what each lets someone do, the editor with
// the role's name and its permissions in words, creating, renaming and deleting (STF-07, STF-09, STF-10). Each test runs
// on a phone and on a desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/team/roles`);
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function role(page: Page, name: string) {
  return main(page).getByRole('button', { name: new RegExp(`^${name}`) });
}

async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map(
      (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('lists each role with what it lets someone do, the first open in the editor', async ({
  page,
}) => {
  await open(page);
  // "See" is left out where the role may also change the same thing.
  await expect(role(page, 'Stock staff')).toContainText(
    '1 person · Add and change products · Change stock, costs and purchases',
  );
  await expect(role(page, 'Billing staff')).toContainText(
    '1 person · Top up the balance · Pay for the plan, add-ons and packs · See the activity',
  );
  await expect(role(page, 'Stock staff')).toHaveAttribute('aria-current', 'true');
  await expect(main(page).getByLabel('Role name')).toHaveValue('Stock staff');
  await expect(main(page).getByRole('checkbox', { name: 'See products' })).toBeChecked();
  await expect(main(page).getByRole('checkbox', { name: 'See the team' })).not.toBeChecked();
  await expect(
    main(page).getByRole('checkbox', { name: /Pay for the plan, add-ons and packs/ }),
  ).toHaveAccessibleName(/Spends the balance/);
  // STF-09: a role someone holds cannot be deleted.
  await expect(main(page).getByRole('button', { name: 'Delete · 1 person' })).toBeDisabled();
  await expectAccessible(page);
});

test('renames a role and changes what it may do', async ({ page }) => {
  const log = await open(page);
  await role(page, 'Billing staff').click();
  await expect(main(page).getByLabel('Role name')).toHaveValue('Billing staff');
  await main(page).getByLabel('Role name').fill('Accounts');
  await main(page).getByRole('checkbox', { name: 'See the team' }).check();
  await main(page).getByRole('checkbox', { name: 'See the activity' }).uncheck();
  await main(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Role saved');
  expect(log.sent('PATCH', '/roles/r-billing')).toEqual({
    name: 'Accounts',
    permissions: [
      'balance:read',
      'balance:manage',
      'payments:read',
      'payments:manage',
      'staff:read',
    ],
  });
  await expect(role(page, 'Accounts')).toBeVisible();
});

test('creates a role from an empty editor, its name needed', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Create a role' }).click();
  await expect(main(page).getByLabel('Role name')).toHaveValue('');
  await expect(main(page).getByRole('checkbox', { checked: true })).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Create the role' }).click();
  await expect(main(page).getByText('Give the role a name.')).toBeVisible();
  await main(page).getByLabel('Role name').fill('Packing');
  await main(page).getByRole('checkbox', { name: 'See stock' }).check();
  await main(page).getByRole('button', { name: 'Create the role' }).click();
  await expect(page.getByRole('status')).toHaveText('Packing created');
  expect(log.sent('POST', '/roles')).toEqual({ name: 'Packing', permissions: ['inventory:read'] });
  await expect(role(page, 'Packing')).toHaveAttribute('aria-current', 'true');
  // Nobody holds it, so it can go.
  await expect(main(page).getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
});

test('Cancel leaves a new role unmade', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Create a role' }).click();
  await main(page).getByLabel('Role name').fill('Packing');
  await main(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(main(page).getByLabel('Role name')).toHaveValue('Stock staff');
  expect(log.calls.some((call) => call.method === 'POST')).toBe(false);
});

test('deletes a role nobody holds, after asking', async ({ page }) => {
  const team = drawnTeam('en');
  team.roles.push({ id: 'r-spare', name: 'Spare', permissions: [] });
  const log = await open(page, { team });
  await role(page, 'Spare').click();
  await main(page).getByRole('button', { name: 'Delete', exact: true }).click();
  const ask = page.getByRole('dialog', { name: 'Delete "Spare"?' });
  await expect(ask).toContainText('Nobody holds it');
  await ask.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('status')).toHaveText('Role deleted');
  expect(log.calls.some((call) => call.method === 'DELETE' && call.path === '/roles/r-spare')).toBe(
    true,
  );
  await expect(role(page, 'Spare')).toHaveCount(0);
});

test('a role taken up meanwhile is not deleted, and says why', async ({ page }) => {
  const team = drawnTeam('en');
  team.roles.push({ id: 'r-spare', name: 'Spare', permissions: [] });
  await open(page, { team });
  await page.route('**/api/v1/roles/r-spare', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: refusal('conflict', 'People hold this role.', { holders: 2 }),
    });
  });
  await role(page, 'Spare').click();
  await main(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete "Spare"?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Delete "Spare"?' })).toContainText(
    '2 people hold this role. Give them another role first, then it can be deleted.',
  );
});

test('a shop with no roles yet has the editor ready for the first', async ({ page }) => {
  const team = drawnTeam('en');
  team.roles = [];
  team.staff = team.staff.slice(0, 1);
  await open(page, { team });
  await expect(
    main(page).getByText('No roles yet. Make the first from what staff may do.'),
  ).toBeVisible();
  await expect(main(page).getByLabel('Role name')).toHaveValue('');
  await expect(main(page).getByRole('button', { name: 'Create the role' })).toBeVisible();
  // Nothing to go back to.
  await expect(main(page).getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expectAccessible(page);
});

test('someone who may only see the team reads the roles without changing them', async ({
  page,
}) => {
  await open(page, { isOwner: false, permissions: ['staff:read'] });
  await expect(main(page).getByRole('button', { name: 'Create a role' })).toHaveCount(0);
  await expect(main(page).getByRole('checkbox', { name: 'See products' })).toBeDisabled();
  await expect(main(page).getByRole('button', { name: 'Save' })).toHaveCount(0);
});
