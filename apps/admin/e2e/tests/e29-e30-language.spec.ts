import { expect, test } from '@playwright/test';
import { SMS_LOG_FILE } from '../global-setup';
import { signUpShop } from '../support/api';
import { dashboardUrl, signInTab } from '../support/session';

// P1-E29, P1-E30: Bangla by default, the toggle actually flips document.documentElement.lang (what every
// i18next-driven label reads from), the choice survives a reload, and does not follow to a different
// device/browser — localStorage-scoped, per D31 (the test plan's own P1-E30 note explains the revision).
test('defaults to Bangla, the toggle switches to English and survives reload on this device', async ({
  page,
}) => {
  const shop = await signUpShop('localhost', SMS_LOG_FILE, 'Language Test Shop');
  const host = `${shop.slug}.localhost`;
  await signInTab(page, host, shop);
  await page.goto(dashboardUrl(host));
  await page.waitForURL(/\/dashboard$/);

  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');

  const toggle = page.locator('button').filter({ hasText: 'EN' }).first();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test("a different browser context (a different device) is not handed the first one's choice", async ({
  browser,
}) => {
  const shop = await signUpShop('localhost', SMS_LOG_FILE, 'Language Test Shop Two');
  const host = `${shop.slug}.localhost`;

  const firstDevice = await browser.newContext();
  const firstPage = await firstDevice.newPage();
  await signInTab(firstPage, host, shop);
  await firstPage.goto(dashboardUrl(host));
  await firstPage.waitForURL(/\/dashboard$/);
  await firstPage.locator('button').filter({ hasText: 'EN' }).first().click();
  await expect(firstPage.locator('html')).toHaveAttribute('lang', 'en');
  await firstDevice.close();

  const secondDevice = await browser.newContext();
  const secondPage = await secondDevice.newPage();
  await signInTab(secondPage, host, shop);
  await secondPage.goto(dashboardUrl(host));
  await secondPage.waitForURL(/\/dashboard$/);
  await expect(secondPage.locator('html')).toHaveAttribute('lang', 'bn');
  await secondDevice.close();
});
