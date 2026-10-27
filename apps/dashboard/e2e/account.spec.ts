import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawnIdentities, OAUTH_PAGE } from './support/account';
import { BILLING_STAFF } from './support/menu';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { typeCode } from './support/onboarding-api';

// TENANT-DASHBOARD-DESIGN §7.17, Slice 11.6: Account -- the person's ways to sign in with each one's action, the
// password, an email added by its code, a provider connected and back, removing one (never the last), language and
// Sign out; and a staff sign-in's own page, its phone and password only (TEN-31). Each test runs on a phone and on a
// desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', identities: drawnIdentities(), ...state });
  await page.goto(`/${SLUG}/account`);
  await expect(
    page.getByRole('heading', { name: /Ways to sign in|Signed in as staff/ }),
  ).toBeVisible();
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

test('shows each way to sign in with its one action, then language and Sign out', async ({
  page,
}) => {
  await open(page);
  await expect(main(page).getByText('+880 1711 234 567')).toBeVisible();
  await expect(main(page).getByText('rumana@gmail.com')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Add email' })).toBeVisible();
  await expect(
    main(page).getByText('If you forget the password, a code goes to this phone.'),
  ).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'English' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectAccessible(page);
  await main(page).getByRole('button', { name: 'বাংলা' }).click();
  await expect(main(page).getByText('লগইনের উপায়')).toBeVisible();
});

test('changes the password once the rules pass and both match', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Change password' }).click();
  await expect(sheet(page).getByRole('link', { name: /Forgot the current one/ })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
  const save = sheet(page).getByRole('button', { name: 'Change password' });
  await sheet(page).getByLabel('Current password').fill('old-pass1');
  await sheet(page).getByLabel('New password').fill('short');
  await expect(save).toBeDisabled();
  await sheet(page).getByLabel('New password').fill('new-pass42');
  await sheet(page).getByLabel('Type it again').fill('new-pass43');
  await expectAccessible(page);
  await save.click();
  await expect(sheet(page).getByText('The two passwords do not match.')).toBeVisible();
  await sheet(page).getByLabel('Type it again').fill('new-pass42');
  await save.click();
  await expect(page.getByRole('status')).toHaveText('Password changed');
  expect(log.sent('POST', '/auth/password')).toEqual({
    currentPassword: 'old-pass1',
    newPassword: 'new-pass42',
  });
});

test('a wrong current password is said, and nothing changes', async ({ page }) => {
  await open(page);
  await main(page).getByRole('button', { name: 'Change password' }).click();
  await sheet(page).getByLabel('Current password').fill('wrong');
  await sheet(page).getByLabel('New password').fill('new-pass42');
  await sheet(page).getByLabel('Type it again').fill('new-pass42');
  await sheet(page).getByRole('button', { name: 'Change password' }).click();
  await expect(sheet(page).getByText('The current password is not right.')).toBeVisible();
});

test('adds an email by the code sent to it', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Add email' }).click();
  await sheet(page).getByLabel('Email').fill('rumana@gmail.com');
  await sheet(page).getByRole('button', { name: 'Send a code' }).click();
  expect(log.sent('POST', '/me/identities/code')).toEqual({
    kind: 'email',
    value: 'rumana@gmail.com',
  });
  await expect(sheet(page).getByText('A 6-digit code was sent to rumana@gmail.com.')).toBeVisible();
  await expect(sheet(page).getByText(/Resend in \d+ seconds/)).toBeVisible();
  await expectAccessible(page);

  await typeCode(page, '000000');
  await sheet(page).getByRole('button', { name: 'Verify' }).click();
  await expect(sheet(page).getByText('That code is not right.')).toBeVisible();
  await page.getByRole('textbox', { name: /1\/6$/ }).click();
  for (let box = 0; box < 6; box += 1) await page.keyboard.press('Backspace');
  await typeCode(page, '482913');
  await sheet(page).getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('status')).toHaveText('Email added · rumana@gmail.com');
  expect(log.sent('POST', '/me/identities/verify')).toEqual({
    kind: 'email',
    value: 'rumana@gmail.com',
    code: '482913',
  });
});

test('removes a way in after asking, keeping the rest', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'Remove' }).click();
  const ask = page.getByRole('dialog', { name: 'Remove Google?' });
  await expect(ask).toContainText('nothing in the shop changes');
  await ask.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('status')).toHaveText('Google removed');
  expect(
    log.calls.some((call) => call.method === 'DELETE' && call.path === '/me/identities/i-3'),
  ).toBe(true);
  await expect(main(page).getByRole('button', { name: 'Connect' })).toHaveCount(2);
});

test('the only way in cannot be removed: add another first', async ({ page }) => {
  const log = await open(page, {
    identities: [{ id: 'i-9', kind: 'email', value: 'only@example.com' }],
  });
  await main(page).getByRole('button', { name: 'Remove' }).click();
  const refused = page.getByRole('dialog', { name: 'This is the only way to sign in' });
  await expect(refused).toBeVisible();
  expect(log.calls.some((call) => call.method === 'DELETE')).toBe(false);
  await refused.getByRole('button', { name: 'Add another first' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Add an email' })).toBeVisible();
});

test('connecting a provider comes back to this shop’s Account, saying so', async ({ page }) => {
  await open(page);
  await main(page).getByRole('button', { name: 'Connect' }).click();
  await expect(page).toHaveURL(new RegExp(`${OAUTH_PAGE}facebook$`));
  // The provider sends the browser back to the callback page, outside any shop.
  await page.goto('/auth/oauth/facebook/callback?code=c&state=s');
  await expect(page).toHaveURL(`/${SLUG}/account`);
  await expect(page.getByRole('status')).toHaveText('Facebook connected');
});

test('a staff sign-in shows its phone and password only, and its own password route', async ({
  page,
}) => {
  const log = await open(page, BILLING_STAFF);
  await expect(
    main(page).getByRole('heading', { name: 'Signed in as staff of Megh Fashion' }),
  ).toBeVisible();
  await expect(main(page).getByText('+880 1611 222 333')).toBeVisible();
  await expect(main(page).getByText('Google', { exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Add email' })).toHaveCount(0);
  // Its own ways in are never read on a staff sign-in (KNOWN-GAPS §96).
  expect(log.calls.some((call) => call.path === '/me/identities')).toBe(false);
  await expectAccessible(page);

  await main(page).getByRole('button', { name: 'Change password' }).click();
  await expect(sheet(page).getByText('Forgot it? Ask the shop owner to reset it.')).toBeVisible();
  await sheet(page).getByLabel('Current password').fill('k7m4-p9qx');
  await sheet(page).getByLabel('New password').fill('kamal-pass7');
  await sheet(page).getByLabel('Type it again').fill('kamal-pass7');
  await sheet(page).getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status')).toHaveText('Password changed');
  expect(log.sent('POST', '/auth/staff/password')).toEqual({
    currentPassword: 'k7m4-p9qx',
    newPassword: 'kamal-pass7',
  });
});
