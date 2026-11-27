import { expect, test, type Page, type Route } from '@playwright/test';
import { envelope, mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { mockOnboarding } from './support/onboarding-api';

// Fixes · UI/UX batch 2 (docs/brand/lytro-dashboard.html, "Fixes · UI/UX batch 2 (sketch)"): the offline state (1.1), the
// fixed tab bar (1.2), toasts (1.4), loading, sign-in's two doors and the password with no Skip (1.5), set-up's one
// question (1.6), the shop's WhatsApp, Messenger and Facebook page (2.1), top-up's amounts (4.1, 4.4), any number of an
// add-on (4.2), the plan cards (4.3, 5.1, 5.2) and Plan, Billing and Usage on the Menu (5.3). Each test runs on a phone
// and on a desktop (playwright.config.ts) against the mocked API.

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

function main(page: Page) {
  return page.getByRole('main');
}

/** Holds a request until `release` is called, then lets the mocked API answer it. */
async function hold(page: Page, pathname: string): Promise<() => void> {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === pathname,
    async (route: Route) => {
      await gate;
      await route.fallback();
    },
  );
  return () => {
    release();
  };
}

test('1.1: offline, a bar under the app bar and Save waiting with what was typed; then back online', async ({
  page,
  context,
}, info) => {
  await open(page, '/settings/shop');
  await expect(page.getByLabel('Shop name')).not.toHaveValue('');
  await page.getByLabel('Shop name').fill('Megh Fashion House');
  await context.setOffline(true);
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing what was already loaded' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'No internet' }).first()).toBeDisabled();
  if (info.project.name === 'phone') {
    await expect(page.getByText('What you typed is still on this page.')).toBeVisible();
  }
  await expect(page.getByLabel('Shop name')).toHaveValue('Megh Fashion House');
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Back online' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' }).first()).toBeEnabled();
});

test('loading: the orders list shimmers under its real tabs, says so after 8 s, and turns offline', async ({
  page,
  context,
}) => {
  await page.clock.install();
  await mockApi(page, { language: 'en' });
  const release = await hold(page, '/api/v1/orders');
  await page.goto(`/${SLUG}/orders`);
  await expect(main(page).getByRole('status', { name: 'Loading' }).first()).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Processing/ })).toBeVisible();
  await page.clock.runFor(8100);
  await expect(main(page).getByText('Taking a little longer…')).toBeVisible();
  await context.setOffline(true);
  await expect(
    main(page).getByText("This page hasn't loaded yet.", { exact: false }),
  ).toBeVisible();
  await expect(main(page).getByText('Taking a little longer…')).toHaveCount(0);
  await context.setOffline(false);
  release();
  await expect(main(page).getByRole('status', { name: 'Loading' })).toHaveCount(0);
});

test('loading: an order and Home show their known headings with shimmering figures', async ({
  page,
}) => {
  await mockApi(page, { language: 'en' });
  const releaseHome = await hold(page, '/api/v1/home');
  await page.goto(`/${SLUG}`);
  await expect(main(page).getByText('Right now')).toBeVisible();
  await expect(main(page).getByRole('status', { name: 'Loading' }).first()).toBeVisible();
  releaseHome();
  await expect(main(page).getByRole('status', { name: 'Loading' })).toHaveCount(0);
});

test('1.2: the tab bar stays at the foot of a phone screen however far a long page scrolls', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'the tab bar is a phone and tablet part');
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await open(page, '/orders');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    const before = await nav.boundingBox();
    await main(page).evaluate((element) => {
      element.scrollTo(0, element.scrollHeight);
      window.scrollTo(0, document.body.scrollHeight);
    });
    const after = await nav.boundingBox();
    expect(Math.round((before?.y ?? 0) + (before?.height ?? 0))).toBe(740);
    expect(Math.round((after?.y ?? 0) + (after?.height ?? 0))).toBe(740);
  }
});

test('1.4: a toast sits above the action bar on a phone, at the bottom right on a desktop', async ({
  page,
}, info) => {
  await open(page, '/settings/shop');
  await expect(page.getByLabel('Shop name')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Save' }).first().click();
  const toast = page.getByRole('status').filter({ hasText: /^Saved/ });
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox();
  if (info.project.name === 'phone') {
    const bar = await page.locator('[data-action-bar]').boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(bar?.y ?? 0);
  } else {
    expect(Math.round(box?.width ?? 0)).toBe(380);
    expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(1440 - 32);
  }
});

test('1.5: /sign-in opens on the code; the dashboard opened signed out asks for the password', async ({
  page,
}) => {
  await mockOnboarding(page, {});
  await page.goto('/sign-in');
  await expect(page.getByLabel('পাসওয়ার্ড')).toHaveCount(0);
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in?mode=password');
  await expect(page.getByLabel('পাসওয়ার্ড')).toBeVisible();
  await page.goto(`/${SLUG}/orders`);
  await expect(page).toHaveURL(`/sign-in?shop=${SLUG}&mode=password`);
  await expect(page.getByLabel('পাসওয়ার্ড')).toBeVisible();
});

test('1.5: a new owner sets a password with no Skip', async ({ page }) => {
  await mockOnboarding(page, { signedIn: true, hasShop: true });
  await page.goto('/set-password?required=false');
  await expect(
    page.getByText('এরপর থেকে এই পাসওয়ার্ড দিয়েই লগইন করবেন, SMS কোড লাগবে না।'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'পাসওয়ার্ড সেভ করুন' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'এখন বাদ দিন' })).toHaveCount(0);
});

test('1.6: set-up asks only the shop type, and saves only that', async ({ page }) => {
  const log = await mockOnboarding(page, { signedIn: true, hasShop: true });
  await page.goto('/set-up');
  await expect(page.getByText('একটা প্রশ্ন। চাইলে এখন স্কিপ করে পরে বদলাতে পারবেন।')).toBeVisible();
  await expect(page.getByRole('button', { name: 'সিটি বা জেলা সার্চ করুন' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'এখন বাদ দিন' })).toBeVisible();
  await page.getByRole('button', { name: 'পোশাক' }).click();
  await page.getByRole('button', { name: 'সেভ করে ড্যাশবোর্ডে যান' }).click();
  await expect(page).toHaveURL(`/${SLUG}`);
  expect(log.sent('PUT', '/business-type')).toEqual({ businessType: 'clothing' });
  expect(log.sent('PUT', '/delivery-zones/home-area')).toBeUndefined();
});

test("2.1: the shop's WhatsApp, Messenger and Facebook page, each refused in its own words", async ({
  page,
}) => {
  const log = await open(page, '/settings/shop');
  await expect(page.getByLabel('Shop name')).not.toHaveValue('');
  await expect(
    page.getByText('Customers can message this number on WhatsApp from your storefront.'),
  ).toBeVisible();
  await page.getByLabel('WhatsApp number').fill('1711 23');
  await page.getByLabel('Messenger link or username').fill('megh fashion!');
  await page.getByLabel('Facebook page link').fill('meghfashion.com');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Enter an 11-digit mobile number starting with 01.')).toBeVisible();
  await expect(
    page.getByText("Enter the page's username or its m.me link, such as m.me/meghfashion."),
  ).toBeVisible();
  await expect(
    page.getByText('Enter a facebook.com page link, such as facebook.com/meghfashion.'),
  ).toBeVisible();
  expect(log.sent('PATCH', '/shop-settings')).toBeUndefined();

  await page.getByLabel('WhatsApp number').fill('1711 234 567');
  // A pasted link turns into the name it holds when the box is left, beside its "m.me/" (the owner, 2026-11-27); a
  // page with no username keeps its id.
  const messenger = page.getByLabel('Messenger link or username');
  await messenger.fill('https://www.facebook.com/profile.php?id=61596608640202&mibextid=LQQJ4d');
  await messenger.blur();
  await expect(messenger).toHaveValue('61596608640202');
  await messenger.fill('https://m.me/meghfashion');
  await messenger.blur();
  await expect(messenger).toHaveValue('meghfashion');
  await page.getByLabel('Facebook page link').fill('facebook.com/meghfashion');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
  expect(log.sent('PATCH', '/shop-settings')).toMatchObject({
    whatsapp: '+8801711234567',
    messenger: 'meghfashion',
    facebookPage: 'facebook.com/meghfashion',
  });
});

test('4.1 + 4.4: top-up offers ৳10 to ৳100 inside the live bounds, and says which amounts are allowed', async ({
  page,
}) => {
  await mockApi(page, { language: 'en' });
  await page.route(
    (url) => url.pathname === '/api/v1/balance',
    (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({
          amount: '412.50',
          held: '0.00',
          frozen: false,
          topUpMin: 20,
          topUpMax: 50,
          feesThisMonth: '612.00',
        }),
      }),
  );
  await page.goto(`/${SLUG}/balance?topup=1`);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: '৳20', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '৳50', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '৳10', exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: '৳100', exact: true })).toHaveCount(0);
  await expect(sheet.getByText(/SMS/)).toHaveCount(0);
  await sheet.getByLabel('Amount').fill('500');
  await expect(sheet.getByText('Select an amount between 20 and 50 taka.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /payment page/ })).toBeDisabled();
  await sheet.getByRole('button', { name: '৳20', exact: true }).click();
  await expect(sheet.getByText('Select an amount between 20 and 50 taka.')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /payment page · ৳20/ })).toBeEnabled();
});

test('4.2: an add-on is bought in any number; past ten the server prices it', async ({ page }) => {
  await open(page, '/addons');
  const asked: string[] = [];
  await page.route(
    (url) => url.pathname === '/api/v1/addons/price',
    (route: Route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({ quantity: 12, amount: 1188, uses: null }),
      });
    },
  );
  await main(page)
    .locator('div')
    .filter({ has: page.getByText('Extra 500 products', { exact: true }) })
    .last()
    .getByRole('button', { name: 'Buy' })
    .click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox', { name: 'How many' }).fill('12');
  await expect(sheet.getByRole('button', { name: /৳1,188$/ })).toBeEnabled();
  await expect(sheet.getByRole('button', { name: 'How many +' })).toBeEnabled();
  expect(asked).toContain('?addonId=a-products&quantity=12');
});

test('4.3 + 5.1 + 5.2: the plan cards, the shop’s own marked; no sideways scroll on a desktop, a swipe on a phone', async ({
  page,
}, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, '/plan');
  const grid = page.getByTestId('plan-grid');
  const mine = grid.locator('article[data-mine]');
  await expect(mine).toHaveAttribute('aria-label', 'Starter');
  await expect(mine.getByText('Your plan')).toBeVisible();
  await expect(mine.getByText('You are on this plan')).toBeVisible();
  await expect(grid.locator('article')).toHaveCount(4);
  const pageScrolls = await main(page).evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );
  expect(pageScrolls).toBe(false);
  const gridScrolls = await grid.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(gridScrolls).toBe(info.project.name === 'phone');
});

test('5.3: Plan, Billing and Usage have their own rows on the Menu, and lead its side column', async ({
  page,
}, info) => {
  await open(page, '/menu');
  for (const [name, path] of [
    ['Plan', 'plan'],
    ['Billing', 'billing'],
    ['Usage', 'usage'],
  ] as const) {
    await expect(main(page).getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute(
      'href',
      `/${SLUG}/${path}`,
    );
  }
  if (info.project.name === 'desktop') {
    const column = page.getByRole('navigation', { name: 'This hub’s pages' });
    await expect(column.getByRole('link').first()).toHaveText('Plan');
  }
});
