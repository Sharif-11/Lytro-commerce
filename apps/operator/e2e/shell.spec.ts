import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { CODE, EMAIL, mockApi, paymentsOf, PASSWORD } from './support/mock-api';

// OPERATOR-CONSOLE-DESIGN §1: the frame around every screen. On a desktop the sidebar and the top bar; on a phone the ink
// band, the four tabs and the More sheet.

function isPhone(): boolean {
  return test.info().project.name === 'phone';
}

function sidebar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Console' });
}

function tabs(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main tabs' });
}

const DESTINATIONS = [
  ['Today', '/'],
  ['Payment queue', '/queue'],
  ['Page reports', '/page-reports'],
  ['Shops', '/shops'],
  ['Plans and prices', '/plans'],
  ['Billing terms', '/billing-terms'],
  ['Rates', '/rates'],
  ['Add-ons', '/addons'],
  ['Settings', '/settings'],
  ['Platform wallets', '/wallets'],
  ["Lytro's phones", '/phones'],
  ['Couriers', '/couriers'],
  // Slice 7.7: Notices left Later for Platform, as the sketch's v5 draws it.
  ['Notices', '/notices'],
  ['Shop types', '/catalogue/shop-types'],
  ['Attribute library', '/catalogue/attributes'],
  ['Option sets', '/catalogue/option-sets'],
  ['Reports', '/reports'],
  ['Audit log', '/audit'],
  ['Support inbox', '/inbox'],
  ['Verification', '/verification'],
  ['Manual payments', '/manual'],
] as const;

test.describe('on a desktop', () => {
  test.skip(() => isPhone(), 'The sidebar and top bar are from 1024 px');

  test('lists every destination in its group, in the order drawn, with who is signed in', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(sidebar(page).getByRole('link')).toHaveCount(DESTINATIONS.length);
    for (const group of ['DAILY', 'PRICING', 'PLATFORM', 'CATALOGUE', 'LATER']) {
      await expect(
        sidebar(page).getByText(group.charAt(0) + group.slice(1).toLowerCase(), { exact: true }),
      ).toBeVisible();
    }
    const names = await sidebar(page).getByRole('link').allInnerTexts();
    expect(names.map((name) => name.split('\n')[0])).toEqual(DESTINATIONS.map(([label]) => label));
    await expect(page.getByRole('complementary').getByText(EMAIL)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  });

  test('opens each destination, and marks where you are', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    for (const [label, path] of DESTINATIONS) {
      const link = sidebar(page).getByRole('link', { name: new RegExp(`^${label}`) });
      await link.click();
      await expect(page).toHaveURL(path);
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveCount(1);
    }
  });

  test('counts what is waiting on the queue and the page reports, and nothing else', async ({
    page,
  }) => {
    await mockApi(page, { queue: 3, reports: 2 });
    await page.goto('/');
    await expect(sidebar(page).getByRole('link', { name: 'Payment queue' })).toHaveText(
      /Payment queue\s*3/,
    );
    await expect(sidebar(page).getByRole('link', { name: 'Page reports' })).toHaveText(
      /Page reports\s*2/,
    );
    await expect(sidebar(page).getByRole('link', { name: 'Shops' })).toHaveText('Shops');
  });

  test('keeps the counts current while the console sits open', async ({ page }) => {
    await page.clock.install();
    const log = await mockApi(page, { queue: 3, ownClock: true });
    await page.goto('/');
    const queue = sidebar(page).getByRole('link', { name: /^Payment queue/ });
    await expect(queue).toHaveText(/Payment queue\s*3/);
    log.state.payments = paymentsOf(5);
    await page.clock.runFor(60_000);
    await expect(queue).toHaveText(/Payment queue\s*5/);
  });

  test('a new screen starts at its top', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 420 });
    await mockApi(page);
    await page.goto('/reports');
    const screen = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await screen.evaluate((element) => {
      element.scrollTop = 300;
    });
    await sidebar(page)
      .getByRole('link', { name: /^Audit log/ })
      .click();
    await expect(page).toHaveURL('/audit');
    await expect.poll(() => screen.evaluate((element) => element.scrollTop)).toBe(0);
  });

  test("what one operator read isn't shown to the next on this browser", async ({ page }) => {
    let answer = (): void => undefined;
    const log = await mockApi(page);
    await page.goto('/');
    const foot = page.getByRole('complementary');
    await expect(foot.getByText(EMAIL)).toBeVisible();
    await foot.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/sign-in');

    log.state.holdMe = new Promise((resolve) => {
      answer = resolve;
    });
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Code').fill(CODE);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');
    await expect(foot.getByText(EMAIL)).toHaveCount(0);
    answer();
    await expect(foot.getByText(EMAIL)).toBeVisible();
  });

  test('shows no count when nothing is waiting', async ({ page }) => {
    await mockApi(page, { queue: 0, reports: 0 });
    await page.goto('/');
    await expect(sidebar(page).getByText('Payment queue')).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Payment queue' })).toHaveText(
      'Payment queue',
    );
    await expect(sidebar(page).getByRole('link', { name: 'Page reports' })).toHaveText(
      'Page reports',
    );
  });

  test('marks later work "soon"', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    for (const label of ['Reports', 'Audit log', 'Manual payments']) {
      await expect(
        sidebar(page).getByRole('link', { name: new RegExp(`^${label}`) }),
      ).toContainText('soon');
    }
    await expect(sidebar(page).getByRole('link', { name: 'Rates' })).not.toContainText('soon');
  });

  test('"/" goes to the search from anywhere, and a search opens Shops with the word', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/rates');
    await expect(page.getByRole('heading', { name: 'Rates' })).toBeVisible();
    const search = page.getByRole('banner').filter({ visible: true }).getByRole('searchbox');
    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await search.fill('megh');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/shops?q=megh');
    await expect(page.getByRole('main').getByRole('searchbox')).toHaveValue('megh');
  });

  test('a search sent while Shops is open changes what it searches for', async ({ page }) => {
    await mockApi(page);
    await page.goto('/shops?q=megh');
    await expect(page.getByRole('main').getByRole('searchbox')).toHaveValue('megh');
    await page.getByRole('banner').filter({ visible: true }).getByRole('searchbox').fill('rumi');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/shops?q=rumi');
    await expect(page.getByRole('main').getByRole('searchbox')).toHaveValue('rumi');
  });

  test('"/" types into a field already being typed in', async ({ page }) => {
    await mockApi(page);
    await page.goto('/shops');
    const field = page.getByRole('main').getByRole('searchbox');
    await field.click();
    await page.keyboard.type('a/b');
    await expect(field).toHaveValue('a/b');
  });

  test('tabbing past the search leaves the screen alone', async ({ page }) => {
    await mockApi(page);
    await page.goto('/rates');
    await page.getByRole('banner').filter({ visible: true }).getByRole('searchbox').focus();
    await expect(page).toHaveURL('/rates');
  });

  test('says which deployment this is, and switches the language', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByText('local', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'বাংলা' }).click();
    await expect(page.getByRole('heading', { name: 'আজ' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'কনসোল' }).getByText('প্রতিদিন'),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'আজ' })).toBeVisible();
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  });

  test('opens the account and signs out from the foot', async ({ page }) => {
    const log = await mockApi(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Open', exact: true }).click();
    await expect(page).toHaveURL('/account');
    await page.getByRole('complementary').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/sign-in');
    expect(log.calls.some((call) => call.path === '/auth/operator/signout')).toBe(true);
  });
});

test.describe('on a phone', () => {
  test.skip(() => !isPhone(), 'The band and tabs are under 1024 px, the tabs under 640 px');

  test('has the ink band and four tabs, with the queue count on its tab', async ({ page }) => {
    await mockApi(page, { queue: 3 });
    await page.goto('/');
    await expect(page.getByRole('banner').getByText('OPERATOR')).toBeVisible();
    await expect(page.getByRole('banner').getByRole('img', { name: 'Lytro' })).toBeVisible();
    await expect(tabs(page).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(tabs(page).getByRole('link', { name: /Payment queue/ })).toContainText('3');
    await expect(tabs(page).getByRole('link', { name: 'Shops' })).toBeVisible();
    await expect(tabs(page).getByRole('button', { name: 'More' })).toBeVisible();
    await expect(sidebar(page)).toBeHidden();
  });

  test('names the section in the band, and its search opens Shops', async ({ page }) => {
    await mockApi(page);
    await page.goto('/rates');
    await expect(page.getByRole('banner').getByText('Rates')).toBeVisible();
    await page.getByRole('link', { name: 'Find a shop' }).click();
    await expect(page).toHaveURL('/shops');
  });

  test('More lists every destination, the account, the language and sign-out', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await tabs(page).getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet.getByRole('link')).toHaveCount(DESTINATIONS.length + 1);
    await expect(sheet.getByRole('link', { name: /Account/ })).toContainText(EMAIL);
    await sheet.getByRole('link', { name: 'Billing terms' }).click();
    await expect(page).toHaveURL('/billing-terms');
    await expect(sheet).toBeHidden();
  });

  test('the band opens the same sheet; its language row and sign-out work', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    const english = page.getByRole('dialog', { name: 'More' });
    await english.getByRole('button', { name: 'বাংলা' }).click();
    const bangla = page.getByRole('dialog', { name: 'আরও' });
    await expect(bangla.getByRole('link', { name: 'পেমেন্ট কিউ' })).toBeVisible();
    await bangla.getByRole('button', { name: 'সাইন আউট' }).click();
    await expect(page).toHaveURL('/sign-in');
  });

  test('closes with its X and with a tap outside it, the screen underneath unchanged', async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/rates');
    await tabs(page).getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL('/rates');
  });

  test('"/" on a keyboard leaves an open sheet alone', async ({ page }) => {
    await mockApi(page);
    await page.goto('/rates');
    await tabs(page).getByRole('button', { name: 'More' }).click();
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
    await expect(page).toHaveURL('/rates');
  });

  test('"/" on a keyboard goes to Shops, where the search is', async ({ page }) => {
    await mockApi(page);
    await page.goto('/rates');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Rates' })).toBeVisible();
    await page.keyboard.press('/');
    await expect(page).toHaveURL('/shops');
  });

  test('no screen scrolls sideways', async ({ page }) => {
    await mockApi(page);
    for (const [, path] of DESTINATIONS) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Main tabs' })).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, path).toBeLessThanOrEqual(clientWidth);
    }
  });
});

test('a screen for later names its requirement', async ({ page }) => {
  await mockApi(page);
  await page.goto('/audit');
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
  await expect(page.getByText('Not built yet')).toBeVisible();
  await expect(page.getByText('ADM-08')).toBeVisible();
  await expect(page.getByText('Every operator action across all shops')).toBeVisible();
});

test('without a session, every screen goes to sign-in', async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in');
  await page.goto('/account');
  await expect(page).toHaveURL('/sign-in');
});

test('an expired session returns to sign-in, and leaves nothing of it behind', async ({ page }) => {
  await mockApi(page, { expired: true });
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in');
  expect(await page.evaluate(() => sessionStorage.getItem('lytro.operator.csrf'))).toBeNull();
});

test('every read carries the console language, not the browser one', async ({ page }) => {
  const log = await mockApi(page, { language: 'bn' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'আজ' })).toBeVisible();
  expect(log.calls.length).toBeGreaterThan(0);
  expect(new Set(log.calls.map((call) => call.language))).toEqual(new Set(['bn']));
});

test('has no accessibility problems', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
});
