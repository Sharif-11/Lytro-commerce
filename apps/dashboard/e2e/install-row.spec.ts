import { expect, test, type Page } from '@playwright/test';
import { DAY_ONE, mockApi, SLUG, type ShopState } from './support/mock-api';
import {
  BILLING_STAFF,
  inFacebookOnAndroid,
  inFacebookOnAnIphone,
  offerInstall,
  onAndroid,
  onAnIphone,
} from './support/menu';

// TENANT-DASHBOARD-DESIGN §7.1a (the sketch's `app-first*` and `app-home*`, approved by the owner 2026-11-26): the app
// offered the moment the shop is made, in one row on top of the first landing and of Home, its one action following the
// browser; and AUTH-12 amended: someone still signed in who opens the entry screen goes to their shop.

async function open(page: Page, path: string, state: ShopState = {}): Promise<void> {
  await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  await expect(page.getByRole('main').getByRole('heading').first()).toBeAttached();
}

const main = (page: Page) => page.getByRole('main');
const row = (page: Page) => main(page).getByText('Install the app', { exact: true });
const welcome = (page: Page) =>
  main(page).getByText('Your shop is ready! Add your first product, then share its link.');

test.describe('on a phone', () => {
  test.skip(
    ({ isMobile }) => !isMobile,
    'the row is a phone’s; a computer installs from its address bar',
  );

  test("app-first: where Chrome offers it, Install sits above the welcome and opens the browser's dialog", async ({
    page,
  }) => {
    await open(page, '/products/new?first=1', DAY_ONE);
    await expect(welcome(page)).toBeVisible();
    await expect(row(page)).toHaveCount(0);
    await offerInstall(page);
    await expect(row(page)).toBeVisible();
    // Above the welcome line, the first thing on the page.
    const rowTop = (await row(page).boundingBox())?.y ?? Infinity;
    const welcomeTop = (await welcome(page).boundingBox())?.y ?? -Infinity;
    expect(rowTop).toBeLessThan(welcomeTop);

    await main(page).getByRole('button', { name: 'Install', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset['prompted'])).toBe('yes');
    await expect(row(page)).toHaveCount(0);
    await expect(welcome(page)).toBeVisible();
  });

  test("app-first-fb: Facebook's own browser on Android opens the shop's Home in Chrome", async ({
    page,
  }) => {
    await inFacebookOnAndroid(page);
    await open(page, '/products/new?first=1', DAY_ONE);
    await expect(row(page)).toBeVisible();
    const link = main(page).getByRole('link', { name: 'Open in Chrome' });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href')) ?? '';
    const host = new URL(page.url()).host;
    expect(href).toBe(
      `intent://${host}/${SLUG}#Intent;scheme=http;package=com.android.chrome;` +
        `S.browser_fallback_url=${encodeURIComponent(`http://${host}/${SLUG}`)};end`,
    );
    await expect(main(page).getByRole('button', { name: 'Install', exact: true })).toHaveCount(0);
  });

  test("app-first-ios: an iPhone gets Apple's two taps, no button; closed, the row stays away on this device", async ({
    page,
  }) => {
    await onAnIphone(page);
    await open(page, '/products/new?first=1', DAY_ONE);
    await expect(row(page)).toBeVisible();
    await expect(main(page).getByText('Share → Add to Home Screen', { exact: true })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Install', exact: true })).toHaveCount(0);

    await main(page).getByRole('button', { name: 'Not now' }).click();
    await expect(row(page)).toHaveCount(0);
    // The welcome's own Later is still there, and Home doesn't bring the row back.
    await main(page).getByRole('button', { name: 'Later' }).click();
    await expect(page).toHaveURL(`/${SLUG}`);
    await expect(main(page).getByText('Add your first product').first()).toBeVisible();
    await expect(row(page)).toHaveCount(0);
  });

  test("app-first-ios-fb: Facebook's browser on an iPhone says Safari first", async ({ page }) => {
    await inFacebookOnAnIphone(page);
    await open(page, '/products/new?first=1', DAY_ONE);
    await expect(
      main(page).getByText('⋯ → Open in Safari → Share → Add to Home Screen', { exact: true }),
    ).toBeVisible();
  });

  test('app-home: Home offers it to the owner, by the ⋮ menu before Chrome offers; never to staff', async ({
    page,
  }) => {
    await onAndroid(page);
    await open(page, '', DAY_ONE);
    await expect(row(page)).toBeVisible();
    await expect(
      main(page).getByText('⋮ → Install app / Add to Home screen', { exact: true }),
    ).toBeVisible();
    // The first landing without ?first=1 (a later visit) doesn't show it: only Home does.
    await page.goto(`/${SLUG}/products/new`);
    await expect(main(page).getByLabel('Name', { exact: true })).toBeVisible();
    await expect(row(page)).toHaveCount(0);
  });

  test('a staff member is never offered it on Home', async ({ page }) => {
    await onAndroid(page);
    await open(page, '', BILLING_STAFF);
    await expect(main(page).getByRole('heading').first()).toBeVisible();
    await expect(row(page)).toHaveCount(0);
  });

  test('a browser that is neither a phone nor offering shows nothing', async ({ page }) => {
    await open(page, '/products/new?first=1', DAY_ONE);
    await expect(welcome(page)).toBeVisible();
    await expect(row(page)).toHaveCount(0);
  });
});

test('on a computer the row stays hidden, even where the browser offers to install', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'a computer’s');
  await open(page, '/products/new?first=1', DAY_ONE);
  await offerInstall(page);
  await expect(welcome(page)).toBeVisible();
  await expect(row(page)).toBeHidden();
});

test.describe('the entry screen, signed in (AUTH-12 amended)', () => {
  test("goes to the shop from lytro.app's sign-in and open-a-shop links", async ({ page }) => {
    await mockApi(page, { language: 'en' });
    await page.goto('/sign-in?mode=password');
    await expect(page).toHaveURL(`/${SLUG}`);
    await page.goto('/sign-in');
    await expect(page).toHaveURL(`/${SLUG}`);
  });

  test('keeps a plan picked on pricing on the entry screen', async ({ page }) => {
    await mockApi(page, { language: 'en' });
    const plan = '/sign-in?planId=e9a70aba-078f-4df0-a507-d53a5b8cb810';
    await page.goto(plan);
    await expect(page).toHaveURL(plan);
  });

  test('shows the entry screen to someone signed out', async ({ page }) => {
    await mockApi(page, { language: 'en', ownToken: false });
    await page.goto('/sign-in');
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByLabel('Phone number').first()).toBeVisible();
  });
});
