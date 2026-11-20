import { expect, test, type Page } from '@playwright/test';
import { mockOnboarding } from './support/onboarding-api';

// SUP-08, SMS-11, AUTH-09 as amended 2026-11-20 (the owner's "Raise them + bot check"): every form that texts a code
// carries Cloudflare's Turnstile token, one per request. Cloudflare's script is the stub (support/turnstile-stub.ts);
// CI builds the dashboard with Cloudflare's always-passes test site key, so the widget is drawn. A build without a site
// key draws none, and these tests have nothing to check there.

const PHONE = '+8801711234567';
const TEST_SITE_KEY = '1x00000000000000000000AA';

/** Whether this build draws the widget, once the form is on the page. */
async function widgetDrawn(page: Page): Promise<boolean> {
  await page.getByLabel('Phone number').waitFor();
  return (await page.getByTestId('human-check').count()) > 0;
}

async function rendered(page: Page): Promise<unknown> {
  return page.evaluate(
    () => (window as unknown as { __turnstileRendered?: unknown }).__turnstileRendered,
  );
}

test('sign-up by code sends the widget’s token, drawn out of the form’s way', async ({ page }) => {
  const log = await mockOnboarding(page, { language: 'en' });
  await page.goto('/sign-in');
  test.skip(
    !(await widgetDrawn(page)),
    'built without VITE_TURNSTILE_SITE_KEY (CI sets the test key)',
  );

  await expect
    .poll(() => rendered(page))
    .toEqual([{ sitekey: TEST_SITE_KEY, action: 'signin', appearance: 'interaction-only' }]);
  // Out of the form's flow until Cloudflare wants a tap: the screen is as drawn.
  await expect(page.getByTestId('human-check')).toHaveClass('absolute');

  await page.getByLabel('Phone number').fill('1711234567');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/verify-code/);
  expect(log.sent('POST', '/auth/phone/code')).toEqual({
    phone: PHONE,
    turnstileToken: 'stub-token-1',
  });
});

test('a reset sends the reset widget’s token', async ({ page }) => {
  const log = await mockOnboarding(page, { language: 'en' });
  await page.goto('/forgot-password');
  test.skip(
    !(await widgetDrawn(page)),
    'built without VITE_TURNSTILE_SITE_KEY (CI sets the test key)',
  );

  await expect
    .poll(() => rendered(page))
    .toEqual([{ sitekey: TEST_SITE_KEY, action: 'reset', appearance: 'interaction-only' }]);
  await page.getByLabel('Phone number').fill('1711234567');
  await page.getByRole('button', { name: 'Send the reset code' }).click();
  await expect(page).toHaveURL(/\/forgot-password\/verify/);
  expect(log.sent('POST', '/auth/forgot-password')).toEqual({
    phone: PHONE,
    turnstileToken: 'stub-token-1',
  });
});

test('when Cloudflare wants a tap, the widget shows in the form and the code waits for it', async ({
  page,
}) => {
  const log = await mockOnboarding(page, { language: 'en' });
  await page.addInitScript(() => {
    (window as unknown as { __turnstileTap: boolean }).__turnstileTap = true;
  });
  await page.goto('/sign-in');
  test.skip(
    !(await widgetDrawn(page)),
    'built without VITE_TURNSTILE_SITE_KEY (CI sets the test key)',
  );

  const tap = page.getByRole('button', { name: 'Verify you are human' });
  await expect(tap).toBeVisible();
  await expect(page.getByTestId('human-check')).not.toHaveClass('absolute');

  await page.getByLabel('Phone number').fill('1711234567');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  // Nothing is sent until the tap.
  await expect(page).toHaveURL(/\/sign-in/);
  expect(log.calls.filter((call) => call.path === '/auth/phone/code')).toHaveLength(0);

  await tap.click();
  await expect(page).toHaveURL(/\/verify-code/);
  expect(log.sent('POST', '/auth/phone/code')).toEqual({
    phone: PHONE,
    turnstileToken: 'stub-token-1',
  });
});
