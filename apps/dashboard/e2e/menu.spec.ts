import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BILLING_STAFF, offerInstall, onAnIphone } from './support/menu';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';

// TENANT-DASHBOARD-DESIGN §7.18, Slice 11.6: the Menu hub's own page -- the shop with the person's role and name, the
// sections their permissions open, Account, Language, Help and Sign out, and installing the app (TEN-17). Each test
// runs on a phone and on a desktop (playwright.config.ts).

async function open(page: Page, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, state);
  await page.goto(`/${SLUG}/menu`);
  await expect(page.getByRole('heading', { name: 'মেনু' })).toBeVisible();
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
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

test('the owner sees the shop, every section, and the rows for themselves', async ({ page }) => {
  await open(page);
  await expect(main(page).getByText('megh.lytro.app · মালিক · রুমানা')).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^টিম/ })).toHaveAttribute(
    'href',
    `/${SLUG}/team`,
  );
  await expect(main(page).getByRole('link', { name: /^টিম/ })).toContainText('2/2 সিট');
  await expect(main(page).getByRole('link', { name: /^অ্যাক্টিভিটি/ })).toHaveAttribute(
    'href',
    `/${SLUG}/activity`,
  );
  await expect(main(page).getByRole('link', { name: /^সেটিংস/ })).toHaveAttribute(
    'href',
    `/${SLUG}/settings`,
  );
  await expect(main(page).getByRole('link', { name: /^অ্যাকাউন্ট/ })).toHaveAttribute(
    'href',
    `/${SLUG}/account`,
  );
  // Help opens the support chat the deployment names (CI builds with a test number).
  await expect(main(page).getByRole('link', { name: /^হেল্প/ })).toHaveAttribute(
    'href',
    'https://wa.me/8801000000000',
  );
  await expect(main(page).getByText('Powered by Lytro')).toBeVisible();
  await expectAccessible(page);
});

test('a staff member sees their role and name, and only the sections their role opens', async ({
  page,
}) => {
  const log = await open(page, BILLING_STAFF);
  await expect(main(page).getByText('megh.lytro.app · বিলিং স্টাফ · কামাল')).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^অ্যাক্টিভিটি/ })).toBeVisible();
  // STF-11: hidden, never disabled.
  await expect(main(page).getByRole('link', { name: /^টিম/ })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /^সেটিংস/ })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /^অ্যাকাউন্ট/ })).toBeVisible();
  // The team's seats are read only by someone who may see the team.
  expect(log.calls.some((call) => call.path === '/staff')).toBe(false);
  await expectAccessible(page);
});

test('a staff member with no role named is shown as staff', async ({ page }) => {
  await open(page, { ...BILLING_STAFF, roles: [] });
  await expect(main(page).getByText('megh.lytro.app · স্টাফ · কামাল')).toBeVisible();
});

test('Language switches the dashboard to the other language at once', async ({ page }) => {
  await open(page);
  await main(page).getByRole('button', { name: /^ভাষা/ }).click();
  await expect(page.getByRole('heading', { name: 'Menu' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Language/ })).toContainText('English');
  // The words change; the person's own name stays as written.
  await expect(main(page).getByText('megh.lytro.app · Owner · রুমানা')).toBeVisible();
});

test('Sign out ends the session and opens the sign-in page', async ({ page }) => {
  const log = await open(page);
  await main(page).getByRole('button', { name: 'লগআউট' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(log.calls.some((call) => call.method === 'POST' && call.path === '/auth/signout')).toBe(
    true,
  );
});

test.describe('installing the app (TEN-17)', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'The install card is a phone’s: a desktop installs from the address bar.');
  });

  test('the browser’s offer shows the card, and Install opens its dialog', async ({ page }) => {
    await open(page);
    await expect(main(page).getByText('মেঘ ফ্যাশন ফোনে ইনস্টল করুন')).toHaveCount(0);
    await offerInstall(page);
    await expect(main(page).getByText('মেঘ ফ্যাশন ফোনে ইনস্টল করুন')).toBeVisible();
    await expectAccessible(page);
    await main(page).getByRole('button', { name: 'ইনস্টল' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-prompted', 'yes');
    // The offer is spent: the card goes.
    await expect(main(page).getByText('মেঘ ফ্যাশন ফোনে ইনস্টল করুন')).toHaveCount(0);
  });

  test('on an iPhone, which offers no install, the card says how', async ({ page }) => {
    await onAnIphone(page);
    await open(page);
    await expect(main(page).getByText('মেঘ ফ্যাশন আইফোনের হোম স্ক্রিনে রাখুন')).toBeVisible();
    await expect(main(page).getByText(/Share-এ ট্যাপ করে Add to Home Screen/)).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'ইনস্টল' })).toHaveCount(0);
  });
});
