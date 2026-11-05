import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { CODE, DRAWN_CODES, EMAIL, mockApi, PASSWORD, type ConsoleState } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §12: the backup codes and this session.

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, state);
  await page.goto('/account');
  return log;
}

async function openPanel(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Generate new codes' }).click();
  return page.getByRole('dialog', { name: 'New backup codes' });
}

async function send(panel: Locator, password: string, code: string): Promise<void> {
  await panel.getByLabel('Password').fill(password);
  await panel.getByLabel('Fresh authenticator code').fill(code);
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
}

test('shows how many codes are unused, this session and the break-glass sentence', async ({
  page,
}) => {
  await open(page, { unusedBackupCodes: 7 });
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByText(/^7 of 10 unused\./)).toBeVisible();
  await expect(page.getByText('Signed in 21 Oct, 09:12 · Chrome · Windows')).toBeVisible();
  await expect(page.getByRole('main').getByText(EMAIL)).toBeVisible();
  await expect(page.getByText(/break-glass action on the database.*ADM-18/)).toBeVisible();
});

test('says only when it was signed in, when the browser is unknown', async ({ page }) => {
  await open(page, { userAgent: null });
  await expect(page.getByText('Signed in 21 Oct, 09:12', { exact: true })).toBeVisible();
});

test('generates new codes with the password and a code, then shows them once', async ({ page }) => {
  const log = await open(page);
  const panel = await openPanel(page);
  await expect(
    panel.getByText('The ten current codes stop working the moment these are made.'),
  ).toBeVisible();
  await expect(panel.getByLabel('Password')).toBeFocused();
  await send(panel, PASSWORD, '481 902');

  const codes = page.getByRole('dialog', { name: 'Backup codes' });
  await expect(codes.getByText('The old codes no longer work. Save these.')).toBeVisible();
  await expect(codes.getByRole('listitem')).toHaveText(DRAWN_CODES);
  expect(log.sent('POST', '/auth/operator/backup-codes/regenerate')).toEqual({
    password: PASSWORD,
    code: CODE,
  });

  // Nothing can show them again, so Escape leaves them there.
  await page.keyboard.press('Escape');
  await expect(codes).toBeVisible();

  await codes.getByRole('button', { name: 'I have saved these' }).click();
  await expect(codes).toBeHidden();
  // The count follows.
  await expect(page.getByText(/^10 of 10 unused\./)).toBeVisible();
});

test('a mistyped code keeps the operator signed in, and says the tries left under it', async ({
  page,
}) => {
  await open(page);
  const panel = await openPanel(page);
  await send(panel, PASSWORD, '000000');
  await expect(
    panel.locator('label', { hasText: 'Fresh authenticator code' }).getByRole('alert'),
  ).toHaveText('That code did not match. 4 attempts left before a 15-minute wait.');
  await expect(page).toHaveURL('/account');
  expect(await page.evaluate(() => sessionStorage.getItem('lytro.operator.csrf'))).toBe('csrf-e2e');
});

test('a mistyped password keeps the operator signed in, and says so under it', async ({ page }) => {
  await open(page);
  const panel = await openPanel(page);
  await send(panel, 'not-the-password', CODE);
  await expect(panel.locator('label', { hasText: 'Password' }).getByRole('alert')).toHaveText(
    "That email or password isn't right.",
  );
  await expect(page).toHaveURL('/account');
});

test('a locked account says so in the panel, and stays signed in', async ({ page }) => {
  await open(page, { failures: 5 });
  const panel = await openPanel(page);
  await send(panel, PASSWORD, CODE);
  await expect(
    panel.getByRole('alert').getByText('Too many failed sign-ins. Wait before trying again.'),
  ).toBeVisible();
  await expect(page).toHaveURL('/account');
});

test('Cancel, Escape and a tap outside close the form, which then starts empty', async ({
  page,
}) => {
  await open(page);
  let panel = await openPanel(page);
  await panel.getByLabel('Password').fill('half-typed');
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();

  panel = await openPanel(page);
  await expect(panel.getByLabel('Password')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  panel = await openPanel(page);
  await page.mouse.click(5, 5);
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL('/account');
});

test('a failed read says nothing was changed, and its retry works', async ({ page }) => {
  const log = await open(page, { meFails: 503 });
  await expect(page.getByText('The server did not answer')).toBeVisible();
  await expect(page.getByText('Nothing was changed.', { exact: false })).toBeVisible();
  log.state.meFails = null;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(/^7 of 10 unused\./)).toBeVisible();
  await expect(page.getByText('The server did not answer')).toHaveCount(0);
});

test('signs out from the session card, and switches the language', async ({ page }) => {
  await open(page);
  await page.getByRole('main').getByRole('button', { name: 'বাংলা' }).click();
  await expect(page.getByRole('heading', { name: 'অ্যাকাউন্ট' })).toBeVisible();
  await expect(page.getByText(/^১০টির 7টি অব্যবহৃত।/)).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'সাইন আউট' }).click();
  await expect(page).toHaveURL('/sign-in');
});

test('has no accessibility problems, with the panel open or closed', async ({ page }) => {
  await open(page);
  await expect(page.getByText(/^7 of 10 unused\./)).toBeVisible();
  let found = await new AxeBuilder({ page }).analyze();
  expect(found.violations.map((violation) => violation.id)).toEqual([]);
  await openPanel(page);
  found = await new AxeBuilder({ page }).analyze();
  expect(found.violations.map((violation) => violation.id)).toEqual([]);
});
