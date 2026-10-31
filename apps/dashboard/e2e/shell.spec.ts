import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §4 and §9, Slice 11.3: the shell around every screen -- the phone's app bar and tab bar,
// the desktop's rail, header and side column -- with its banners, search, the + menu, what a staff member sees, and
// each shop's own installable app (TEN-17). Each test runs on a phone and on a desktop (playwright.config.ts).

function isPhone(): boolean {
  return test.info().project.name === 'phone';
}

async function open(page: Page, path: string, state: ShopState = {}): Promise<void> {
  await mockApi(page, state);
  await page.goto(`/${SLUG}${path}`);
}

/** The navigation that shows at this size: the tab bar on a phone, the rail on a desktop. */
function hubs(page: Page) {
  return page
    .getByRole('navigation', { name: /^(প্রধান মেনু|Main navigation)$/ })
    .filter({ visible: true });
}

test('frames a screen with the shop, the five hubs, the orders to confirm and the low-stock count', async ({
  page,
}) => {
  await open(page, '/orders');
  const nav = hubs(page);
  await expect(nav.getByRole('link')).toHaveText(['হোম', 'অর্ডার3', 'শপ2', 'টাকা', 'মেনু']);
  await expect(nav.getByRole('link', { name: /^অর্ডার/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /^#261031-0047/ })).toBeVisible();
  if (isPhone()) {
    await expect(page.getByText('মেঘ ফ্যাশন')).toBeVisible();
  } else {
    await expect(page.getByRole('banner').getByRole('heading', { name: 'অর্ডার' })).toBeVisible();
    await expect(page.getByRole('banner').getByText('রু')).toBeVisible();
  }
});

test("goes to a hub's first section and shows its sections, with where you are", async ({
  page,
}) => {
  await open(page, '/orders');
  await hubs(page).getByRole('link', { name: /শপ/ }).click();
  await expect(page).toHaveURL(`/${SLUG}/products`);
  const sections = page
    .getByRole('navigation', { name: 'এই অংশের পাতা' })
    .filter({ visible: true });
  await expect(sections.getByRole('link')).toHaveText([
    'প্রোডাক্ট',
    'ক্যাটাগরি',
    'অ্যাট্রিবিউট',
    'স্টক2',
    'কেনাকাটা',
    'ডেলিভারি',
  ]);
  await expect(sections.getByRole('link', { name: 'প্রোডাক্ট' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await sections.getByRole('link', { name: /স্টক/ }).click();
  await expect(page).toHaveURL(`/${SLUG}/stock`);
  await expect(sections.getByRole('link', { name: /স্টক/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Slice 11.9 built Stock: its own page, where the placeholder was.
  await expect(
    page.getByRole('main').getByRole('searchbox', { name: 'প্রোডাক্ট সার্চ' }),
  ).toBeVisible();
});

test("opens the Menu hub's own page, where the old More address now leads too", async ({
  page,
}) => {
  await open(page, '/orders');
  await hubs(page).getByRole('link', { name: 'মেনু' }).click();
  await expect(page).toHaveURL(`/${SLUG}/menu`);
  await expect(page.getByText('2/2 সিট')).toBeVisible();
  await expect(page.getByRole('button', { name: 'লগআউট' })).toBeVisible();

  await page.goto(`/${SLUG}/more`);
  await expect(page).toHaveURL(`/${SLUG}/menu`);
  await expect(page.getByText('2/2 সিট')).toBeVisible();
});

test('shows a staff member only what their role reaches, and turns a deep link away (STF-11)', async ({
  page,
}) => {
  await open(page, '/orders', { isOwner: false, permissions: ['balance:read'], stock: null });
  // Orders needs orders:read, so the deep link lands on Home with the reason.
  await expect(page).toHaveURL(`/${SLUG}`);
  await expect(page.getByRole('status').getByText('ওই পাতাটা আপনার রোলে নেই।')).toBeVisible();
  await expect(hubs(page).getByRole('link')).toHaveText(['হোম', 'টাকা', 'মেনু']);
  // No search without products to find, and no + without anything to start.
  await expect(page.getByRole('link', { name: 'সার্চ' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'নতুন' })).toHaveCount(0);
});

test("says where the shop stands: its trial, the trial's last days, grace and read-only (§7.20)", async ({
  page,
}) => {
  await open(page, '/orders', { state: 'trial', periodEndDays: 20 });
  await expect(
    page.getByRole('status').filter({ hasText: 'ট্রায়ালের 20 দিন বাকি' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'প্ল্যান দেখুন' })).toHaveAttribute(
    'href',
    `/${SLUG}/plan`,
  );

  await page.unrouteAll();
  await open(page, '/orders', { state: 'trial', periodEndDays: 2 });
  await expect(page.getByRole('alert').filter({ hasText: 'ট্রায়াল 2 দিনে শেষ।' })).toBeVisible();

  await page.unrouteAll();
  await open(page, '/orders', { state: 'grace', periodEndDays: -3 });
  await expect(
    page.getByRole('alert').filter({ hasText: 'প্ল্যান 3 দিন আগে শেষ হয়েছে' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'রিনিউ করুন' })).toBeVisible();

  await page.unrouteAll();
  await open(page, '/orders', { state: 'read_only', periodEndDays: -20 });
  await expect(
    page.getByRole('status').filter({ hasText: 'রিনিউ না করা পর্যন্ত শুধু দেখা যাবে' }),
  ).toBeVisible();
});

test('says when the browser is offline (§9)', async ({ page, context }) => {
  await open(page, '/orders');
  await expect(page.getByRole('link', { name: /^#261031-0047/ })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/^ইন্টারনেট নেই।/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/^ইন্টারনেট নেই।/)).toHaveCount(0);
});

test('opens the + menu with what can be started, and Top up opens the top-up sheet (§4.5)', async ({
  page,
}) => {
  await open(page, '/orders');
  await page.getByRole('button', { name: 'নতুন' }).filter({ visible: true }).click();
  const sheet = page.getByRole('dialog', { name: 'নতুন' });
  await expect(sheet.getByRole('button', { name: 'টপ-আপ' })).toBeVisible();
  await expect(sheet.getByText('ফেজ 4-এ আসছে')).toBeVisible();
  // Slice 11.7a: Add product opens a new product.
  await sheet.getByRole('button', { name: 'প্রোডাক্ট যোগ' }).click();
  await expect(page).toHaveURL(`/${SLUG}/products/new`);
  await page.getByRole('button', { name: 'নতুন' }).filter({ visible: true }).click();
  await sheet.getByRole('button', { name: 'টপ-আপ' }).click();
  await expect(page).toHaveURL(`/${SLUG}/balance?topup=1`);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('searches the products by name, and says when nothing matches (§4.4)', async ({ page }) => {
  if (isPhone()) {
    await open(page, '/orders');
    await page.getByRole('link', { name: 'সার্চ' }).click();
    // The search page's own box: the Orders list has a search of its own (Slice 4.8a).
    await page.getByRole('searchbox', { name: 'সার্চ', exact: true }).fill('জ্যাকেট');
  } else {
    await open(page, '/orders');
    const field = page.getByRole('search').getByRole('searchbox');
    await field.fill('জ্যাকেট');
    await field.press('Enter');
  }
  await expect(page.getByRole('link', { name: /ডেনিম জ্যাকেট/ })).toContainText(
    '4টি ভ্যারিয়েন্ট · জ্যাকেট',
  );
  await expect(page.getByRole('link', { name: /ডেনিম জ্যাকেট/ })).toContainText('৳1,890');
  await expect(page.getByRole('link', { name: /ডেনিম জ্যাকেট/ })).toContainText('স্টক কম');
  await page.getByRole('main').getByRole('searchbox').fill('ঘড়ি');
  await expect(page.getByText('"ঘড়ি" মেলে এমন কোনো প্রোডাক্ট নেই।')).toBeVisible();
});

test("links each shop's own manifest and iPhone icon, so it installs as its own app (TEN-17)", async ({
  page,
}) => {
  await open(page, '/orders');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    `/api/v1/shops/${SLUG}/manifest.webmanifest`,
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    `/api/v1/shops/${SLUG}/icons/apple-180.png`,
  );
});

test('switches to English from the header, and keeps the choice (I18N-01, I18N-02)', async ({
  page,
}) => {
  test.skip(isPhone(), 'the header is the desktop’s; on a phone the language is in Menu');
  await open(page, '/orders');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(hubs(page).getByRole('link')).toHaveText([
    'Home',
    'Orders3',
    'Shop2',
    'Money',
    'Menu',
  ]);
  await page.reload();
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Orders' })).toBeVisible();
});

test('passes an accessibility check on the screens it draws', async ({ page }) => {
  for (const path of ['/orders', '/products', `/search?q=${encodeURIComponent('জ্যাকেট')}`]) {
    await open(page, path);
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map(
        (each) => `${each.id}: ${each.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
    await page.unrouteAll();
  }
});
