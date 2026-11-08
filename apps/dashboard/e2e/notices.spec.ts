import { expect, test, type Page } from '@playwright/test';
import { mockApi, SLUG, type ApiLog, type ShopState } from './support/mock-api';
import { DRAWN_BELL, type NoticesFixture } from './support/phase7';

// TENANT-DASHBOARD-DESIGN §7.40, Phase 7 Slice 7.7 (Part 37): Lytro's notices -- Notices in Menu with its count, the board
// pinned first with its categories and search, a notice with "I understand" for the owner only, a notice only in the other
// language, maintenance's countdown, the marquee closed, the prompt at sign-in, Home's job, a lapsed shop's board -- and the
// bell, its switches, push on this device, each person's language and the bounced email. Against a mocked API, on a phone
// and a desktop.

const main = (page: Page) => page.getByRole('main');

async function open(page: Page, path: string, state: ShopState = {}): Promise<ApiLog> {
  const log = await mockApi(page, { language: 'en', ...state });
  await page.goto(`/${SLUG}${path}`);
  return log;
}

const drawn = (fixture: NoticesFixture = {}): ShopState => ({ phase7: { notices: fixture } });

test.describe('Notices', () => {
  test('Menu names Notices with its unread count', async ({ page }) => {
    await open(page, '/menu', drawn());
    await expect(main(page).getByRole('link', { name: /Notices/ })).toContainText('3 new');
  });

  test('the board: pinned first, its category and severity, Press "I understand", and each unread', async ({
    page,
  }) => {
    await open(page, '/notices', drawn());
    await expect(main(page).getByText('3 unread')).toBeVisible();
    const rows = main(page).getByRole('link', {
      name: /Updated terms|Maintenance on|SMS rate|Read delivery|never asks|Support is/,
    });
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText('Updated terms: refunds on cash-on-delivery orders');
    await expect(rows.first()).toContainText('Press "I understand"');
    await expect(rows.nth(1)).toContainText('Urgent');
  });

  test('one category, and a search that finds nothing', async ({ page }) => {
    await open(page, '/notices', drawn());
    await main(page).getByRole('button', { name: 'Maintenance', exact: true }).click();
    await expect(main(page).getByRole('link', { name: /Maintenance on 9 November/ })).toBeVisible();
    await expect(main(page).getByRole('link', { name: /Updated terms/ })).toHaveCount(0);
    await main(page).getByRole('button', { name: 'All', exact: true }).click();
    await main(page).getByRole('searchbox').fill('courier');
    await expect(main(page).getByText('No notice matches "courier".')).toBeVisible();
  });

  test('none yet', async ({ page }) => {
    await open(page, '/notices', drawn({ ids: [] }));
    await expect(
      main(page).getByText('No notices from Lytro yet. They show here and in the bell.'),
    ).toBeVisible();
  });

  test('a notice asking for "I understand": the owner presses it once for the shop', async ({
    page,
  }) => {
    const log = await open(page, '/notices/n-policy', drawn());
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(
      'Updated terms: refunds on cash-on-delivery orders',
    );
    await expect(main(page).getByText(/Once read, press "I understand"/)).toBeVisible();
    await expect(main(page).getByRole('link', { name: /lytro.app\/terms/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    await page.getByRole('button', { name: 'I understand' }).click();
    await expect(page.getByText('"I understand" recorded')).toBeVisible();
    expect(log.phase7.acknowledged).toEqual(['n-policy']);
    await expect(page.getByRole('button', { name: 'I understand' })).toHaveCount(0);
  });

  test('to staff the same notice has no button, only that the owner needs to press it', async ({
    page,
  }) => {
    await open(page, '/notices/n-policy', {
      ...drawn(),
      isOwner: false,
      permissions: ['notices:read'],
    });
    await expect(main(page).getByText('The owner needs to press "I understand".')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I understand' })).toHaveCount(0);
  });

  test('only in the other language: said so, in its own words', async ({ page }) => {
    await open(page, '/notices/n-rate', drawn({ onlyIn: 'bn' }));
    await expect(main(page).getByText('This notice is only in Bangla.')).toBeVisible();
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(
      'SMS-এর রেট 15 নভেম্বর থেকে বদলাচ্ছে',
    );
  });

  test('maintenance: the countdown on its notice, and the band on every page', async ({ page }) => {
    await open(page, '/notices/n-maint', drawn());
    await expect(main(page).getByText('Starts in')).toBeVisible();
    await page.goto(`/${SLUG}/orders`);
    await expect(page.getByRole('link', { name: 'Details' })).toBeVisible();
  });

  test('urgent: the marquee, closed for good with a toast', async ({ page }) => {
    const log = await open(page, '', drawn({ marquee: true }));
    await expect(
      page.getByText('Maintenance on 9 November, 2:00 to 3:00 am').first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByText('Closed. It stays on the Notices page.')).toBeVisible();
    expect(log.phase7.dismissed).toEqual(['n-maint']);
  });

  test('important: the prompt at sign-in, Later and Read it', async ({ page }) => {
    await open(page, '', drawn({ prompt: true }));
    const prompt = page.getByRole('dialog');
    await expect(prompt).toContainText('Updated terms: refunds on cash-on-delivery orders');
    await prompt.getByRole('button', { name: 'Read it' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/notices/n-policy$`));
  });

  test('Home\'s queue starts with the notice waiting for the owner\'s "I understand"', async ({
    page,
  }) => {
    await open(page, '', drawn());
    const job = main(page).getByRole('link', { name: /1 notice needs your "I understand"/ });
    await expect(job).toBeVisible();
    await job.click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/notices/n-policy$`));
  });

  test('a locked shop: the owner still reaches the board from Renew', async ({ page }) => {
    await open(page, '/renew', { ...drawn(), state: 'locked', periodEndDays: -10 });
    const row = page.getByRole('link', { name: /Notices from Lytro/ });
    await expect(row).toContainText('3 unread · readable while the shop is locked');
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/notices$`));
    await expect(page.getByText('Updated terms: refunds on cash-on-delivery orders')).toBeVisible();
  });
});

test.describe('The bell', () => {
  test('its badge, Today and Earlier, Mark all read, and See all', async ({ page }) => {
    const log = await open(page, '', { phase7: { bell: DRAWN_BELL } });
    const bell = page.getByRole('button', { name: /Notifications · 4 new/ }).first();
    await bell.click();
    const panel = page.getByRole('dialog', { name: /Notifications/ });
    await expect(panel.getByText('Today', { exact: true })).toBeVisible();
    await expect(panel.getByText('Earlier', { exact: true })).toBeVisible();
    await expect(panel.getByText('New order 261107-0052')).toBeVisible();
    await panel.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByText('All read', { exact: true })).toBeVisible();
    expect(
      log.calls.some((call) => call.method === 'POST' && call.path === '/notifications/read'),
    ).toBe(true);
    await panel.getByRole('link', { name: 'See all' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/notifications$`));
  });

  test('nothing yet', async ({ page }) => {
    await open(page, '');
    await page.getByRole('button', { name: 'Notifications', exact: true }).first().click();
    await expect(page.getByText('Nothing yet')).toBeVisible();
  });

  test('a row opens where it leads', async ({ page }) => {
    await open(page, '', { phase7: { bell: DRAWN_BELL } });
    await page
      .getByRole('button', { name: /Notifications · 4 new/ })
      .first()
      .click();
    await page.getByText('From Lytro: The SMS rate changes on 15 November').click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/notices/n-rate$`));
  });
});

test.describe('Notifications settings', () => {
  test('a switch covers the bell and push; money and account are always on', async ({ page }) => {
    const log = await open(page, '/settings/notifications');
    await expect(main(page).getByText('Always on').first()).toBeVisible();
    await main(page).getByRole('switch', { name: 'Low stock' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(log.phase7.prefs).toEqual(['low_stock']);
    await expect(main(page).getByText("Push isn't set up on this server yet.")).toBeVisible();
  });

  test('staff: only the kinds their role hears, and no email card', async ({ page }) => {
    await open(page, '/settings/notifications', { isOwner: false, permissions: ['orders:read'] });
    await expect(
      main(page).getByText('Only news of what your role can see reaches you.'),
    ).toBeVisible();
    await expect(main(page).getByRole('switch')).toHaveCount(4);
    await expect(main(page).getByRole('heading', { name: 'Email' })).toHaveCount(0);
  });

  test('Settings lists SMS, Notifications and the fake order check', async ({ page }) => {
    await open(page, '/settings');
    for (const name of ['SMS', 'Notifications', 'Fake order check']) {
      await expect(main(page).getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
  });
});

test.describe('Account', () => {
  test('the language tells the server too, so email and push follow', async ({ page }) => {
    const log = await open(page, '/account');
    await expect(main(page).getByText('Email and push come in this language.')).toBeVisible();
    await main(page).getByRole('button', { name: 'বাংলা' }).click();
    await expect(page.getByText('সেভ হয়েছে', { exact: false })).toBeVisible();
    expect(log.phase7.language).toBe('bn');
  });

  test('a bounced email: the banner on every page, and its row on Account', async ({ page }) => {
    await open(page, '', { phase7: { bounced: true }, money: { hasEmail: true } });
    await expect(page.getByText(/Email to you isn't arriving/)).toBeVisible();
    await page.getByRole('link', { name: 'Fix email' }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/account$`));
    await expect(
      main(page).getByText('Not arriving · Lytro has stopped emailing it'),
    ).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Change email' })).toBeVisible();
  });
});
