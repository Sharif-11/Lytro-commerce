import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  BACKUP_CODE,
  CODE,
  DRAWN_CODES,
  EMAIL,
  mockApi,
  PASSWORD,
  SECRET,
  type ConsoleState,
} from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §2: ADM-01 in one container, with its limit. Each test runs on a phone and on a desktop.

async function open(page: Page, state: ConsoleState = {}) {
  const log = await mockApi(page, { signedIn: false, ...state });
  await page.goto('/sign-in');
  return log;
}

async function credentials(page: Page, password = PASSWORD): Promise<void> {
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('opens on the operator lockup, the form and the sentence that there is no forgotten password', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toBeVisible();
  await expect(page.getByText('OPERATOR', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Lytro' })).toBeVisible();
  await expect(page.getByText(/No "forgot password"\..*ADM-18/)).toBeVisible();
});

test('signs in with a code: two bars, whose account, then the console', async ({ page }) => {
  const log = await open(page);
  await credentials(page);
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await expect(page.getByText(EMAIL)).toBeVisible();
  // A code an app shows with a space still counts.
  await page.getByLabel('Code').fill('481 902');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  expect(log.sent('POST', '/auth/operator/verify')).toEqual({
    email: EMAIL,
    password: PASSWORD,
    code: CODE,
  });
});

test('takes a backup code in the same field, on a keyboard that can type one', async ({ page }) => {
  await open(page);
  await credentials(page);
  const field = page.getByLabel('Code');
  await expect(field).toHaveAttribute('inputmode', 'text');
  await field.fill(BACKUP_CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
});

test('a wrong password says only that the pair is not right, and shows no count', async ({
  page,
}) => {
  await open(page);
  await credentials(page, 'not-the-password');
  await expect(page.locator('label', { hasText: 'Password' }).getByRole('alert')).toHaveText(
    "That email or password isn't right.",
  );
  await expect(page.getByText(/attempts? left/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toBeVisible();
});

test('a wrong code says how many tries are left, and going back keeps the address', async ({
  page,
}) => {
  await open(page);
  await credentials(page);
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByText('That code did not match. 4 attempts left before a 15-minute wait.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use a different account' }).click();
  await expect(page.getByLabel('Email')).toHaveValue(EMAIL);
  await expect(page.getByLabel('Password')).toHaveValue('');
  // The wrong code's words stay behind.
  await expect(page.getByText(/did not match/)).toHaveCount(0);
});

test('the fifth failure locks the account: the wait, an empty password and a disabled button', async ({
  page,
}) => {
  await open(page, { failures: 4 });
  await credentials(page);
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').getByText('Too many failed tries')).toBeVisible();
  await expect(page.getByText(/a right password or code is refused too/)).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveValue('');
  await expect(page.getByLabel('Email')).toHaveValue(EMAIL);
  await expect(page.getByRole('button', { name: 'Try again in 15 minutes' })).toBeDisabled();
});

test('a locked account is refused the right password too, and another address may still try', async ({
  page,
}) => {
  const log = await open(page, { failures: 5 });
  await credentials(page);
  await expect(page.getByRole('button', { name: 'Try again in 15 minutes' })).toBeDisabled();
  expect(log.calls.filter((call) => call.path === '/auth/operator/verify')).toHaveLength(0);
  await expect(page.getByLabel('Password')).toHaveValue('');
  await page.getByLabel('Email').fill('another@lytro.app');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await expect(page.getByText('Too many failed tries')).toHaveCount(0);
});

test('a lock ends when the server says it does', async ({ page }) => {
  await page.clock.install();
  const log = await open(page, { failures: 5 });
  await credentials(page);
  await expect(page.getByRole('button', { name: 'Try again in 15 minutes' })).toBeDisabled();
  log.state.failures = 0;
  await page.clock.runFor(15 * 60 * 1000);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await expect(page.getByText('Too many failed tries')).toHaveCount(0);
});

test('a first sign-in enrols: the QR, the key in fours, a code, then the ten codes once', async ({
  page,
}) => {
  await open(page, { enrolled: false });
  await credentials(page);
  await expect(page.getByRole('heading', { name: 'Set up two-factor sign-in' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Authenticator QR code' })).toBeVisible();
  await expect(page.getByText('JBSW Y3DP EHPK 3PXP 7KQ2 JBSW Y3DP EHPK')).toBeVisible();
  await expect(page.getByLabel('Code')).toHaveAttribute('inputmode', 'numeric');

  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Confirm and enable' }).click();
  await expect(page.getByText("That code isn't right.")).toBeVisible();

  await page.getByLabel('Code').fill(CODE);
  await page.getByRole('button', { name: 'Confirm and enable' }).click();
  await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveText(DRAWN_CODES);
  await expect(page.getByRole('button', { name: 'Copy all' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download .txt' })).toBeVisible();
  await page.getByRole('button', { name: 'I have saved these' }).click();
  await expect(page).toHaveURL('/');
});

test('copies the whole key, without the spaces it is shown with', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, { enrolled: false });
  await credentials(page);
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SECRET);
});

test('in Bangla, the screen and the server both speak it', async ({ page }) => {
  const log = await open(page, { language: 'bn' });
  await expect(page.getByRole('heading', { name: 'অপারেটর লগইন' })).toBeVisible();
  await page.getByLabel('ইমেইল').fill(EMAIL);
  await page.getByLabel('পাসওয়ার্ড').fill('not-the-password');
  await page.getByRole('button', { name: 'এগিয়ে যান' }).click();
  await expect(page.getByText('ইমেইল বা পাসওয়ার্ড মেলেনি।')).toBeVisible();
  expect(log.calls.at(-1)?.language).toBe('bn');
});

test('a signed-in operator skips sign-in', async ({ page }) => {
  await mockApi(page);
  await page.goto('/sign-in');
  await expect(page).toHaveURL('/');
});

test('has no accessibility problems at any step', async ({ page }) => {
  await open(page, { enrolled: false });
  const check = async () => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
  };
  await check();
  await credentials(page);
  await expect(page.getByRole('img', { name: 'Authenticator QR code' })).toBeVisible();
  await check();
  await page.getByLabel('Code').fill(CODE);
  await page.getByRole('button', { name: 'Confirm and enable' }).click();
  await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible();
  await check();
});
