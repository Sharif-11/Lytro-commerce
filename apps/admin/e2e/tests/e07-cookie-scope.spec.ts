import { expect, test } from '@playwright/test';
import { SMS_LOG_FILE } from '../global-setup';
import { E2E_PASSWORD, signUpShop } from '../support/api';
import { PROXY_PORT } from '../support/ports';

// P1-E07: a session cookie is scoped to its exact host, as the browser itself enforces it — the one thing
// an API-level test cannot stand in for, since supertest never has a real cookie jar honoring Domain/Path.
test('the session cookie is scoped to its exact host, never shared across shop subdomains', async ({
  page,
  context,
}) => {
  const alpha = await signUpShop('localhost', SMS_LOG_FILE, 'Alpha Shop');
  const beta = await signUpShop('localhost', SMS_LOG_FILE, 'Beta Shop');

  await page.goto(`http://${alpha.slug}.localhost:${String(PROXY_PORT)}/sign-in`);
  await page.locator('form button[type="button"]').click(); // switch from code to password mode
  await page.locator('input[name="phone"]').fill(alpha.phone);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === 'lytronix_session');
  expect(session).toBeDefined();
  // Exactly the host that set it — no leading dot (which would mean a shared, subdomain-wide cookie).
  expect(session?.domain).toBe(`${alpha.slug}.localhost`);
  expect(session?.httpOnly).toBe(true);

  // The same browser, a different shop's subdomain: alpha's cookie never crosses, so this is a fresh,
  // signed-out visit — the sign-in page, not beta's dashboard.
  await page.goto(`http://${beta.slug}.localhost:${String(PROXY_PORT)}/dashboard`);
  await expect(page.locator('input[name="phone"]')).toBeVisible();
  await expect(page).not.toHaveURL(/\/dashboard$/);
});
