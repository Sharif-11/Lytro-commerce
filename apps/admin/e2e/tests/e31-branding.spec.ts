import { expect, test } from '@playwright/test';
import { SMS_LOG_FILE } from '../global-setup';
import { signUpShop } from '../support/api';
import { dashboardUrl, signInTab } from '../support/session';

// P1-E31: two tenants' dashboards open in two tabs of the same browser show their own shop name, not each
// other's, with no refresh needed — DashboardShell's useDocumentTitle keyed off /me's own tenant response.
test('each shop keeps its own branding in its own tab, even side by side', async ({ context }) => {
  const alpha = await signUpShop('localhost', SMS_LOG_FILE, 'Alpha Branding Shop');
  const beta = await signUpShop('localhost', SMS_LOG_FILE, 'Beta Branding Shop');
  const alphaHost = `${alpha.slug}.localhost`;
  const betaHost = `${beta.slug}.localhost`;

  const alphaTab = await context.newPage();
  await signInTab(alphaTab, alphaHost, alpha);
  await alphaTab.goto(dashboardUrl(alphaHost));
  await alphaTab.waitForURL(/\/dashboard$/);

  const betaTab = await context.newPage();
  await signInTab(betaTab, betaHost, beta);
  await betaTab.goto(dashboardUrl(betaHost));
  await betaTab.waitForURL(/\/dashboard$/);

  await expect(alphaTab).toHaveTitle('Alpha Branding Shop');
  await expect(betaTab).toHaveTitle('Beta Branding Shop');

  // Switching focus back to the first tab (no reload) still shows its own title, not whatever the second
  // tab last set — proving nothing shared (like a document.title set via a global) leaked across tabs.
  await alphaTab.bringToFront();
  await expect(alphaTab).toHaveTitle('Alpha Branding Shop');
});
