import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GROWTH } from './support/catalogue';
import { mockApi, refusal, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { drawnTeam, type TeamFixture } from './support/team';

// TENANT-DASHBOARD-DESIGN §7.14, Slice 11.6: Team's People -- the seats, the people, adding staff (with a role made
// inside the sheet), editing, deactivating and reactivating, a new first password, and the seat-full dialog. Each test
// runs on a phone and on a desktop (playwright.config.ts).

/** The prototype's team with a third seat, so a sheet opens instead of the seat-full dialog. */
function withSeat(change: (team: TeamFixture) => void = () => undefined): TeamFixture {
  const team = drawnTeam('en');
  team.seats = 3;
  change(team);
  return team;
}

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}/team`);
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

function sheet(page: Page) {
  return page.getByRole('dialog');
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

test('shows the seats and every person, the owner first, an inactive person marked', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByText('2 of 2 seats, owner included')).toBeVisible();
  await expect(main(page).getByText('All seats are full.', { exact: false })).toBeVisible();
  await expect(main(page).getByRole('link', { name: /People/ })).toContainText('3');
  await expect(main(page).getByRole('link', { name: /Roles/ })).toHaveAttribute(
    'href',
    `/${SLUG}/team/roles`,
  );
  const rows = main(page).getByText(/^(Rumana|Kamal Hossain|Sabrina)/);
  await expect(rows.first()).toHaveText(/^Rumana/);
  await expect(main(page).getByText('Every permission')).toBeVisible();
  // Kamal has not chosen his own password; Sabrina is inactive, her role kept.
  await expect(main(page).getByRole('button', { name: /Kamal Hossain/ })).toContainText(
    'Password not set',
  );
  await expect(main(page).getByRole('button', { name: /Sabrina/ })).toContainText('Off');
  await expect(main(page).getByRole('button', { name: /Sabrina/ })).toContainText('Stock staff');
  // The owner's row opens nothing.
  await expect(main(page).getByRole('button', { name: /Rumana/ })).toHaveCount(0);
  await expectAccessible(page);
});

test('adds staff with a random first password and the roles ticked', async ({ page }) => {
  const log = await open(page, { team: withSeat() });
  await main(page).getByRole('button', { name: 'Add staff' }).click();
  const password = await sheet(page).getByLabel('First password').inputValue();
  // Two groups of four, with no letter or digit that reads as another (0 and o, 1, l and i).
  expect(password).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  await expectAccessible(page);

  await sheet(page).getByLabel('Phone number').fill('1611');
  await sheet(page).getByRole('button', { name: 'Add staff' }).click();
  await expect(sheet(page).getByText('Enter a mobile number, like 1711 234 567.')).toBeVisible();

  await sheet(page).getByLabel('Phone number').fill('1612 345 678');
  await sheet(page).getByLabel('Name (optional)').fill('Mitu');
  await sheet(page)
    .getByRole('checkbox', { name: /Billing staff/ })
    .check();
  await sheet(page).getByRole('button', { name: 'Add staff' }).click();
  await expect(page.getByRole('status')).toHaveText('Mitu added');
  expect(log.sent('POST', '/staff')).toEqual({
    phone: '+8801612345678',
    password,
    name: 'Mitu',
    roleIds: ['r-billing'],
  });
  await expect(main(page).getByRole('button', { name: /Mitu/ })).toContainText('Billing staff');
});

test('makes a role inside Add staff and comes back with it ticked and the typing kept', async ({
  page,
}) => {
  const log = await open(page, {
    team: withSeat((team) => {
      team.roles = [];
    }),
  });
  await main(page).getByRole('button', { name: 'Add staff' }).click();
  await expect(
    sheet(page).getByText('No roles yet. Create one to give this person.'),
  ).toBeVisible();
  await sheet(page).getByLabel('Phone number').fill('1612 345 678');
  await sheet(page).getByLabel('Name (optional)').fill('Mitu');

  await sheet(page).getByRole('button', { name: 'Create a role' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'New role' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Create and choose' }).click();
  await expect(sheet(page).getByText('Give the role a name.')).toBeVisible();
  // Back keeps what was typed.
  await sheet(page).getByRole('button', { name: 'Back' }).click();
  await expect(sheet(page).getByLabel('Phone number')).toHaveValue('1612 345 678');

  await sheet(page).getByRole('button', { name: 'Create a role' }).click();
  await sheet(page).getByLabel('Role name').fill('Packing');
  await sheet(page).getByRole('checkbox', { name: 'See stock' }).check();
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Create and choose' }).click();
  expect(log.sent('POST', '/roles')).toEqual({ name: 'Packing', permissions: ['inventory:read'] });

  await expect(sheet(page).getByRole('heading', { name: 'Add staff' })).toBeVisible();
  await expect(sheet(page).getByLabel('Phone number')).toHaveValue('1612 345 678');
  await expect(sheet(page).getByLabel('Name (optional)')).toHaveValue('Mitu');
  await expect(sheet(page).getByRole('checkbox', { name: /Packing/ })).toBeChecked();
  await expect(sheet(page).getByRole('checkbox', { name: /Packing/ })).toHaveAccessibleName(
    /See stock/,
  );
  await sheet(page).getByRole('button', { name: 'Add staff' }).click();
  expect((log.sent('POST', '/staff') as { roleIds: string[] }).roleIds).toEqual(['r-1']);
});

test('with every seat in use, Add staff opens the ways out at once', async ({ page }) => {
  const log = await open(page, { money: { usage: { used: { seats: 2 } } } });
  await main(page).getByRole('button', { name: 'Add staff' }).click();
  const dialog = page.getByRole('dialog', { name: 'No seat is free' });
  await expect(dialog).toContainText(
    'All 2 seats are in use, the owner’s included. To add someone, deactivate someone, buy a seat (৳49/month), or move to Growth.',
  );
  await expect(dialog.getByRole('link', { name: 'Buy a seat' })).toHaveAttribute(
    'href',
    `/${SLUG}/addons?buy=extra_seat`,
  );
  await expect(dialog.getByRole('link', { name: 'See plans' })).toHaveAttribute(
    'href',
    `/${SLUG}/plan?plan=${GROWTH}`,
  );
  await expectAccessible(page);
  expect(log.calls.some((call) => call.method === 'POST' && call.path === '/staff')).toBe(false);
});

test('staff who may not pay are told only what they can do', async ({ page }) => {
  const log = await open(page, {
    isOwner: false,
    permissions: ['staff:read', 'staff:manage'],
  });
  await main(page).getByRole('button', { name: 'Add staff' }).click();
  const dialog = page.getByRole('dialog', { name: 'No seat is free' });
  await expect(dialog).toContainText(
    'All 2 seats are in use, the owner’s included. Deactivate someone to free a seat; the owner can buy a seat or change the plan.',
  );
  await expect(dialog.getByRole('link')).toHaveCount(0);
  // The shop's usage is a payer's read.
  expect(log.calls.some((call) => call.path === '/usage')).toBe(false);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
});

test('a seat taken meanwhile turns the refusal into the same dialog', async ({ page }) => {
  await open(page, { team: withSeat() });
  await page.route('**/api/v1/staff', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: refusal('plan_limit_reached', 'Every seat is in use.', { metric: 'seats', seats: 3 }),
    });
  });
  await main(page).getByRole('button', { name: 'Add staff' }).click();
  await sheet(page).getByLabel('Phone number').fill('1612 345 678');
  await sheet(page).getByRole('button', { name: 'Add staff' }).click();
  await expect(page.getByRole('dialog', { name: 'No seat is free' })).toBeVisible();
});

test('edits a person: their name, cleared or changed, and their roles', async ({ page }) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /Kamal Hossain/ })
    .click();
  await expect(sheet(page).getByLabel('Phone number')).toHaveValue('01611 222 333');
  await expect(sheet(page).getByLabel('Phone number')).toHaveAttribute('readonly', '');
  await expectAccessible(page);
  await sheet(page).getByLabel('Name (optional)').fill('Kamal');
  await sheet(page)
    .getByRole('checkbox', { name: /Stock staff/ })
    .check();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(log.sent('PATCH', '/staff/u-kamal')).toEqual({
    name: 'Kamal',
    roleIds: ['r-billing', 'r-stock'],
  });

  await main(page).getByRole('button', { name: /Kamal/ }).click();
  await sheet(page).getByLabel('Name (optional)').fill('');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  expect((log.sent('PATCH', '/staff/u-kamal') as { name: unknown }).name).toBeNull();
});

test('deactivates after asking, and Keep it changes nothing', async ({ page }) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /Kamal Hossain/ })
    .click();
  await sheet(page)
    .getByRole('button', { name: /^Deactivate/ })
    .click();
  const ask = page.getByRole('dialog', { name: 'Deactivate Kamal Hossain?' });
  await expect(ask).toContainText('They are signed out at once');
  await ask.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(log.calls.some((call) => call.method === 'PATCH')).toBe(false);

  await main(page)
    .getByRole('button', { name: /Kamal Hossain/ })
    .click();
  await sheet(page)
    .getByRole('button', { name: /^Deactivate/ })
    .click();
  await ask.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Kamal Hossain deactivated · a seat is free');
  expect(log.sent('PATCH', '/staff/u-kamal')).toEqual({ active: false });
  await expect(main(page).getByText('1 of 2 seats, owner included')).toBeVisible();
});

test('reactivates when a seat is free, and offers the ways out when none is', async ({ page }) => {
  const log = await open(page, { team: withSeat() });
  await main(page)
    .getByRole('button', { name: /Sabrina/ })
    .click();
  await sheet(page)
    .getByRole('button', { name: /^Reactivate/ })
    .click();
  await expect(page.getByRole('status')).toHaveText('Sabrina reactivated');
  expect(log.sent('PATCH', '/staff/u-sabrina')).toEqual({ active: true });
});

test('reactivating with every seat in use names the person and the ways out', async ({ page }) => {
  const log = await open(page, { money: { usage: { used: { seats: 2 } } } });
  await main(page)
    .getByRole('button', { name: /Sabrina/ })
    .click();
  await sheet(page)
    .getByRole('button', { name: /^Reactivate/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'No seat is free' })).toContainText(
    'Reactivating Sabrina needs a seat: 2 of 2 are in use. Deactivate someone, buy a seat (৳49/month), or move to Growth.',
  );
  expect(log.calls.some((call) => call.method === 'PATCH')).toBe(false);
});

test('a new first password is set and shown once', async ({ page }) => {
  const log = await open(page);
  await main(page)
    .getByRole('button', { name: /Kamal Hossain/ })
    .click();
  await sheet(page)
    .getByRole('button', { name: /^Reset password/ })
    .click();
  await expect(sheet(page).getByRole('heading', { name: 'Reset the password' })).toBeVisible();
  const shown = await sheet(page).getByLabel('First password').inputValue();
  expect(log.sent('POST', '/staff/u-kamal/password')).toEqual({ newPassword: shown });
  await expectAccessible(page);
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('someone who may only see the team sees it, with nothing to change', async ({ page }) => {
  await open(page, { isOwner: false, permissions: ['staff:read'] });
  await expect(main(page).getByText('2 of 2 seats, owner included')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Add staff' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /Kamal Hossain/ })).toHaveCount(0);
  await expect(main(page).getByText('Kamal Hossain')).toBeVisible();
});
