import { expect, test, type Page } from '@playwright/test';
import { drawnDomain } from './support/domain';
import { mockApi, SLUG, type ShopState } from './support/mock-api';
import { drawnSettings } from './support/settings';

// The owner, 2026-11-26: "the shop name in dashboard must be directed to customer storefront. specially in menu the
// shop name in home". The shop's name and mark open its storefront in a new tab -- the Menu's shop card, the phone's app
// bar on a hub's page, the computer's side column -- with a small ↗; plain text while the storefront is off. Each test
// runs on a phone and on a desktop (playwright.config.ts).

const VIEW_SHOP = /^মেঘ ফ্যাশন: শপ দেখুন$/;

async function open(page: Page, path: string, state: ShopState = {}): Promise<void> {
  await mockApi(page, state);
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByText('মেঘ ফ্যাশন').first()).toBeVisible();
}

test('the shop name opens the storefront in a new tab, wherever it shows', async ({ page }) => {
  await open(page, '/menu');
  const card = page.getByRole('main').getByRole('link', { name: VIEW_SHOP });
  await expect(card).toHaveAttribute('href', 'https://megh.lytro.app');
  await expect(card).toHaveAttribute('target', '_blank');
  await expect(card).toHaveAttribute('rel', 'noopener');
  // Home: on a phone the app bar's name, on a computer the side column's.
  await page.goto(`/${SLUG}`);
  const shown = page.getByRole('link', { name: VIEW_SHOP }).filter({ visible: true });
  await expect(shown.first()).toBeVisible();
  for (const link of await shown.all()) {
    await expect(link).toHaveAttribute('href', 'https://megh.lytro.app');
    await expect(link).toHaveAttribute('target', '_blank');
    // The balance under the name keeps its own tap: it is never inside the link.
    await expect(link.locator('button')).toHaveCount(0);
  }
});

test("the shop's own domain, once it serves, is where the name leads", async ({ page }) => {
  await open(page, '/menu', {
    domain: { allowed: true, domain: drawnDomain('active') },
  });
  await expect(page.getByRole('main').getByRole('link', { name: VIEW_SHOP })).toHaveAttribute(
    'href',
    'https://megh.com',
  );
});

test('with the storefront off, the name stays plain text', async ({ page }) => {
  await open(page, '/menu', {
    settings: { ...drawnSettings('bn'), storefrontEnabled: false },
  });
  await expect(page.getByRole('main').getByText('মেঘ ফ্যাশন')).toBeVisible();
  await expect(page.getByRole('link', { name: VIEW_SHOP })).toHaveCount(0);
});
